import os
import json
import asyncio
import datetime
import requests
import difflib
from urllib.parse import urlparse, urljoin
from pymongo import MongoClient
from playwright.async_api import async_playwright
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# Configuration
MONGO_URI = os.getenv("MONGO_URI")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# Netlify URL for notifications
NETLIFY_URL = os.getenv("NETLIFY_URL", "http://localhost:8888") # Default for local dev
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET")

# AI Setup
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

async def trigger_notifications(monitor_doc, summary):
    notify_url = f"{NETLIFY_URL}/.netlify/functions/notify"
    headers = {
        "Content-Type": "application/json"
    }
    if WEBHOOK_SECRET:
        headers["Authorization"] = f"Bearer {WEBHOOK_SECRET}"

    payload = {
        "monitor": {
            "url": monitor_doc['url'],
            "user_email": monitor_doc['user_email'],
            "email_notifications_enabled": monitor_doc.get('email_notifications_enabled', False),
            "telegram_notifications_enabled": monitor_doc.get('telegram_notifications_enabled', False),
            "telegram_chat_id": monitor_doc.get('telegram_chat_id', '')
        },
        "summary": summary
    }

    try:
        response = requests.post(notify_url, json=payload, headers=headers, timeout=10)
        if response.status_code == 200:
            print(f"Notifications triggered for {monitor_doc['url']}")
        else:
            print(f"Failed to trigger notifications: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"Error calling notification function: {e}")

async def summarize_changes(old_text, new_text):
    # Calculate differences
    differ = difflib.ndiff(old_text.splitlines(), new_text.splitlines())
    
    # Extract only added and removed lines to send to the AI
    diff_lines = []
    for line in differ:
        if line.startswith('+ ') or line.startswith('- '):
            diff_lines.append(line)
            
    diff_text = "\n".join(diff_lines)
    
    # Fallback to prevent token exhaustion if a page completely changes structure
    if len(diff_text) > 15000:
        diff_text = diff_text[:15000] + "\n...(diff truncated)"

    if not diff_text.strip():
        return "No significant changes"

    prompt = f"""
    Analyze the following text diff between an old version and a new version of a webpage.
    Lines starting with '- ' were removed, and lines starting with '+ ' were added.
    Summarize the significant changes in 2-3 concise bullet points.
    If the changes are only minor (like timestamps, ads, UI state changes, or random numbers), state exactly "No significant changes".
    
    DIFF:
    {diff_text}
    """
    
    try:
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        print(f"Gemini API Error: {e}")
        return "Manual check required due to summarization error."

async def extract_links(page, base_url):
    domain = urlparse(base_url).netloc
    links = await page.evaluate('''() => {
        return Array.from(document.querySelectorAll("a[href]"))
                    .map(a => a.href);
    }''')
    
    valid_links = set()
    for link in links:
        parsed = urlparse(link)
        # Check if same domain, exclude javascript/mailto, remove fragments
        if parsed.netloc == domain and parsed.scheme in ['http', 'https']:
            clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
            # optionally handle query params, but path is safer for basic crawl
            if parsed.query:
                clean_url += f"?{parsed.query}"
            valid_links.add(clean_url)
            
    return valid_links

async def scrape_monitor(context, monitor_doc):
    start_url = monitor_doc['url']
    is_deep_crawl = monitor_doc.get('deep_crawl', False)
    max_pages = 20 if is_deep_crawl else 1
    
    visited = set()
    queue = [start_url]
    all_text_blocks = []
    
    print(f"Starting Scrape for: {start_url} (Deep Crawl: {is_deep_crawl})")
    
    # Authenticate only once strictly on the first URL if needed
    page = await context.new_page()
    try:
        if monitor_doc.get('has_captcha') and monitor_doc.get('captcha_json'):
            try:
                cookies = json.loads(monitor_doc['captcha_json'])
                await context.add_cookies(cookies)
                print(f"Injected cookies for {start_url}")
            except Exception as e:
                print(f"Error parsing cookies: {e}")

        if monitor_doc.get('requires_login'):
            try:
                await page.goto(start_url, wait_until="networkidle", timeout=60000)
                user_input = await page.query_selector('input[type="text"], input[type="email"]')
                pass_input = await page.query_selector('input[type="password"]')
                if user_input and pass_input:
                    await user_input.fill(monitor_doc['username'])
                    await pass_input.fill(monitor_doc['password'])
                    await page.keyboard.press("Enter")
                    await page.wait_for_load_state("networkidle")
                    print("Attempted login submission")
            except Exception as e:
                print(f"Login automated step failed: {e}")

        # Start BFS
        while queue and len(visited) < max_pages:
            current_url = queue.pop(0)
            if current_url in visited:
                continue
                
            visited.add(current_url)
            print(f"  -> Scraping: {current_url} ({len(visited)}/{max_pages})")
            
            try:
                # If it's the exact start_url and we already loaded it for login, skip goto
                if not (current_url == start_url and monitor_doc.get('requires_login')):
                    await page.goto(current_url, wait_until="networkidle", timeout=60000)

                # Extract Text
                content = await page.evaluate("() => document.body.innerText")
                clean_text = " ".join(content.split())
                all_text_blocks.append(f"--- PAGE: {current_url} ---\n{clean_text}")

                # Extract Links if deep crawling
                if is_deep_crawl:
                    new_links = await extract_links(page, start_url)
                    for link in new_links:
                        if link not in visited and link not in queue:
                            queue.append(link)

            except Exception as e:
                print(f"    Error scraping sub-page {current_url}: {e}")

        return "\n\n".join(all_text_blocks)
    
    except Exception as e:
        print(f"Error executing monitor {start_url}: {e}")
        return None
    finally:
        await page.close()

async def process_monitor(monitor, context, monitors_col, semaphore):
    async with semaphore:
        new_text = await scrape_monitor(context, monitor)
        
        if new_text is None:
            return
        
        if monitor.get('is_first_run'):
            print(f"First run for {monitor['url']}. Saving base text.")
            monitors_col.update_one(
                {"_id": monitor["_id"]},
                {
                    "$set": {
                        "last_scraped_text": new_text,
                        "is_first_run": False,
                        "last_updated_timestamp": datetime.datetime.now()
                    }
                }
            )
        else:
            old_text = monitor.get('last_scraped_text', '')
            
            if old_text != new_text:
                print(f"Changes detected on {monitor['url']}")
                summary = await summarize_changes(old_text, new_text)
                
                if "No significant changes" not in summary:
                    monitors_col.update_one(
                        {"_id": monitor["_id"]},
                        {
                            "$set": {
                                "last_scraped_text": new_text,
                                "latest_ai_summary": summary,
                                "last_updated_timestamp": datetime.datetime.now()
                            }
                        }
                    )
                    
                    # Trigger notifications via Netlify
                    await trigger_notifications(monitor, summary)
                else:
                    print(f"AI determined changes were not significant for {monitor['url']}.")
                    monitors_col.update_one(
                        {"_id": monitor["_id"]},
                        {"$set": {"last_updated_timestamp": datetime.datetime.now()}}
                    )
            else:
                print(f"No changes on {monitor['url']}")
                monitors_col.update_one(
                    {"_id": monitor["_id"]},
                    {"$set": {"last_updated_timestamp": datetime.datetime.now()}}
                )

async def run_worker():
    client = MongoClient(MONGO_URI)
    db = client.get_database("webwatcher")
    monitors_col = db.monitors
    
    monitors = list(monitors_col.find({}))
    print(f"Found {len(monitors)} monitors to process")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        )
        
        # Limit concurrent browser tabs to 5
        semaphore = asyncio.Semaphore(5)
        
        # Create a task for each monitor
        tasks = [
            process_monitor(monitor, context, monitors_col, semaphore)
            for monitor in monitors
        ]
        
        # Run all tasks concurrently
        await asyncio.gather(*tasks)

        await browser.close()
    client.close()

if __name__ == "__main__":
    asyncio.run(run_worker())
