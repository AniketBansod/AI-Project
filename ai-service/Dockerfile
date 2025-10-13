# Base image
FROM pytorch/pytorch:2.5.1-cpu

# Set workdir
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    ghostscript \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

ENV PIP_NO_CACHE_DIR=1
RUN python -m pip install --upgrade pip setuptools wheel

# Copy and install dependencies (torch is already included in base image)
COPY requirements.txt ./
RUN python -m pip install -r requirements.txt

# Copy app code
COPY . .

# Expose port
EXPOSE 8000

# Run FastAPI server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
