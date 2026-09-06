FROM python:3.11.9-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 LANGSMITH_TRACING=false LANGCHAIN_TRACING_V2=false
COPY pyproject.toml requirements.lock ./
COPY clintraj ./clintraj
COPY configs ./configs
RUN pip install --no-cache-dir -r requirements.lock && pip install --no-deps .
RUN useradd --create-home researcher && chown -R researcher:researcher /app
USER researcher
ENTRYPOINT ["python", "-m", "clintraj"]
CMD ["demo", "--decision", "reject"]
