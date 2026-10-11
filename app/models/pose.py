"""
Behaviour AI — YOLO26n-pose (17 COCO keypoints): SOS gesture, fall, ergonomic risk.
Rules mirror the EGIC browser runtime (js/ai.js → analyzePose).
"""
import math
from typing import List, Optional

import numpy as np
from ultralytics import YOLO

POSE_WEIGHTS = "app/weights/pose_yolo26n.pt"


class PoseAnalyzer:
    def __init__(self, model_path: str = POSE_WEIGHTS, conf_thresh: float = 0.45):
        self.model_path = model_path
        self.conf_thresh = conf_thresh
        self.model: Optional[YOLO] = None

    def load_model(self) -> None:
        self.model = YOLO(self.model_path)

    def predict(self, frame: np.ndarray) -> List[dict]:
        if self.model is None:
            self.load_model()
        r = self.model(frame, conf=self.conf_thresh, verbose=False, max_det=6)[0]
        out = []
        if r.keypoints is None:
            return out
        kp = r.keypoints.data.tolist()  # [n, 17, 3]
        for box, score, k in zip(r.boxes.xyxy.tolist(), r.boxes.conf.tolist(), kp):
            person = {"box": [round(v, 1) for v in box], "score": round(score, 3), "kpts": [[round(a, 1), round(b, 1), round(c, 3)] for a, b, c in k]}
            person["analysis"] = self.analyze(person)
            out.append(person)
        return out

    @staticmethod
    def analyze(p: dict) -> dict:
        k = p["kpts"]

        def kp(i, min_v=0.45):
            return k[i] if k[i][2] >= min_v else None

        def mid(a, b):
            if a and b:
                return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, min(a[2], b[2])]
            return a or b

        x1, y1, x2, y2 = p["box"]
        nose, ls, rs, lw, rw, le, re, lh, rh = kp(0), kp(5), kp(6), kp(9), kp(10), kp(7), kp(8), kp(11), kp(12)
        sho, hip = mid(ls, rs), mid(lh, rh)
        res = {"sos": False, "fall": False, "trunk_angle": None, "ergo_level": None}

        head_y = nose[1] if nose else (sho[1] - (y2 - y1) * 0.12 if sho else None)
        sho_w = abs(ls[0] - rs[0]) if ls and rs else (x2 - x1) * 0.35
        if head_y is not None:
            up = sum(1 for w in (lw, rw) if w and w[1] < head_y - sho_w * 0.15)
            res["sos"] = up == 2

        if sho and hip:
            res["trunk_angle"] = round(abs(math.degrees(math.atan2(sho[0] - hip[0], hip[1] - sho[1]))))

        bw, bh = x2 - x1, y2 - y1
        if (res["trunk_angle"] is not None and res["trunk_angle"] > 65) or (bw > bh * 1.25 and hip and sho and abs(hip[1] - sho[1]) < bh * 0.35):
            res["fall"] = True

        if res["trunk_angle"] is not None:
            a = res["trunk_angle"]
            score = 1 if a < 10 else 2 if a < 25 else 3 if a < 45 else 4
            if any(s and e and e[1] < s[1] - sho_w * 0.1 for s, e in ((ls, le), (rs, re))):
                score += 1
            res["ergo_level"] = "LOW" if score <= 2 else "MEDIUM" if score <= 3 else "HIGH"
        return res
