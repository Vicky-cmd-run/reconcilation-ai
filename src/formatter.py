import pandas as pd

def format_results(results_list):
    """
    Takes a list of dictionaries (from API output) and formats it into a nice Pandas DataFrame.
    """
    if not results_list:
        return pd.DataFrame()
        
    df = pd.DataFrame(results_list)
    
    # Intended order of columns for better UX
    cols = [
        'invoice_id', 
        'issue_type', 
        'severity', 
        'company_qty', 
        'customer_qty', 
        'company_price', 
        'customer_price', 
        'reason', 
        'suggested_action', 
        'explanation', 
        'confidence'
    ]
    
    # filter to only existing cols to avoid KeyError if something missing
    existing_cols = [col for col in cols if col in df.columns]
    
    # Attach any extra columns at the end
    extra_cols = [col for col in df.columns if col not in cols]
    
    df = df[existing_cols + extra_cols]
    
    # Format Title Case for column headers
    df.columns = [col.replace('_', ' ').title() for col in df.columns]
    
    return df
