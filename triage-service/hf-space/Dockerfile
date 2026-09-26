FROM pytorch/pytorch:2.8.0-cuda12.8-cudnn9-runtime

WORKDIR /app

COPY requirements.txt .
RUN python -m pip install --no-cache-dir -r requirements.txt \
    && useradd --create-home --uid 1000 appuser \
    && mkdir -p /home/appuser/.cache/huggingface \
    && chown -R appuser:appuser /app /home/appuser

COPY --chown=appuser:appuser main.py ./main.py
COPY --chown=appuser:appuser adapter ./adapter

USER appuser

ENV BASE_MODEL_ID=google/gemma-2b-it \
    ADAPTER_PATH=/app/adapter \
    USE_4BIT=true \
    TRIAGE_REQUIRE_AUTH=true \
    HF_HOME=/home/appuser/.cache/huggingface

EXPOSE 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
