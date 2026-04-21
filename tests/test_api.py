"""
Tests for the FastAPI API endpoints.
"""
import pytest
from fastapi.testclient import TestClient
from io import BytesIO

from api import app


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def sample_files(csv_company_file, csv_customer_file):
    """Create file-like objects for testing."""
    return {
        'company_file': ('company.csv', BytesIO(csv_company_file), 'text/csv'),
        'customer_file': ('customer.csv', BytesIO(csv_customer_file), 'text/csv')
    }


class TestRootEndpoint:
    """Tests for root endpoint."""

    def test_root_returns_info(self, client):
        """Test root endpoint returns API info."""
        response = client.get("/")
        assert response.status_code == 200

        data = response.json()
        assert 'name' in data
        assert 'version' in data
        assert 'status' in data


class TestHealthEndpoints:
    """Tests for health check endpoints."""

    def test_health_check(self, client):
        """Test health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200

        data = response.json()
        assert 'status' in data
        assert 'version' in data
        assert 'llm_configured' in data

    def test_liveness_check(self, client):
        """Test liveness check endpoint."""
        response = client.get("/health/live")
        assert response.status_code == 200
        assert response.json()['status'] == 'alive'

    def test_readiness_check(self, client):
        """Test readiness check endpoint."""
        response = client.get("/health/ready")
        assert response.status_code == 200


class TestReconciliationEndpoint:
    """Tests for reconciliation endpoint."""

    def test_missing_files(self, client):
        """Test error when files are missing."""
        response = client.post("/api/reconcile")
        assert response.status_code == 422  # Validation error

    def test_invalid_file_extension(self, client):
        """Test error when file extension is invalid."""
        files = {
            'company_file': ('company.txt', b'not a csv', 'text/plain'),
            'customer_file': ('customer.csv', b'invoice_id,quantity,price\nINV-001,100,50', 'text/csv')
        }
        response = client.post("/api/reconcile", files=files)
        assert response.status_code == 400
        assert 'CSV' in response.json()['detail']

    def test_empty_file(self, client):
        """Test error when file is empty."""
        files = {
            'company_file': ('company.csv', b'', 'text/csv'),
            'customer_file': ('customer.csv', b'invoice_id,quantity,price\nINV-001,100,50', 'text/csv')
        }
        response = client.post("/api/reconcile", files=files)
        assert response.status_code == 400

    def test_successful_reconciliation(self, client, sample_files):
        """Test successful reconciliation."""
        response = client.post(
            "/api/reconcile",
            files=sample_files
        )
        assert response.status_code == 200

        data = response.json()
        assert data['status'] == 'success'
        assert 'data' in data
        assert 'message' in data

    def test_response_structure(self, client, sample_files):
        """Test response has correct structure."""
        response = client.post("/api/reconcile", files=sample_files)
        data = response.json()

        assert 'status' in data
        assert 'message' in data
        assert 'data' in data

        if data['data']:
            result = data['data'][0]
            assert 'invoice_id' in result
            assert 'issue_type' in result
            assert 'severity' in result
            assert 'reason' in result
            assert 'suggested_action' in result
            assert 'explanation' in result


class TestCacheEndpoints:
    """Tests for cache management endpoints."""

    def test_cache_stats(self, client):
        """Test cache statistics endpoint."""
        response = client.get("/api/cache/stats")
        assert response.status_code == 200

        data = response.json()
        assert 'enabled' in data

    def test_cache_clear(self, client):
        """Test cache clear endpoint."""
        response = client.post("/api/cache/clear")
        assert response.status_code == 200
        assert response.json()['status'] == 'success'


class TestStatisticsEndpoint:
    """Tests for statistics endpoint."""

    def test_statistics(self, client):
        """Test statistics endpoint."""
        response = client.get("/api/statistics")
        assert response.status_code == 200

        data = response.json()
        assert 'app_name' in data
        assert 'version' in data
        assert 'llm_configured' in data
        assert 'cache_enabled' in data


class TestSecurityHeaders:
    """Tests for security headers."""

    def test_security_headers_present(self, client):
        """Test that security headers are present in responses."""
        response = client.get("/health")

        assert response.headers.get('X-Content-Type-Options') == 'nosniff'
        assert response.headers.get('X-Frame-Options') == 'DENY'
        assert response.headers.get('X-XSS-Protection') == '1; mode=block'
        assert 'Strict-Transport-Security' in response.headers


class TestCORS:
    """Tests for CORS configuration."""

    def test_cors_headers(self, client):
        """Test CORS headers are present."""
        response = client.get(
            "/health",
            headers={"Origin": "http://localhost:5173"}
        )

        # CORS headers should be present
        assert 'access-control-allow-origin' in response.headers
