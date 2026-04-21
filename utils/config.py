import os
from dotenv import load_dotenv

load_dotenv()

# Attempt to load GEMINI_API_KEY from environment variables (.env file)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# In case the user hasn't set it in .env but set it in Streamlit Secrets, etc.
