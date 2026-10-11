"""Exact-match accuracy of Egyptian plate OCR on EALPR plate crops."""
import json, os, sys, time
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, ROOT)
os.chdir(ROOT)
import cv2
from ultralytics import YOLO
from app.models.anpr import assemble_plate

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "anpr", "ealpr")
gt = json.load(open(os.path.join(D, "gt.json"), encoding="utf-8"))
NORM = str.maketrans({"ھ": "ه", "ي": "ى", "ا": "أ", "إ": "أ", "آ": "أ"})


def norm(s):
    return s.replace("هـ", "ه").translate(NORM)


def score(name, reader):
    ok = okd = okl = 0
    t = 0
    for i, g in gt.items():
        img = cv2.imread(os.path.join(D, i + ".png"))
        t0 = time.time(); r = reader(img); t += time.time() - t0
        gd, gl = g["digits"], norm("".join(g["letters_visual_ltr"]))
        rd = r["digits"] if r else ""
        rl = norm("".join(reversed(r["letters"]))) if r else ""  # ours: reading order (right→left) → visual LTR
        okd += rd == gd; okl += rl == gl; ok += (rd == gd and rl == gl)
    n = len(gt)
    print(f"{name:34s} exact {ok/n:.1%} | digits {okd/n:.1%} | letters {okl/n:.1%} | {1000*t/n:.0f} ms", flush=True)


def ocr_reader(path, conf=0.25):
    m = YOLO(path)
    def read(img):
        o = m(img, conf=conf, iou=0.5, verbose=False)[0]
        chars = [{"box": b, "score": s, "label": m.names[int(c)]} for b, s, c in zip(o.boxes.xyxy.tolist(), o.boxes.conf.tolist(), o.boxes.cls.tolist())]
        return assemble_plate(chars)
    return read


if __name__ == "__main__":
    for p in sys.argv[1:]:
        score(os.path.basename(p), ocr_reader(p))
