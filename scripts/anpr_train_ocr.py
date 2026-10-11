"""Train an Egyptian plate character detector on EALPR (GPU)."""
import os, sys
from ultralytics import YOLO

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "anpr")
base = sys.argv[1] if len(sys.argv) > 1 else "yolo11s.pt"
epochs = int(sys.argv[2]) if len(sys.argv) > 2 else 80
if __name__ == "__main__":
    m = YOLO(base)
    m.train(
        data=os.path.join(HERE, "ealpr_yolo", "data.yaml"), epochs=epochs, imgsz=320, batch=32, device=0, workers=2,
        project=os.path.join(HERE, "runs"), name="eg_ocr_" + os.path.splitext(os.path.basename(base))[0], exist_ok=True,
        # characters must never be mirrored; keep geometry augmentation mild
        fliplr=0.0, flipud=0.0, mosaic=0.5, degrees=5, shear=3, perspective=0.0005, scale=0.3, translate=0.08,
        hsv_h=0.02, hsv_s=0.5, hsv_v=0.4, close_mosaic=15, patience=30, cos_lr=True, plots=False, verbose=False,
    )
