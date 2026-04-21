"""
Pytest configuration and fixtures for the test suite.
"""
import pytest
import pandas as pd
import io
from typing import Dict, Any


@pytest.fixture
def sample_company_data() -> pd.DataFrame:
    """Sample company data for testing."""
    return pd.DataFrame({
        'invoice_id': ['INV-001', 'INV-002', 'INV-003', 'INV-004', 'INV-005'],
        'quantity': [100, 200, 150, 300, 50],
        'price': [50.0, 30.0, 40.0, 20.0, 10.0],
        'date': ['2023-10-01', '2023-10-02', '2023-10-03', '2023-10-04', '2023-10-05']
    })


@pytest.fixture
def sample_customer_data() -> pd.DataFrame:
    """Sample customer data for testing."""
    return pd.DataFrame({
        'invoice_id': ['INV-001', 'INV-002', 'INV-003', 'INV-005', 'INV-006'],
        'quantity': [100, 190, 150, 50, 75],
        'price': [50.0, 30.0, 38.0, 10.0, 10.0],
        'date': ['2023-10-01', '2023-10-02', '2023-10-03', '2023-10-05', '2023-10-06']
    })


@pytest.fixture
def expected_mismatches() -> list[Dict[str, Any]]:
    """Expected mismatches from sample data."""
    return [
        {
            'invoice_id': 'INV-002',
            'company_qty': 200.0,
            'customer_qty': 190.0,
            'company_price': 30.0,
            'customer_price': 30.0,
        },
        {
            'invoice_id': 'INV-003',
            'company_qty': 150.0,
            'customer_qty': 150.0,
            'company_price': 40.0,
            'customer_price': 38.0,
        },
        {
            'invoice_id': 'INV-004',
            'company_qty': 300.0,
            'customer_qty': 0.0,
            'company_price': 20.0,
            'customer_price': 0.0,
        },
        {
            'invoice_id': 'INV-006',
            'company_qty': 0.0,
            'customer_qty': 75.0,
            'company_price': 0.0,
            'customer_price': 10.0,
        }
    ]


@pytest.fixture
def sample_mismatch() -> Dict[str, Any]:
    """Sample mismatch data for analyzer testing."""
    return {
        'invoice_id': 'INV-002',
        'company_qty': 200.0,
        'customer_qty': 190.0,
        'company_price': 30.0,
        'customer_price': 30.0,
    }


@pytest.fixture
def csv_company_file() -> bytes:
    """Company data as CSV bytes."""
    data = """invoice_id,quantity,price,date
INV-001,100,50.0,2023-10-01
INV-002,200,30.0,2023-10-02
INV-003,150,40.0,2023-10-03
INV-004,300,20.0,2023-10-04
INV-005,50,10.0,2023-10-05
"""
    return data.encode('utf-8')


@pytest.fixture
def csv_customer_file() -> bytes:
    """Customer data as CSV bytes."""
    data = """invoice_id,quantity,price,date
INV-001,100,50.0,2023-10-01
INV-002,190,30.0,2023-10-02
INV-003,150,38.0,2023-10-03
INV-005,50,10.0,2023-10-05
INV-006,75,10.0,2023-10-06
"""
    return data.encode('utf-8')


@pytest.fixture
def mock_settings(monkeypatch):
    """Mock settings for testing."""
    monkeypatch.setenv('GEMINI_API_KEY', 'test-key')
    monkeypatch.setenv('DEBUG', 'true')
    monkeypatch.setenv('LLM_CACHE_ENABLED', 'false')

    from config import get_settings
    # Clear the cache to force reload
    get_settings.cache_clear()
    return get_settings()
