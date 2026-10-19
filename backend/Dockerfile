# Build from the repo root (the API imports `backend.*` and needs ml-model/ and dataset/):
#   docker build -f backend/Dockerfile -t fraudx-api .
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/
COPY ml-model/ ml-model/
COPY dataset/sample_creditcard.csv dataset/

EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
