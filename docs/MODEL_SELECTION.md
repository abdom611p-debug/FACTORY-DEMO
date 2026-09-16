# Model Selection

This document details the selected AI models for the Phase 1 AI Engine demo.

## Person & Vehicle Detection
- **Model Name**: YOLOv8n (Nano) / YOLOv8s (Small)
- **Source**: Ultralytics
- **URL**: [Ultralytics YOLOv8](https://github.com/ultralytics/ultralytics)
- **Task**: Object Detection (COCO dataset - Person, Car, Truck, Bus, Motorcycle, etc.)
- **License**: AGPL-3.0
- **Commercial Usability**: **DEMO-ONLY** for closed-source. Requires an Enterprise license from Ultralytics for commercial use if the product is not open-sourced under AGPL.
- **Production Replacement Candidate**: YOLO-NAS (Deci AI) or RT-DETR (Apache-2.0).
- **Input Requirements**: RGB Image (typically 640x640)
- **Output Format**: Bounding boxes `[x1, y1, x2, y2]`, confidence scores, class IDs.
- **CPU Performance Expectation**: Very Fast (Nano model is ~1-5ms per frame on CPU).
- **GPU Performance Expectation**: Ultra Fast.
- **Model Size**: ~6 MB.
- **Accuracy Considerations**: Excellent for general detection; struggles with tiny objects but sufficient for factory floors.
- **Why it was selected**: State-of-the-art performance, ease of integration via the `ultralytics` pip package, built-in tracking capabilities.
- **Alternatives considered**: YOLOv5 (same license), SSD MobileNet (slower/less accurate but Apache 2.0).

## PPE Detection
- **Model Name**: yolov8m-protective-equipment-detection (or similar fine-tuned YOLO)
- **Source**: Hugging Face / keremberke
- **URL**: [HuggingFace PPE Model](https://huggingface.co/keremberke/yolov8m-protective-equipment-detection)
- **Task**: PPE Detection (Helmet, Vest, Gloves, etc.)
- **License**: Usually CC BY-NC 4.0 or similar (Non-Commercial).
- **Commercial Usability**: **DEMO-ONLY**. 
- **Production Replacement Candidate**: Train a custom YOLOv8 model using an open-source dataset (e.g., Roboflow PPE datasets) under a permissive license.
- **Input Requirements**: RGB Image
- **Output Format**: Bounding boxes, confidence, class IDs.
- **Performance Expectation**: Fast.
- **Why it was selected**: Readily available on Hugging Face for quick demonstration of PPE policies.
- **Alternatives considered**: Building a cascade classifier, which is too slow and inaccurate.

## Face Recognition
- **Model Name**: Inception Resnet V1 (FaceNet) / MTCNN for alignment
- **Source**: facenet-pytorch
- **URL**: [facenet-pytorch](https://github.com/timesler/facenet-pytorch)
- **Task**: Face Detection, Alignment, and Embedding Generation
- **License**: MIT (for the code/framework). The training dataset (VGGFace2) has its own restrictions, but generally acceptable for many uses compared to InsightFace.
- **Commercial Usability**: Acceptable for DEMO. 
- **Production Replacement Candidate**: Commercial API (AWS Rekognition, Azure Face) or a legally cleared proprietary model. (Note: InsightFace pretrained weights are strictly non-commercial).
- **Input Requirements**: RGB Image / Cropped Face
- **Output Format**: 512-dimensional embedding vector.
- **Performance Expectation**: Moderate (MTCNN is somewhat slow on CPU, but acceptable for demo).
- **Why it was selected**: Fully open-source framework, easy to integrate via PyTorch.
- **Alternatives considered**: InsightFace (rejected due to strict non-commercial license on pre-trained weights), DeepFace (a wrapper, but relies on underlying models).

## Tracking
- **Model Name**: ByteTrack
- **Source**: Ultralytics YOLOv8 builtin tracker
- **URL**: [ByteTrack](https://github.com/ifzhang/ByteTrack)
- **Task**: Multi-Object Tracking (MOT)
- **License**: MIT
- **Commercial Usability**: Yes, standard MIT license.
- **Input Requirements**: Detections from YOLO
- **Output Format**: Track IDs assigned to bounding boxes.
- **Performance Expectation**: Extremely fast (data association only, no heavy CNN).
- **Why it was selected**: Integrated directly into Ultralytics YOLOv8, saving integration time and offering SOTA tracking.
- **Alternatives considered**: DeepSORT (heavier, requires a ReID model).
