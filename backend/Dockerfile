FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies (needed for numpy, pandas, scipy, matplotlib)
RUN apt-get update && apt-get install -y \
    build-essential \
    gfortran \
    libopenblas-dev \
    liblapack-dev \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (to leverage Docker cache)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Hugging Face optimization (optional but nice)
ENV HF_HUB_ENABLE_HF_TRANSFER=1
ENV HF_HUB_CACHE=/app/.cache/huggingface
ENV MPLCONFIGDIR=/tmp/matplotlib_cache
RUN mkdir -p /tmp/matplotlib_cache && chmod 777 /tmp/matplotlib_cache


# Copy app code and resources
COPY protein_map_outputs ./protein_map_outputs
COPY . .

# Expose FastAPI port
EXPOSE 8001

# Start FastAPI with uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]



