"""
Tests for the matcher module.
"""
import pytest
import pandas as pd
from src.matcher import find_mismatches, get_mismatch_statistics, _normalize_columns


class TestNormalizeColumns:
    """Tests for column normalization."""

    def test_standard_columns(self):
        """Test with standard column names."""
        df = pd.DataFrame({
            'invoice_id': ['INV-001'],
            'quantity': [100],
            'price': [50.0]
        })
        result = _normalize_columns(df, 'company')
        assert 'quantity_company' in result.columns
        assert 'price_company' in result.columns
        assert 'invoice_id' in result.columns

    def test_alternative_column_names(self):
        """Test with alternative column names."""
        df = pd.DataFrame({
            'inv_id': ['INV-001'],
            'qty': [100],
            'rate': [50.0]
        })
        result = _normalize_columns(df, 'company')
        assert 'quantity_company' in result.columns
        assert 'price_company' in result.columns

    def test_whitespace_stripping(self):
        """Test that whitespace is stripped from column names."""
        df = pd.DataFrame({
            '  invoice_id  ': ['INV-001'],
            'quantity ': [100],
            '  price': [50.0]
        })
        result = _normalize_columns(df, 'company')
        assert 'invoice_id' in result.columns
        assert 'quantity_company' in result.columns
        assert 'price_company' in result.columns

    def test_missing_columns(self):
        """Test that missing columns get defaults."""
        df = pd.DataFrame({
            'invoice_id': ['INV-001']
        })
        result = _normalize_columns(df, 'company')
        assert 'quantity_company' in result.columns
        assert 'price_company' in result.columns
        assert result['quantity_company'].iloc[0] == 0
        assert result['price_company'].iloc[0] == 0.0

    def test_missing_invoice_id(self):
        """Test that missing invoice_id raises error."""
        df = pd.DataFrame({
            'quantity': [100],
            'price': [50.0]
        })
        with pytest.raises(ValueError, match="No invoice ID column"):
            _normalize_columns(df, 'company')


class TestFindMismatches:
    """Tests for mismatch detection."""

    def test_perfect_match(self, sample_company_data):
        """Test with identical data - no mismatches expected."""
        result = find_mismatches(sample_company_data, sample_company_data.copy())
        assert len(result) == 0

    def test_quantity_mismatch(self, sample_company_data, sample_customer_data):
        """Test detection of quantity mismatches."""
        result = find_mismatches(sample_company_data, sample_customer_data)

        inv_002 = next((r for r in result if r['invoice_id'] == 'INV-002'), None)
        assert inv_002 is not None
        assert inv_002['company_qty'] == 200.0
        assert inv_002['customer_qty'] == 190.0

    def test_price_mismatch(self, sample_company_data, sample_customer_data):
        """Test detection of price mismatches."""
        result = find_mismatches(sample_company_data, sample_customer_data)

        inv_003 = next((r for r in result if r['invoice_id'] == 'INV-003'), None)
        assert inv_003 is not None
        assert inv_003['company_price'] == 40.0
        assert inv_003['customer_price'] == 38.0

    def test_missing_invoice(self, sample_company_data, sample_customer_data):
        """Test detection of missing invoices."""
        result = find_mismatches(sample_company_data, sample_customer_data)

        # INV-004 is missing from customer
        inv_004 = next((r for r in result if r['invoice_id'] == 'INV-004'), None)
        assert inv_004 is not None
        assert inv_004['customer_qty'] == 0.0

        # INV-006 is only in customer
        inv_006 = next((r for r in result if r['invoice_id'] == 'INV-006'), None)
        assert inv_006 is not None
        assert inv_006['company_qty'] == 0.0

    def test_price_tolerance(self):
        """Test that price differences within tolerance are not flagged."""
        company = pd.DataFrame({
            'invoice_id': ['INV-001'],
            'quantity': [100],
            'price': [50.00]
        })
        customer = pd.DataFrame({
            'invoice_id': ['INV-001'],
            'quantity': [100],
            'price': [50.01]  # Within 0.01 tolerance
        })

        result = find_mismatches(company, customer, price_tolerance=0.01)
        assert len(result) == 0

    def test_empty_dataframes(self):
        """Test with empty dataframes."""
        company = pd.DataFrame()
        customer = pd.DataFrame()

        result = find_mismatches(company, customer)
        assert result == []

    def test_result_structure(self, sample_company_data, sample_customer_data):
        """Test that results have correct structure."""
        result = find_mismatches(sample_company_data, sample_customer_data)

        assert len(result) > 0
        for mismatch in result:
            assert 'invoice_id' in mismatch
            assert 'company_qty' in mismatch
            assert 'customer_qty' in mismatch
            assert 'company_price' in mismatch
            assert 'customer_price' in mismatch
            assert 'is_missing_company' in mismatch
            assert 'is_missing_customer' in mismatch


class TestGetMismatchStatistics:
    """Tests for mismatch statistics."""

    def test_empty_mismatches(self):
        """Test statistics with no mismatches."""
        result = get_mismatch_statistics([])

        assert result['total_mismatches'] == 0
        assert result['missing_invoices'] == 0
        assert result['quantity_mismatches'] == 0
        assert result['price_mismatches'] == 0
        assert result['total_discrepancy_value'] == 0.0

    def test_statistics_calculation(self):
        """Test statistics calculation."""
        mismatches = [
            {
                'invoice_id': 'INV-001',
                'company_qty': 100,
                'customer_qty': 90,
                'company_price': 10,
                'customer_price': 10,
                'is_missing_company': False,
                'is_missing_customer': False,
            },
            {
                'invoice_id': 'INV-002',
                'company_qty': 0,
                'customer_qty': 50,
                'company_price': 0,
                'customer_price': 20,
                'is_missing_company': True,
                'is_missing_customer': False,
            }
        ]

        result = get_mismatch_statistics(mismatches)

        assert result['total_mismatches'] == 2
        assert result['missing_invoices'] == 1
        assert result['quantity_mismatches'] == 1
        assert result['total_discrepancy_value'] == 1100.0  # |1000-900| + |0-1000|
