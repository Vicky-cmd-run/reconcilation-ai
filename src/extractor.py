import pandas as pd

def load_data(company_file, customer_file):
    """
    Loads company and customer CSV data into pandas DataFrames.
    """
    company_df = pd.read_csv(company_file)
    customer_df = pd.read_csv(customer_file)
    
    # Strip any whitespace from headers just in case
    company_df.columns = company_df.columns.str.strip()
    customer_df.columns = customer_df.columns.str.strip()
    
    return company_df, customer_df
