FROM python:3.13-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Cloud Run sets PORT env var (default 8080)
ENV PORT=8080

# Start server — use PORT from env
CMD exec python main.py --port $PORT
