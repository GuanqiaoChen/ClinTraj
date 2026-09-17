FROM python:3.11-slim
WORKDIR /app
ENV HF_HUB_DISABLE_TELEMETRY=1 DO_NOT_TRACK=1 TOKENIZERS_PARALLELISM=false OMP_NUM_THREADS=4
RUN pip install --no-cache-dir torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir FlagEmbedding==1.3.5 transformers==4.51.3 peft==0.15.2 fastapi==0.135.1 uvicorn==0.42.0
COPY clintraj /app/clintraj
CMD ["uvicorn", "clintraj.server.retrieval_inference:app", "--host", "0.0.0.0", "--port", "8010", "--no-access-log"]
