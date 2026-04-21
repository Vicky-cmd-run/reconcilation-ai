"""
Streamlit frontend for FMCG Reconciliation AI.
Enhanced with proper error handling, loading states, and user feedback.
"""
import streamlit as st
import pandas as pd
import json
import logging
from pathlib import Path

from src.extractor import load_data
from src.matcher import find_mismatches, get_mismatch_statistics
from src.analyzer import analyze_mismatch, get_cache_stats
from src.formatter import format_results

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Page configuration
st.set_page_config(
    page_title="FMCG Reconciliation AI",
    layout="wide",
    page_icon="",
    initial_sidebar_state="expanded"
)

# Custom CSS for better styling
st.markdown("""
<style>
    .stAlert {border-radius: 10px;}
    .metric-card {background-color: #1e293b; padding: 20px; border-radius: 10px;}
    .high-severity {border-left: 4px solid #ef4444;}
    .medium-severity {border-left: 4px solid #f59e0b;}
    .low-severity {border-left: 4px solid #10b981;}
</style>
""", unsafe_allow_html=True)

# Title and description
st.title("FMCG Reconciliation AI")
st.markdown("""
Identify and analyze mismatches between company and customer records with **Explainable AI**.
Built for the FMCG industry with production-grade reliability.
""")

# Initialize session state
if 'results' not in st.session_state:
    st.session_state.results = None
if 'demo_mode' not in st.session_state:
    st.session_state.demo_mode = False
if 'analysis_complete' not in st.session_state:
    st.session_state.analysis_complete = False

# File upload section
col1, col2 = st.columns(2)

with col1:
    company_file = st.file_uploader(
        "Upload Company Records (CSV)",
        type="csv",
        help="CSV file with columns: invoice_id, quantity, price"
    )

with col2:
    customer_file = st.file_uploader(
        "Upload Customer Records (CSV)",
        type="csv",
        help="CSV file with columns: invoice_id, quantity, price"
    )

# Demo data section
st.markdown("---")
st.subheader("Quick Start")
use_demo = st.button(
    "Load Demo Data",
    help="Use sample data to test the application",
    disabled=company_file is not None or customer_file is not None
)

# Handle demo data selection
if use_demo:
    demo_company_path = Path(__file__).parent / "data" / "sample_company.csv"
    demo_customer_path = Path(__file__).parent / "data" / "sample_customer.csv"

    if demo_company_path.exists() and demo_customer_path.exists():
        company_file = str(demo_company_path)
        customer_file = str(demo_customer_path)
        st.session_state.demo_mode = True
        st.success("Demo data loaded successfully!")
    else:
        st.error("Demo data files not found. Please upload your own CSV files.")

# Main processing section
if company_file and customer_file:
    try:
        # Load and preview data
        with st.expander("Preview Uploaded Data", expanded=False):
            company_df, customer_df = load_data(company_file, customer_file)

            c1, c2 = st.columns(2)
            with c1:
                st.markdown("**Company Data**")
                st.dataframe(company_df.head(), use_container_width=True)
                st.caption(f"Total rows: {len(company_df)}")

            with c2:
                st.markdown("**Customer Data**")
                st.dataframe(customer_df.head(), use_container_width=True)
                st.caption(f"Total rows: {len(customer_df)}")

        # Start reconciliation button
        st.markdown("---")
        col_btn1, col_btn2, _ = st.columns([1, 1, 3])

        with col_btn1:
            start_btn = st.button(
                "Start Reconciliation",
                type="primary",
                use_container_width=True
            )

        with col_btn2:
            clear_btn = st.button(
                "Clear Results",
                use_container_width=True
            )

        if clear_btn:
            st.session_state.results = None
            st.session_state.analysis_complete = False
            st.rerun()

        if start_btn:
            with st.spinner("Finding Mismatches..."):
                try:
                    mismatches = find_mismatches(company_df, customer_df)
                except Exception as e:
                    st.error(f"Error finding mismatches: {str(e)}")
                    logger.exception("Mismatch detection failed")
                    mismatches = []

            if not mismatches:
                st.success("No mismatches found. Perfect reconciliation!")
                st.session_state.analysis_complete = True
                st.session_state.results = []
            else:
                st.warning(f"Found {len(mismatches)} mismatched invoices. Analyzing with AI...")

                # Progress bar for analysis
                progress_bar = st.progress(0)
                progress_text = st.empty()

                results = []
                for i, mismatch in enumerate(mismatches):
                    progress_text.text(f"Analyzing invoice {i + 1}/{len(mismatches)}...")

                    try:
                        res = analyze_mismatch(mismatch)
                        results.append(res)
                    except Exception as e:
                        logger.error(f"Failed to analyze mismatch {mismatch.get('invoice_id')}: {e}")
                        # Add fallback result
                        results.append({
                            **mismatch,
                            "issue_type": "Analysis Failed",
                            "severity": "Medium",
                            "reason": str(e),
                            "suggested_action": "Manual review required",
                            "explanation": "AI analysis failed. Please review manually.",
                            "confidence": 0.0
                        })

                    progress_bar.progress((i + 1) / len(mismatches))

                progress_text.text("Analysis complete!")
                st.session_state.results = results
                st.session_state.analysis_complete = True

                # Display results
                st.markdown("---")
                st.subheader("Reconciliation Analysis Results")

                # Metrics row
                stats = get_mismatch_statistics(mismatches)
                m1, m2, m3 = st.columns(3)

                with m1:
                    st.metric(
                        "Total Mismatches",
                        stats["total_mismatches"],
                        delta=None
                    )

                with m2:
                    high_sev = sum(1 for r in results if r.get('severity') == 'High')
                    st.metric(
                        "High Severity",
                        high_sev,
                        delta=None,
                        delta_color="inverse"
                    )

                with m3:
                    st.metric(
                        "Total Value at Risk",
                        f"${stats['total_discrepancy_value']:,.2f}",
                        delta=None,
                        delta_color="inverse"
                    )

                # Cache stats (if available)
                cache_stats = get_cache_stats()
                if cache_stats.get('enabled'):
                    st.caption(
                        f"Cache: {cache_stats.get('size', 0)} entries "
                        f"(Hits: {cache_stats.get('hits', 0)}, Misses: {cache_stats.get('misses', 0)})"
                    )

                # Results table with severity highlighting
                results_df = format_results(results)

                def highlight_severity(val):
                    if val == 'High':
                        return 'background-color: rgba(239, 68, 68, 0.2); color: #ef4444'
                    elif val == 'Medium':
                        return 'background-color: rgba(245, 158, 11, 0.2); color: #f59e0b'
                    elif val == 'Low':
                        return 'background-color: rgba(16, 185, 129, 0.2); color: #10b981'
                    return ''

                styled_df = results_df.style.map(highlight_severity, subset=['Severity'])
                st.dataframe(styled_df, use_container_width=True)

                # Detailed explanations
                st.subheader("Detailed AI Explanations")

                for res in results:
                    severity = res.get('severity', 'Unknown')
                    severity_color = {
                        'High': 'red',
                        'Medium': 'orange',
                        'Low': 'green'
                    }.get(severity, 'gray')

                    with st.expander(
                        f"Invoice {res.get('invoice_id', 'N/A')} - "
                        f"{res.get('issue_type', 'Unknown')} "
                        f"(Severity: {severity})"
                    ):
                        c1, c2 = st.columns([1, 2])

                        with c1:
                            st.metric(
                                "Confidence",
                                f"{float(res.get('confidence', 0)) * 100:.0f}%"
                            )
                            st.markdown(
                                f"**Company:** Qty={res.get('company_qty', 0)}, "
                                f"Price=${res.get('company_price', 0)}"
                            )
                            st.markdown(
                                f"**Customer:** Qty={res.get('customer_qty', 0)}, "
                                f"Price=${res.get('customer_price', 0)}"
                            )

                        with c2:
                            st.markdown(f"**Reason:**\n> {res.get('reason', 'N/A')}")
                            st.markdown(f"**Action:**\n{res.get('suggested_action', 'N/A')}")
                            st.info(f"**AI Explanation:**\n{res.get('explanation', 'N/A')}")

    except Exception as e:
        st.error(f"Error processing files: {str(e)}")
        logger.exception("Processing error")
else:
    st.info(
        "Please upload both Company and Customer CSV files to begin, "
        "or click 'Load Demo Data' to try with sample data."
    )

# Sidebar with information
with st.sidebar:
    st.markdown("### About")
    st.markdown(
        """
        This AI-powered reconciliation tool helps FMCG companies
        identify and resolve discrepancies between company records
        and customer invoices.

        **Features:**
        - Automated mismatch detection
        - AI-powered root cause analysis
        - Severity-based prioritization
        - Explainable AI recommendations
        """
    )

    st.markdown("### How It Works")
    st.markdown(
        """
        1. Upload company and customer CSV files
        2. System detects quantity and price mismatches
        3. AI analyzes each mismatch for root cause
        4. Get prioritized action items with explanations
        """
    )

    # Cache management
    if st.session_state.analysis_complete:
        st.markdown("---")
        if st.button("Clear Cache"):
            from src.analyzer import clear_cache
            clear_cache()
            st.success("Cache cleared!")
