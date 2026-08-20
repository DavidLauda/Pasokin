FROM python:3.11-slim

WORKDIR /app

# Dependensi sistem buat torch/bitsandbytes
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
# Adapter hasil training (adapter_model.safetensors, adapter_config.json, tokenizer files)
# ditaruh di folder ./adapter sebelum build, atau di-mount lewat volume saat runtime.
COPY adapter ./adapter

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
