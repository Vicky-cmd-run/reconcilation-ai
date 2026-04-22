"""
Production-ready FastAPI API for FMCG Reconciliation.
Includes proper validation, security, health checks, and monitoring.
"""
import io
import time
import logging
import asyncio
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager

import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from config import get_settings
from src.matcher import find_mismatches, get_mismatch_statistics
from src.analyzer import analyze_mismatch_async, get_cache_stats, clear_cache

logger = logging.getLogger(__name__)
settings = get_settings()


# ==================== Lifespan Context ====================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown events."""
    # Startup
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"Debug mode: {settings.DEBUG}")
    logger.info(f"LLM cache enabled: {settings.LLM_CACHE_ENABLED}")

    if not settings.is_api_key_configured():
        logger.warning("Gemini API key not configured. Using fallback analysis.")

    yield

    # Shutdown
    logger.info("Shutting down application")
    clear_cache()


# ==================== App Initialization ====================

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI-powered FMCG reconciliation API with explainable mismatch detection",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan
)

# ==================== Middleware ====================

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["X-Request-ID"],
)

# Security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add security headers to all responses."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all requests with timing."""
    request_id = f"{time.time()}-{id(request)}"
    start_time = time.time()

    logger.info(f"Request started: {request.method} {request.url.path} [ID: {request_id}]")

    response = await call_next(request)

    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    response.headers["X-Request-ID"] = request_id

    logger.info(
        f"Request completed: {request.method} {request.url.path} "
        f"[ID: {request_id}] [{process_time:.3f}s] [Status: {response.status_code}]"
    )

    return response


# ==================== Request/Response Models ====================

class ReconciliationResponse(BaseModel):
    """Response model for reconciliation API."""
    status: str
    message: str
    data: List[Dict[str, Any]] = Field(default_factory=list)
    statistics: Optional[Dict[str, Any]] = None
    cache_stats: Optional[Dict[str, Any]] = None


class HealthResponse(BaseModel):
    """Health check response model."""
    status: str
    version: str
    llm_configured: bool
    cache_enabled: bool
    cache_size: int


# ==================== API Endpoints ====================

@app.get("/", tags=["Root"])
async def root():
    """Root endpoint with API information."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs" if settings.DEBUG else "Disabled in production"
    }


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """
    Health check endpoint for monitoring and load balancers.
    Returns application status and configuration state.
    """
    cache_stats = get_cache_stats()

    return HealthResponse(
        status="healthy",
        version=settings.APP_VERSION,
        llm_configured=settings.is_api_key_configured(),
        cache_enabled=cache_stats.get("enabled", False),
        cache_size=cache_stats.get("size", 0)
    )


@app.get("/health/ready", tags=["Health"])
async def readiness_check():
    """
    Readiness check - returns 503 if not ready to serve traffic.
    """
    if not settings.is_api_key_configured():
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"status": "degraded", "reason": "LLM not configured, using fallback"}
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"status": "ready"}
    )


@app.get("/health/live", tags=["Health"])
async def liveness_check():
    """
    Liveness check - returns 503 if application is stuck.
    """
    return {"status": "alive"}


@app.post(
    "/api/reconcile",
    response_model=ReconciliationResponse,
    tags=["Reconciliation"]
)
async def reconcile_files(
    company_file: UploadFile = File(..., description="Company records CSV file"),
    customer_file: UploadFile = File(..., description="Customer records CSV file"),
):
    """
    Reconcile company and customer records to find mismatches.

    - **company_file**: CSV file with company records (columns: invoice_id, quantity, price)
    - **customer_file**: CSV file with customer records (columns: invoice_id, quantity, price)

    Returns a list of mismatches with AI-powered analysis including:
    - Issue type classification
    - Severity assessment
    - Business reason
    - Suggested action
    - Explainable AI reasoning
    """
    # Validate file extensions
    for file, name in [(company_file, "company"), (customer_file, "customer")]:
        if not file.filename:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{name.capitalize()} file must have a filename"
            )

        if not file.filename.lower().endswith('.csv'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{name.capitalize()} file must be a CSV file"
            )

    try:
        # Read files into pandas (size check done after reading)
        company_content = await company_file.read()
        customer_content = await customer_file.read()

        # Check file size after reading
        if len(company_content) > settings.max_file_size_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_PAYLOAD_TOO_LARGE,
                detail=f"Company file exceeds maximum size of {settings.MAX_FILE_SIZE_MB}MB"
            )
        if len(customer_content) > settings.max_file_size_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_PAYLOAD_TOO_LARGE,
                detail=f"Customer file exceeds maximum size of {settings.MAX_FILE_SIZE_MB}MB"
            )

        company_df = pd.read_csv(io.BytesIO(company_content))
        customer_df = pd.read_csv(io.BytesIO(customer_content))

        # Validate required columns exist
        for df, name in [(company_df, "company"), (customer_df, "customer")]:
            if df.empty:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{name.capitalize()} file is empty"
                )

        # Find mismatches
        mismatches = find_mismatches(company_df, customer_df)

        if not mismatches:
            return ReconciliationResponse(
                status="success",
                message="No mismatches found. Perfect reconciliation!",
                data=[],
                statistics=get_mismatch_statistics([])
            )

        # Analyze mismatches concurrently
        tasks = [analyze_mismatch_async(mismatch) for mismatch in mismatches]
        results = await asyncio.gather(*tasks)

        return ReconciliationResponse(
            status="success",
            message=f"Found {len(mismatches)} mismatches.",
            data=[dict(r) for r in results],
            statistics=get_mismatch_statistics(mismatches),
            cache_stats=get_cache_stats()
        )

    except HTTPException:
        raise
    except pd.errors.EmptyDataError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty or not a valid CSV"
        )
    except pd.errors.ParserError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"CSV parsing error: {str(e)}"
        )
    except Exception as e:
        logger.exception("Unexpected error during reconciliation")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@app.get("/api/cache/stats", tags=["Cache"])
async def cache_statistics():
    """Get LLM response cache statistics."""
    return get_cache_stats()


@app.post("/api/cache/clear", tags=["Cache"])
async def clear_cache_endpoint():
    """Clear the LLM response cache."""
    clear_cache()
    return {"status": "success", "message": "Cache cleared"}


@app.get("/api/statistics", tags=["Statistics"])
async def get_statistics():
    """Get application statistics and configuration."""
    return {
        "app_name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "debug_mode": settings.DEBUG,
        "llm_configured": settings.is_api_key_configured(),
        "llm_model": settings.GEMINI_MODEL,
        "cache_enabled": settings.LLM_CACHE_ENABLED,
        "max_file_size_mb": settings.MAX_FILE_SIZE_MB,
    }


# ==================== Error Handlers ====================

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Custom HTTP exception handler with logging."""
    logger.warning(f"HTTP error {exc.status_code}: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"status": "error", "detail": exc.detail}
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """General exception handler with logging."""
    logger.exception(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"status": "error", "detail": "An unexpected error occurred"}
    )


# ==================== Main Entry Point ====================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower()
    )
