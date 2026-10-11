# EGIC AI Engine (Python · FastAPI) — CPU image for Railway / any Docker host
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    YOLO_CONFIG_DIR=/tmp/ultralytics

# OpenCV (headless) runtime libs
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

# CPU-only PyTorch first (the default CUDA wheels are ~2 GB larger)
RUN pip install torch==2.14.1 torchvision==0.29.1 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
# ultralytics pulls opencv-python (needs X11 libs); keep only the headless build
RUN pip install -r requirements.txt && pip uninstall -y opencv-python && pip install --no-deps --force-reinstall opencv-python-headless==5.0.0.93

COPY app ./app

# non-root runtime user
RUN useradd -m -u 10001 egic && mkdir -p /srv/data && chown -R egic /srv/data /tmp
USER egic

# Railway injects PORT; default 8000 locally
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
