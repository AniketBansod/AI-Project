# Lightweight CPU-only build for GitHub Actions
FROM python:3.11-slim

WORKDIR /app

# Install minimal system deps for scientific + PDF packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libgomp1 \
    ghostscript \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Disable pip cache to reduce disk usage
ENV PIP_NO_CACHE_DIR=1
RUN python -m pip install --upgrade pip setuptools wheel

# ✅ Install PyTorch CPU wheel explicitly from official index
RUN python -m pip install --index-url https://download.pytorch.org/whl/cpu torch==2.5.0

# ✅ Preinstall heavy binary-only wheels to avoid source compilation
# NOTE: Use NumPy 1.x because FAISS wheels in our environment are built against NumPy 1 API
RUN python -m pip install --only-binary=:all: \
    faiss-cpu==1.8.0 \
    numpy==1.26.4 \
    scipy==1.16.2 \
    scikit-learn==1.7.2 \
    PyMuPDF==1.26.4 \
    pillow==11.0.0

# Copy requirements and install the remaining deps
COPY requirements.txt ./
RUN python -m pip install --no-cache-dir --no-build-isolation -r requirements.txt

# Copy your application code
COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
