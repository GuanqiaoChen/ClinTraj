FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 LANGSMITH_TRACING=false LANGCHAIN_TRACING_V2=false HF_HUB_DISABLE_TELEMETRY=1 DO_NOT_TRACK=1
COPY pyproject.toml requirements.lock ./
COPY clintraj ./clintraj
COPY configs ./configs
RUN pip install --no-cache-dir -r requirements.lock && pip install --no-deps -e .
COPY alembic.ini ./
COPY migrations ./migrations
COPY tests ./tests
COPY scripts ./scripts
CMD ["uvicorn", "clintraj.server.app:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
