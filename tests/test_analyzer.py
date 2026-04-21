"""
Tests for the analyzer module.
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
import asyncio

from src.analyzer import (
    analyze_mismatch,
    analyze_mismatch_async,
    _fallback_analysis,
    _parse_llm_response,
    _generate_cache_key,
    get_cache_stats,
    clear_cache
)


class TestFallbackAnalysis:
    """Tests for fallback (rule-based) analysis."""

    def test_missing_invoice_detection(self):
        """Test detection of missing invoices."""
        mismatch = {
            'invoice_id': 'INV-001',
            'company_qty': 100,
            'customer_qty': 0,
            'company_price': 50,
            'customer_price': 50
        }

        result = _fallback_analysis(mismatch)

        assert result['issue_type'] == 'Missing Invoice'
        assert result['severity'] == 'High'
        assert result['confidence'] == 0.6

    def test_quantity_discrepancy(self):
        """Test quantity discrepancy detection."""
        mismatch = {
            'invoice_id': 'INV-001',
            'company_qty': 100,
            'customer_qty': 90,
            'company_price': 50,
            'customer_price': 50
        }

        result = _fallback_analysis(mismatch)

        assert result['issue_type'] == 'Quantity Discrepancy'
        assert result['severity'] in ['Medium', 'High']

    def test_pricing_discrepancy(self):
        """Test pricing discrepancy detection."""
        mismatch = {
            'invoice_id': 'INV-001',
            'company_qty': 100,
            'customer_qty': 100,
            'company_price': 50,
            'customer_price': 45
        }

        result = _fallback_analysis(mismatch)

        assert result['issue_type'] == 'Pricing Discrepancy'

    def test_result_structure(self):
        """Test that result has all required fields."""
        mismatch = {
            'invoice_id': 'INV-001',
            'company_qty': 100,
            'customer_qty': 90,
            'company_price': 50,
            'customer_price': 50
        }

        result = _fallback_analysis(mismatch)

        required_fields = [
            'issue_type', 'severity', 'reason',
            'suggested_action', 'explanation', 'confidence',
            'invoice_id', 'company_qty', 'customer_qty',
            'company_price', 'customer_price'
        ]

        for field in required_fields:
            assert field in result, f"Missing required field: {field}"


class TestParseLLMResponse:
    """Tests for LLM response parsing."""

    def test_valid_json(self):
        """Test parsing valid JSON."""
        json_str = '{"issue_type": "Quantity Issue", "severity": "Medium"}'
        result = _parse_llm_response(json_str)

        assert result is not None
        assert result['issue_type'] == 'Quantity Issue'
        assert result['severity'] == 'Medium'

    def test_json_with_code_blocks(self):
        """Test parsing JSON wrapped in markdown code blocks."""
        json_str = '''```json
{"issue_type": "Quantity Issue", "severity": "Medium"}
```'''
        result = _parse_llm_response(json_str)

        assert result is not None
        assert result['issue_type'] == 'Quantity Issue'

    def test_invalid_json(self):
        """Test parsing invalid JSON."""
        result = _parse_llm_response('not valid json')
        assert result is None

    def test_empty_response(self):
        """Test parsing empty response."""
        result = _parse_llm_response('')
        assert result is None

    def test_null_response(self):
        """Test parsing None."""
        result = _parse_llm_response(None)
        assert result is None


class TestCacheKeyGeneration:
    """Tests for cache key generation."""

    def test_deterministic_keys(self):
        """Test that same input produces same key."""
        mismatch1 = {
            'invoice_id': 'INV-001',
            'company_qty': 100,
            'customer_qty': 90,
            'company_price': 50,
            'customer_price': 50
        }

        mismatch2 = {
            'invoice_id': 'INV-001',
            'company_qty': 100,
            'customer_qty': 90,
            'company_price': 50,
            'customer_price': 50
        }

        assert _generate_cache_key(mismatch1) == _generate_cache_key(mismatch2)

    def test_different_keys(self):
        """Test that different input produces different key."""
        mismatch1 = {
            'invoice_id': 'INV-001',
            'company_qty': 100,
            'customer_qty': 90,
            'company_price': 50,
            'customer_price': 50
        }

        mismatch2 = {
            'invoice_id': 'INV-002',
            'company_qty': 100,
            'customer_qty': 90,
            'company_price': 50,
            'customer_price': 50
        }

        assert _generate_cache_key(mismatch1) != _generate_cache_key(mismatch2)


class TestCacheOperations:
    """Tests for cache operations."""

    def test_cache_stats(self):
        """Test cache statistics retrieval."""
        stats = get_cache_stats()
        assert isinstance(stats, dict)
        assert 'enabled' in stats

    def test_clear_cache(self):
        """Test cache clearing."""
        clear_cache()
        # Should not raise any exception


class TestAsyncAnalysis:
    """Tests for async analysis."""

    @pytest.mark.asyncio
    async def test_analyze_mismatch_async_fallback(self, sample_mismatch):
        """Test async analysis with fallback (no API key)."""
        with patch('src.analyzer.model', None):
            result = await analyze_mismatch_async(sample_mismatch)

            assert result is not None
            assert 'issue_type' in result
            assert 'severity' in result
            assert result['cached'] is False

    @pytest.mark.asyncio
    async def test_analyze_mismatch_sync_wrapper(self, sample_mismatch):
        """Test sync wrapper for async analysis."""
        with patch('src.analyzer.model', None):
            result = analyze_mismatch(sample_mismatch)

            assert result is not None
            assert 'issue_type' in result
            assert 'severity' in result
