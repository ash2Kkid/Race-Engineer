FROM python:3.10-slim

WORKDIR /app

# Install build dependencies if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy all files (including backend cache)
COPY . .

# Expose port 7860 (Hugging Face Spaces default port)
EXPOSE 7860

# Run uvicorn pointing to the main app inside backend folder
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860"]
