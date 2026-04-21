# Multi-stage Dockerfile for FMCG Reconciliation AI
# Optimized for production with minimal image size and security best practices

# ==================== Builder Stage ====================
FROM python:3.11-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ==================== Production Stage ====================
FROM python:3.11-slim as production

# Security: Run as non-root user
RUN groupadd --gid 1000 appgroup && \
    useradd --uid 1000 --gid appgroup --shell /bin/bash --create-home appuser

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application code
COPY --chown=appuser:appgroup \
    api.py \
    app.py \
    config.py \
    requirements.txt \
    ./

COPY --chown=appuser:appgroup src/ ./src/
COPY --chown=appuser:appgroup utils/ ./utils/
COPY --chown=appuser:appgroup data/ ./data/

# Copy example env file
COPY --chown=appuser:appgroup .env.example ./.env.example

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health', timeout=5)" || exit 1

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Default command (API server)
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]

# ==================== Development Stage ====================
FROM production as development

# Install development tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Switch back to root for installing dev tools, then back to appuser
USER root
RUN pip install --no-cache-dir pytest pytest-cov pytest-asyncio black ruff mypy

USER appuser

# Enable reload for development
ENV DEBUG=true

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
