# Use official PyTorch CPU image (already includes torch + deps)
# Note: 2.5.1-cpu tag is not available on Docker Hub; 2.5.0-cpu is.
FROM pytorch/pytorch:2.5.0-cpu

# Set working directory
WORKDIR /app

# Minimal system deps for FAISS / PyMuPDF rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libgomp1 \
    ghostscript \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Keep image small
ENV PIP_NO_CACHE_DIR=1
RUN python -m pip install --upgrade pip setuptools wheel

# Pre-install heavy binary wheels explicitly
RUN pip install --no-cache-dir --only-binary=:all: \
    faiss-cpu==1.8.0 \
    numpy==2.3.3 \
    scipy==1.16.2 \
    scikit-learn==1.7.2 \
    PyMuPDF==1.26.4 \
    pillow==11.0.0

# Copy requirements and install remaining deps
COPY requirements.txt ./
RUN pip install --no-cache-dir --no-build-isolation -r requirements.txt

# Copy app code
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Launch FastAPI server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
