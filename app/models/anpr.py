"""
Egyptian ANPR — plate detector + an ensemble of character recognisers.

Benchmarked on 300 held-out EALPR plates (exact full-plate match) and 23 independent Egyptian car photos
(see docs/MODEL_SELECTION.md). Every recogniser's character boxes are pooled and voted per position,
then assembled with the Egyptian plate layout: up to 4 digits on the left, up to 3 Arabic letters on the right
(same logic as js/ai.js → assemblePlate).
"""
from typing import List, Optional

import numpy as np
from ultralytics import YOLO

PLATE_WEIGHTS = "app/weights/anpr_plate_yolo11n.pt"
# (weights, vote weight): EGIC-trained model 92.3% alone · weighted ensemble 92.7% exact on 300 held-out plates
OCR_WEIGHTS = (("app/weights/anpr_ocr_egic_yolo11s.pt", 2.0), ("app/weights/anpr_ocr_a482_yolov8s.pt", 1.0),
               ("app/weights/anpr_ocr_elsayed_yolo11n.pt", 1.0))

# latin class name → Egyptian plate letter (17-letter alphabet)
AR = {"aain": "ع", "ain": "ع", "alf": "أ", "baa": "ب", "dal": "د", "faa": "ف", "geem": "ج", "haa": "هـ", "kaf": "ق",
      "lam": "ل", "meem": "م", "non": "ن", "raa": "ر", "sad": "ص", "sen": "س", "taa": "ط", "waaw": "و", "yaa": "ى", "zen": "ر",
      # 38-class recognisers (alif … zay): non-Egyptian look-alikes map to the Egyptian letter they are confused with
      "alif": "أ", "daal": "د", "jeem": "ج", "kaaf": "ق", "qaaf": "ق", "laam": "ل", "noon": "ن", "saad": "ص", "seen": "س",
      "waw": "و", "Taa": "ط", "Thaa": "ط", "7aa": "ج", "khaa": "ج", "daad": "ص", "ghayn": "ع", "sheen": "س", "thaa": "ب",
      "zaal": "د", "zay": "ر"}
AR_DIGITS = "٠١٢٣٤٥٦٧٨٩"


def _iou(a, b):
    x1, y1, x2, y2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / u if u > 0 else 0


def assemble_plate(chars: List[dict], n_models: int = 1) -> Optional[dict]:
    """chars: pooled boxes from `n_models` recognisers (votes are summed per position)."""
    items = []
    for d in chars:
        lab = d["label"]
        if lab.isdigit():
            items.append({**d, "kind": "digit", "ch": AR_DIGITS[int(lab)]})
        elif lab in AR:
            items.append({**d, "kind": "letter", "ch": AR[lab]})
    if not items:
        return None
    hs = sorted(d["box"][3] - d["box"][1] for d in items)
    med = hs[len(hs) // 2]
    items = [d for d in items if d["box"][3] - d["box"][1] > med * 0.55]  # drop the small "مصر EGYPT" band
    items.sort(key=lambda d: d["box"][0] + d["box"][2])

    clusters = []
    for d in items:
        b = d["box"]
        c = next((c for c in clusters if _iou(c["box"], b) > 0.35 or abs((c["box"][0] + c["box"][2]) / 2 - (b[0] + b[2]) / 2) < (b[2] - b[0]) * 0.35), None)
        if c is None:
            c = {"box": list(b), "votes": {}}
            clusters.append(c)
        key = (d["kind"], d["ch"])
        c["votes"][key] = c["votes"].get(key, 0) + d["score"]
        c["box"] = [min(c["box"][0], b[0]), min(c["box"][1], b[1]), max(c["box"][2], b[2]), max(c["box"][3], b[3])]
    clusters.sort(key=lambda c: c["box"][0] + c["box"][2])

    def best(c, kind):
        cand = [(v, ch) for (k, ch), v in c["votes"].items() if k == kind]
        return max(cand) if cand else (0, None)

    # split point: digits left of k, letters from k — maximise total evidence
    split = max(range(len(clusters) + 1), key=lambda k: sum(best(c, "digit" if i < k else "letter")[0] for i, c in enumerate(clusters)))
    digits, letters, conf = [], [], []
    for i, c in enumerate(clusters):
        v, ch = best(c, "digit" if i < split else "letter")
        if not ch or v < 0.2:
            continue
        (digits if i < split else letters).append(ch)
        conf.append(min(1.0, v / n_models))
    digits, letters = digits[:4], letters[-3:]
    if not digits and not letters:
        return None
    letters_read = list(reversed(letters))  # rightmost letter is read first
    return {
        "text": " ".join(letters_read) + ("  " + "".join(digits) if digits else ""),
        "letters": letters_read,
        "digits": "".join(digits),
        "conf": round(sum(conf) / len(conf), 2) if conf else 0,
        "valid": 1 <= len(digits) <= 4 and 1 <= len(letters) <= 3,
    }


class EgyptianANPR:
    def __init__(self, plate_path: str = PLATE_WEIGHTS, ocr_paths=OCR_WEIGHTS):
        self.plate_path = plate_path
        self.ocr_paths = tuple(p for p, _ in ocr_paths)
        self.ocr_weights = tuple(w for _, w in ocr_paths)
        self.plate_model: Optional[YOLO] = None
        self.ocr_models: List[YOLO] = []

    def load_model(self) -> None:
        self.plate_model = YOLO(self.plate_path)
        self.ocr_models = [YOLO(p) for p in self.ocr_paths]

    def read_crop(self, crop: np.ndarray) -> Optional[dict]:
        chars = []
        for m, w in zip(self.ocr_models, self.ocr_weights):
            o = m(crop, conf=0.25, iou=0.5, verbose=False)[0]
            chars += [{"box": b, "score": s * w, "label": m.names[int(c)]}
                      for b, s, c in zip(o.boxes.xyxy.tolist(), o.boxes.conf.tolist(), o.boxes.cls.tolist())]
        return assemble_plate(chars, n_models=sum(self.ocr_weights))

    def read(self, frame: np.ndarray, max_plates: int = 3) -> List[dict]:
        if self.plate_model is None:
            self.load_model()
        r = self.plate_model(frame, conf=0.35, verbose=False)[0]
        plates = sorted(zip(r.boxes.xyxy.tolist(), r.boxes.conf.tolist()), key=lambda x: -x[1])[:max_plates]
        out = []
        h, w = frame.shape[:2]
        for box, score in plates:
            x1, y1, x2, y2 = box
            px, py = (x2 - x1) * 0.06, (y2 - y1) * 0.12
            crop = frame[max(0, int(y1 - py)):min(h, int(y2 + py)), max(0, int(x1 - px)):min(w, int(x2 + px))]
            if crop.size == 0:
                continue
            reading = self.read_crop(crop)
            out.append({"box": [round(v, 1) for v in box], "score": round(score, 3), "reading": reading})
        return out
