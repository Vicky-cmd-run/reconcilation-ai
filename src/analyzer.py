"""
AI-powered mismatch analyzer with caching, retry logic, and async support.
Uses Google Gemini API with fallback mechanisms for production reliability.
"""
import json
import hashlib
import asyncio
import re
import logging
from typing import Dict, Any, Optional

import pandas as pd
import google.generativeai as genai
from cachetools import TTLCache

from config import get_settings

logger = logging.getLogger(__name__)

# Initialize settings
settings = get_settings()

# Configure Gemini API
if settings.is_api_key_configured():
    genai.configure(api_key=settings.GEMINI_API_KEY)
    generation_config = {
        "temperature": settings.LLM_TEMPERATURE,
        "response_mime_type": "application/json",
    }
    try:
        model = genai.GenerativeModel(
            model_name=settings.GEMINI_MODEL,
            generation_config=generation_config,
        )
    except Exception as e:
        logger.error(f"Failed to initialize Gemini model: {e}")
        model = None
else:
    logger.warning("Gemini API key not configured. Using fallback analysis.")
    model = None

# Response cache: key -> (response, timestamp)
# Using TTLCache for automatic expiration
_response_cache: Optional[TTLCache] = None
if settings.LLM_CACHE_ENABLED:
    _response_cache = TTLCache(
        maxsize=settings.LLM_CACHE_SIZE,
        ttl=3600  # 1 hour TTL
    )
    logger.info(f"LLM cache enabled with maxsize={settings.LLM_CACHE_SIZE}, ttl=3600s")


def _generate_cache_key(mismatch_data: Dict[str, Any]) -> str:
    """Generate a deterministic cache key from mismatch data."""
    key_data = f"{mismatch_data.get('invoice_id', '')}:{mismatch_data.get('company_qty', '')}:{mismatch_data.get('customer_qty', '')}:{mismatch_data.get('company_price', '')}:{mismatch_data.get('customer_price', '')}"
    return hashlib.md5(key_data.encode()).hexdigest()


def _parse_llm_response(text: str) -> Optional[Dict[str, Any]]:
    """Parse LLM response text into JSON, handling common formatting issues."""
    if not text:
        return None

    # Remove markdown code blocks if present
    if "```" in text:
        match = re.search(r'```(?:json)?\s*(.*?)```', text, re.DOTALL)
        if match:
            text = match.group(1).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM response as JSON: {e}")
        return None


def _fallback_analysis(mismatch_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Rule-based fallback analysis when LLM is unavailable.
    Uses domain-specific heuristics for FMCG reconciliation.
    """
    c_q = mismatch_data['company_qty']
    cu_q = mismatch_data['customer_qty']
    c_p = mismatch_data['company_price']
    cu_p = mismatch_data['customer_price']

    # Determine issue type
    issue_type = "Multiple Issues"
    if cu_q == 0 or pd.isna(cu_q):
        issue_type = "Missing Invoice"
        severity = "High"
    elif c_q == 0 or pd.isna(c_q):
        issue_type = "Unrecorded Delivery"
        severity = "High"
    elif c_q != cu_q and abs(c_p - cu_p) < 0.01:
        issue_type = "Quantity Discrepancy"
        severity = "Medium" if abs(c_q - cu_q) / max(c_q, 1) < 0.2 else "High"
    elif abs(c_p - cu_p) > 0.01 and c_q == cu_q:
        issue_type = "Pricing Discrepancy"
        severity = "Medium" if abs(c_p - cu_p) / max(c_p, 1) < 0.1 else "High"
    elif c_q != cu_q and abs(c_p - cu_p) > 0.01:
        issue_type = "Multiple Discrepancies"
        severity = "High"
    else:
        issue_type = "Data Quality Issue"
        severity = "Low"

    # Generate reason based on issue type
    reason_map = {
        "Missing Invoice": "Customer has no record of this invoice. Possible delivery not received or invoice lost.",
        "Unrecorded Delivery": "Company has no record but customer claims receipt. Possible unprocessed delivery.",
        "Quantity Discrepancy": f"Quantity mismatch: company={c_q}, customer={cu_q}. Possible partial delivery or counting error.",
        "Pricing Discrepancy": f"Price mismatch: company=${c_p}, customer=${cu_p}. Possible discount not applied or pricing error.",
        "Multiple Discrepancies": "Both quantity and price differ. Possible systematic data entry error.",
        "Data Quality Issue": "Records differ in ways that don't match common patterns.",
    }

    # Generate action based on severity
    action_map = {
        "High": "Immediate investigation required. Contact customer and logistics team.",
        "Medium": "Review within 24 hours. Check delivery notes and pricing agreements.",
        "Low": "Flag for periodic review. May be resolved in next reconciliation cycle.",
    }

    return {
        "issue_type": issue_type,
        "severity": severity,
        "reason": reason_map.get(issue_type, "Unknown discrepancy pattern."),
        "suggested_action": action_map.get(severity, "Manual review required."),
        "explanation": f"Rule-based analysis: {issue_type} detected. Confidence based on pattern matching.",
        "confidence": 0.6 if severity == "High" else 0.5,
        **mismatch_data
    }


async def analyze_mismatch_async(mismatch_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyze a mismatch using LLM with caching and retry logic.

    Args:
        mismatch_data: Dictionary containing mismatch information

    Returns:
        Analysis result with issue_type, severity, reason, suggested_action, explanation, confidence
    """
    import pandas as pd  # noqa: F401 - Import for fallback analysis type hints

    # Check cache first
    if _response_cache is not None:
        cache_key = _generate_cache_key(mismatch_data)
        if cache_key in _response_cache:
            logger.debug(f"Cache hit for invoice {mismatch_data.get('invoice_id')}")
            cached_result = _response_cache[cache_key].copy()
            cached_result['cached'] = True
            return cached_result

    # If model not available, use fallback
    if model is None or not settings.is_api_key_configured():
        logger.debug(f"Using fallback analysis for invoice {mismatch_data.get('invoice_id')}")
        result = _fallback_analysis(mismatch_data)
        result['cached'] = False
        return result

    # Build prompt
    invoice_id = mismatch_data.get('invoice_id', 'Unknown')
    prompt = f"""You are a financial reconciliation expert working in the FMCG domain.

Analyze the mismatch between company records and customer records.

Input:
* Invoice ID: {invoice_id}
* Company Quantity: {mismatch_data.get('company_qty')}
* Customer Quantity: {mismatch_data.get('customer_qty')}
* Company Price: ${mismatch_data.get('company_price')}
* Customer Price: ${mismatch_data.get('customer_price')}

Tasks:
1. Identify the type of mismatch: (Pricing Issue / Quantity Issue / Missing Invoice / Claims Issue / Logistics Issue)
2. Assign severity: (Low / Medium / High)
3. Provide the most likely business reason: (e.g., discount not applied, delivery shortfall, data entry error, return not recorded)
4. Suggest a clear resolution action
5. Explain WHY you classified it this way (Explainable AI reasoning)
6. Provide a confidence score (0 to 1)

Output strictly in JSON format with exactly these keys:
{{
    "issue_type": "",
    "severity": "",
    "reason": "",
    "suggested_action": "",
    "explanation": "",
    "confidence": ""
}}
"""

    # Retry logic with exponential backoff
    last_error = None
    for attempt in range(settings.LLM_MAX_RETRIES + 1):
        try:
            response = await model.generate_content_async(
                prompt,
                request_options={"timeout": settings.LLM_TIMEOUT_SECONDS * 1000}
            )

            result = _parse_llm_response(response.text)

            if result is None:
                logger.warning(f"Invalid JSON response from LLM for invoice {invoice_id}")
                result = _fallback_analysis(mismatch_data)

            # Enrich result
            result.update(mismatch_data)
            result['cached'] = False

            # Cache the result
            if _response_cache is not None:
                _response_cache[cache_key] = result.copy()

            return result

        except asyncio.TimeoutError:
            last_error = "Timeout"
            logger.warning(f"LLM API timeout (attempt {attempt + 1}/{settings.LLM_MAX_RETRIES + 1}) for invoice {invoice_id}")
        except Exception as e:
            last_error = str(e)
            logger.warning(f"LLM API error (attempt {attempt + 1}/{settings.LLM_MAX_RETRIES + 1}): {e}")

        # Exponential backoff before retry
        if attempt < settings.LLM_MAX_RETRIES:
            wait_time = (2 ** attempt) * 0.5  # 0.5s, 1s, 2s, ...
            await asyncio.sleep(wait_time)

    # All retries exhausted, use fallback
    logger.error(f"LLM analysis failed after {settings.LLM_MAX_RETRIES + 1} attempts for invoice {invoice_id}. Using fallback.")
    result = _fallback_analysis(mismatch_data)
    result['error'] = f"LLM failed: {last_error}"
    result['cached'] = False
    return result


def analyze_mismatch(mismatch_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Synchronous wrapper for analyze_mismatch_async.
    Use this when async is not available (e.g., Streamlit).
    """
    loop = asyncio.get_event_loop()
    if loop.is_running():
        # If we're in an async context, run in a separate thread
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(asyncio.run, analyze_mismatch_async(mismatch_data))
            return future.result()
    else:
        return asyncio.run(analyze_mismatch_async(mismatch_data))


def get_cache_stats() -> Dict[str, Any]:
    """Get statistics about the response cache."""
    if _response_cache is None:
        return {"enabled": False}

    return {
        "enabled": True,
        "size": len(_response_cache),
        "max_size": settings.LLM_CACHE_SIZE,
        "hits": getattr(_response_cache, 'hits', 0),
        "misses": getattr(_response_cache, 'misses', 0),
    }


def clear_cache():
    """Clear the response cache."""
    if _response_cache is not None:
        _response_cache.clear()
        logger.info("LLM response cache cleared")
