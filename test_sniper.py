import os
from pymongo import MongoClient
import datetime
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "").strip()

def inject_test_monitor():
    client = MongoClient(MONGO_URI)
    db = client.get_database("thewebspider")
    monitors_col = db.monitors
    
    # We will test against Example.com
    # Current text of example.com is basically "Example Domain. This domain is for use in illustrative examples..."
    # If our trigger note is "Alert if it says Example Domain", it SHOULD trigger.
    
    test_monitor = {
        "user_email": "test_sniper@thewebspider.com",
        "url": "https://example.com",
        "ai_focus_note": "Alert me if the page contains the phrase 'Example Domain'",
        "trigger_mode_enabled": True, 
        "deep_crawl": False,
        "deep_crawl_depth": 1,
        "requires_login": False,
        "is_first_run": True,
        "last_scraped_text": "",
        "latest_ai_summary": "Waiting for the first scan...",
        "last_updated_timestamp": datetime.datetime.now()
    }
    
    result = monitors_col.insert_one(test_monitor)
    print(f"Injected Sniper Test Monitor: {result.inserted_id}")
    client.close()

if __name__ == "__main__":
    inject_test_monitor()
