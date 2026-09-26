---
title: Pasokin Gemma Triage
emoji: 📦
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
---

Pasokin supplier reply triage. The base model is downloaded at runtime; only the fine-tuned `adapter_v2` is packaged with this Space.

Configure Space secrets `HF_TOKEN` and `TRIAGE_SHARED_TOKEN` before starting it. The `POST /triage` endpoint requires the `X-Pasokin-Triage-Token` header. `GET /health` reports model readiness.
