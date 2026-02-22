import os
import json
import asyncio
import datetime
import requests
import difflib
from urllib.parse import urlparse, urljoin
from pymongo import MongoClient
from playwright.async_api import async_playwright
from google import genai
from dotenv import load_dotenv

load_dotenv()

# Configuration
MONGO_URI = os.getenv("MONGO_URI", "").strip()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
# Netlify URL for notifications
NETLIFY_URL = os.getenv("NETLIFY_URL", "http://localhost:8888").strip() # Default for local dev
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "").strip()

# AI Setup
client = genai.Client(api_key=GEMINI_API_KEY)

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

async def summarize_changes(old_text, new_text, ai_focus_note=""):
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

    focus_instruction = f"\n    The user has provided a specific focus note: '{ai_focus_note}'. Please prioritize this in your summary and evaluate if the change is significant based ONLY on this note." if ai_focus_note else ""

    prompt = f"""
    Analyze the following text diff between an old version and a new version of a webpage.{focus_instruction}
    Lines starting with '- ' were removed, and lines starting with '+ ' were added.
    Summarize the significant changes in 2-3 concise bullet points.
    If the changes are only minor (like timestamps, ads, UI state changes, or random numbers), state exactly "No significant changes".
    
    DIFF:
    {diff_text}
    """
    
    try:
        # Add a small delay to avoid hitting Gemini rate limits too quickly on concurrent summaries
        await asyncio.sleep(2)
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return response.text.strip()
    except Exception as e:
        print(f"Gemini API Error: {e}")
        # Wait a bit longer and retry once if it's a rate limit or transient error
        await asyncio.sleep(5)
        try:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
            )
            return response.text.strip()
        except Exception as retry_e:
            print(f"Gemini API Retry Error: {retry_e}")
            return "Manual check required due to summarization error. (API Overloaded)"

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
            
    return sorted(list(valid_links))

async def scrape_monitor(context, monitor_doc, monitors_col):
    start_url = monitor_doc['url']
    is_deep_crawl = monitor_doc.get('deep_crawl', False)
    # Default to depth 1 if not present (backwards compat)
    max_depth = monitor_doc.get('deep_crawl_depth', 1) if is_deep_crawl else 1 
    
    visited = set()
    # Queue stores tuples of (URL, current_depth)
    queue = [(start_url, 1)]
    all_text_blocks = {}
    
    print(f"Starting Scrape for: {start_url} (Deep Crawl: {is_deep_crawl}, Max Depth: {max_depth})")
    
    # Authenticate only once strictly on the first URL if needed
    page = await context.new_page()
    try:
        # Check for cookies (prioritize auto-extracted, fallback to manual config)
        has_auto_cookies = 'auto_cookies' in monitor_doc and bool(monitor_doc['auto_cookies'])
        cookie_source = monitor_doc.get('auto_cookies') if has_auto_cookies else monitor_doc.get('captcha_json')
        
        if cookie_source:
             try:
                 cookies = cookie_source if has_auto_cookies else json.loads(cookie_source)
                 await context.add_cookies(cookies)
                 print(f"Injected existing cookies for {start_url}")
             except Exception as e:
                 print(f"Error parsing/injecting cookies: {e}")

        # Only execute login if they requested it AND we didn't inject auto_cookies
        # (If auto_cookies are injected but expired, they might land on a login page,
        # but for a basic flow, we trust the injected session until they manually clear it
        # or we could make it smarter to detect. For now, try injecting first.)
        if monitor_doc.get('requires_login') and not has_auto_cookies:
            try:
                await page.goto(start_url, wait_until="networkidle", timeout=60000)
                user_input = await page.query_selector('input[type="text"], input[type="email"], input[name="acct"], input[name="username"], input[name="user"], input[id="login"]')
                pass_input = await page.query_selector('input[type="password"], input[name="pw"], input[name="password"]')
                
                if user_input and pass_input:
                    await user_input.fill(monitor_doc['username'])
                    await pass_input.fill(monitor_doc['password'])
                    await page.keyboard.press("Enter")
                    # 1. Provide an initial forced pause to let the login settle and set cookies
                    await page.wait_for_timeout(2000) 

                    # 2. Handle post-login redirects to dashboards/homepages
                    if page.url != start_url:
                        print(f"Redirected after login. Actively navigating back to intended target: {start_url}")
                        await page.goto(start_url, wait_until="networkidle", timeout=60000)
                        
                    # 3. Extract and preserve session cookies
                    raw_cookies = await context.cookies()
                    if raw_cookies:
                        try:
                            # Force literal dict serialization to prevent PyMongo BSON errors
                            clean_cookies = [dict(c) for c in raw_cookies]
                            print(f"Successfully extracted and saved {len(clean_cookies)} session cookies.")
                            result = monitors_col.update_one(
                                {"_id": monitor_doc["_id"]},
                                {"$set": {"auto_cookies": clean_cookies}}
                            )
                            monitor_doc['auto_cookies'] = clean_cookies # update local reference
                        except Exception as cookie_err:
                            print(f"Failed to save cookies to DB: {cookie_err}")
                            
            except Exception as e:
                print(f"Login automated step failed: {e}")

        # Start BFS
        while queue:
            current_url, current_depth = queue.pop(0)
            
            if current_url in visited:
                continue
                
            visited.add(current_url)
            print(f"  -> Scraping: {current_url} (Depth: {current_depth}/{max_depth})")
            
            try:
                # If it's the exact start_url and we already loaded it for login, skip goto
                if not (current_url == start_url and monitor_doc.get('requires_login')):
                    await page.goto(current_url, wait_until="networkidle", timeout=60000)

                # Extract Text
                content = await page.evaluate("() => document.body.innerText")
                clean_text = " ".join(content.split())
                all_text_blocks[current_url] = f"--- PAGE: {current_url} ---\n{clean_text}"

                # Extract Links if deep crawling AND we haven't reached max depth
                if is_deep_crawl and current_depth < max_depth:
                    new_links = await extract_links(page, start_url)
                    for link in new_links:
                        # Only add if not visited and not already in queue (compare just the url part)
                        if link not in visited and not any(q_url == link for q_url, _ in queue):
                            queue.append((link, current_depth + 1))

            except Exception as e:
                print(f"    Error scraping sub-page {current_url}: {e}")

        sorted_urls = sorted(all_text_blocks.keys())
        return "\n\n".join(all_text_blocks[url] for url in sorted_urls)
    
    except Exception as e:
        print(f"Error executing monitor {start_url}: {e}")
        return None
    finally:
        await page.close()

async def process_monitor(monitor, browser, monitors_col, semaphore):
    async with semaphore:
        # Check if Admin Paused this monitor
        if monitor.get('is_paused', False):
            print(f"Skipping {monitor['url']} (Paused by Admin)")
            return

        # Create an isolated browser context per monitor
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        )
        try:
            new_text = await scrape_monitor(context, monitor, monitors_col)
            
            # If we reach here and new_text is not None, the scrape was a success
            if new_text is not None:
                monitors_col.update_one(
                    {"_id": monitor["_id"]},
                    {"$set": {
                        "last_run_status": "success",
                        "last_error": None
                    }}
                )
        except Exception as e:
            # Catch severe, unhandled failures that bubble up
            error_msg = str(e)
            print(f"CRITICAL FAILURE scraping {monitor.get('url')}: {error_msg}")
            
            monitors_col.update_one(
                {"_id": monitor["_id"]},
                {"$set": {
                    "last_run_status": "failed",
                    "last_error": error_msg,
                    "last_error_time": datetime.datetime.now()
                }}
            )
            return
        finally:
            await context.close()
            
        if new_text is None:
            # Means `scrape_monitor` caught the error internally and returned None
            monitors_col.update_one(
                {"_id": monitor["_id"]},
                {"$set": {
                    "last_run_status": "failed",
                    "last_error": "Failed during internal page navigation or scraping details",
                    "last_error_time": datetime.datetime.now()
                }}
            )
            return
        
        ai_focus_note = monitor.get('ai_focus_note', '')

        if monitor.get('is_first_run'):
            print(f"First run for {monitor['url']}. Saving base text.")
            
            # For the first run, generate an initial baseline summary
            summary = await summarize_changes("No previous content. This is the first time the page is being scanned.", new_text, ai_focus_note)
            
            monitors_col.update_one(
                {"_id": monitor["_id"]},
                {
                    "$set": {
                        "last_scraped_text": new_text,
                        "latest_ai_summary": summary,
                        "is_first_run": False,
                        "last_updated_timestamp": datetime.datetime.now()
                    }
                }
            )
            
            # Send notification for the first run
            await trigger_notifications(monitor, summary)
        else:
            old_text = monitor.get('last_scraped_text', '')
            
            if old_text != new_text:
                print(f"Changes detected on {monitor['url']}")
                summary = await summarize_changes(old_text, new_text, ai_focus_note)
                
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
    db = client.get_database("thewebspider")
    monitors_col = db.monitors
    
    monitors = list(monitors_col.find({}))
    print(f"Found {len(monitors)} monitors to process")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        
        # Limit concurrent browser tabs to 5
        semaphore = asyncio.Semaphore(5)
        
        # Create a task for each monitor
        tasks = [
            process_monitor(monitor, browser, monitors_col, semaphore)
            for monitor in monitors
        ]
        
        # Run all tasks concurrently
        await asyncio.gather(*tasks)

        await browser.close()
    client.close()

if __name__ == "__main__":
    asyncio.run(run_worker())
