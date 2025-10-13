# Base image
FROM python:3.11-slim

# Set workdir
WORKDIR /app

# System deps for scientific/python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    git \
    libgl1 \
    ghostscript \
    && rm -rf /var/lib/apt/lists/*

ENV PIP_NO_CACHE_DIR=1
RUN python -m pip install --upgrade pip setuptools wheel

# Preinstall heavy wheels explicitly to ensure binary wheels are used
RUN python -m pip install --index-url https://download.pytorch.org/whl/cpu torch==2.5.1
RUN python -m pip install --only-binary=:all: faiss-cpu==1.7.4 numpy==2.3.3 scipy==1.16.2 scikit-learn==1.7.2 PyMuPDF==1.26.4 pillow==11.0.0

# Copy and install the rest of dependencies
COPY requirements.txt ./
RUN python -m pip install -r requirements.txt

# Copy app code
COPY . .

# Expose port
EXPOSE 8000

# Run FastAPI server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
