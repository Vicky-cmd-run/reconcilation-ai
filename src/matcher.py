"""
High-performance mismatch detection using vectorized pandas operations.
"""
import pandas as pd
import numpy as np
from typing import Dict, Any, List


def find_mismatches(
    company_df: pd.DataFrame,
    customer_df: pd.DataFrame,
    price_tolerance: float = 0.01
) -> List[Dict[str, Any]]:
    """
    Compares company and customer data to find mismatches in quantity or price.
    Uses vectorized pandas operations for optimal performance.

    Args:
        company_df: DataFrame with company records (columns: invoice_id, quantity, price)
        customer_df: DataFrame with customer records (columns: invoice_id, quantity, price)
        price_tolerance: Tolerance for price comparison (default: 0.01)

    Returns:
        List of mismatch records with normalized data
    """
    # Normalize column names for consistent processing
    company_df = _normalize_columns(company_df, "company")
    customer_df = _normalize_columns(customer_df, "customer")

    # Perform outer merge to find all records
    merged = pd.merge(
        company_df,
        customer_df,
        on="invoice_id",
        how="outer",
        suffixes=("_company", "_customer"),
        indicator=True
    )

    if merged.empty:
        return []

    # Vectorized mismatch detection
    comp_qty = merged['quantity_company'].fillna(0)
    cust_qty = merged['quantity_customer'].fillna(0)
    comp_price = merged['price_company'].fillna(0)
    cust_price = merged['price_customer'].fillna(0)

    # Detect missing records
    is_missing_company = merged['_merge'] == 'right_only'
    is_missing_customer = merged['_merge'] == 'left_only'

    # Detect quantity mismatches (only when both records exist)
    both_present = ~is_missing_company & ~is_missing_customer
    has_qty_mismatch = both_present & (comp_qty != cust_qty)

    # Detect price mismatches with tolerance (only when both records exist)
    price_diff = np.abs(comp_price - cust_price)
    has_price_mismatch = both_present & (price_diff > price_tolerance)

    # Combine all mismatch conditions
    has_mismatch = is_missing_company | is_missing_customer | has_qty_mismatch | has_price_mismatch

    # Filter to only mismatched records
    mismatches_df = merged[has_mismatch].copy()

    # Build result list efficiently
    results = []
    for _, row in mismatches_df.iterrows():
        results.append({
            "invoice_id": str(row['invoice_id']),
            "company_qty": float(row['quantity_company']) if pd.notna(row.get('quantity_company')) else 0.0,
            "customer_qty": float(row['quantity_customer']) if pd.notna(row.get('quantity_customer')) else 0.0,
            "company_price": float(row['price_company']) if pd.notna(row.get('price_company')) else 0.0,
            "customer_price": float(row['price_customer']) if pd.notna(row.get('price_customer')) else 0.0,
            "is_missing_company": bool(is_missing_company.loc[row.name]),
            "is_missing_customer": bool(is_missing_customer.loc[row.name]),
        })

    return results


def _normalize_columns(df: pd.DataFrame, suffix: str) -> pd.DataFrame:
    """
    Normalize column names to expected format.

    Handles various column naming conventions:
    - quantity, quantity_company, qty, etc.
    - price, price_company, unit_price, etc.
    """
    df = df.copy()

    # Strip whitespace from column names
    df.columns = df.columns.str.strip()

    # Create column mapping
    column_mapping = {}

    for col in df.columns:
        col_lower = col.lower()

        # Map quantity columns
        if col_lower in ['quantity', 'qty', 'quantity_company', 'quantity_customer']:
            column_mapping[col] = f'quantity_{suffix}'
        # Map price columns
        elif col_lower in ['price', 'unit_price', 'price_company', 'price_customer', 'rate']:
            column_mapping[col] = f'price_{suffix}'
        # Map invoice ID columns
        elif col_lower in ['invoice_id', 'invoice', 'inv_id', 'id']:
            column_mapping[col] = 'invoice_id'

    # Rename columns
    if column_mapping:
        df = df.rename(columns=column_mapping)

    # Ensure required columns exist with defaults
    if 'invoice_id' not in df.columns:
        raise ValueError(f"No invoice ID column found in {suffix} data")

    if f'quantity_{suffix}' not in df.columns:
        df[f'quantity_{suffix}'] = 0

    if f'price_{suffix}' not in df.columns:
        df[f'price_{suffix}'] = 0.0

    return df


def get_mismatch_statistics(mismatches: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Calculate statistics about mismatches.

    Returns:
        Dictionary with mismatch statistics
    """
    if not mismatches:
        return {
            "total_mismatches": 0,
            "missing_invoices": 0,
            "quantity_mismatches": 0,
            "price_mismatches": 0,
            "total_discrepancy_value": 0.0,
        }

    missing = sum(1 for m in mismatches if m.get('is_missing_company') or m.get('is_missing_customer'))

    qty_mismatch = sum(
        1 for m in mismatches
        if not m.get('is_missing_company') and not m.get('is_missing_customer')
        and m['company_qty'] != m['customer_qty']
    )

    price_mismatch = sum(
        1 for m in mismatches
        if not m.get('is_missing_company') and not m.get('is_missing_customer')
        and m['company_price'] != m['customer_price']
    )

    total_value = sum(
        abs((m['company_qty'] * m['company_price']) - (m['customer_qty'] * m['customer_price']))
        for m in mismatches
    )

    return {
        "total_mismatches": len(mismatches),
        "missing_invoices": missing,
        "quantity_mismatches": qty_mismatch,
        "price_mismatches": price_mismatch,
        "total_discrepancy_value": round(total_value, 2),
    }
