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
from PIL import Image
import numpy as np

load_dotenv()

# Configuration
MONGO_URI = os.getenv("MONGO_URI", "").strip()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
# Netlify URL for notifications
NETLIFY_URL = os.getenv("NETLIFY_URL", "http://localhost:8888").strip() # Default for local dev
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "").strip()
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()

# AI Setup
client = genai.Client(api_key=GEMINI_API_KEY)

async def trigger_notifications(monitor_doc, summary, image_path=None):
    notify_url = f"{NETLIFY_URL}/.netlify/functions/notify"
    headers = {
        "Content-Type": "application/json"
    }
    if WEBHOOK_SECRET:
        headers["Authorization"] = f"Bearer {WEBHOOK_SECRET}"

    # Handle Telegram Photo if visual mode is enabled and we have an image
    telegram_enabled = monitor_doc.get('telegram_notifications_enabled', False)
    chat_id = monitor_doc.get('telegram_chat_id', '')
    telegram_photo_sent = False

    if telegram_enabled and chat_id and image_path and os.path.exists(image_path) and TELEGRAM_BOT_TOKEN:
        print(f"Sending visual screenshot to Telegram for {monitor_doc['url']}")
        try:
            tg_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendPhoto"
            with open(image_path, "rb") as f:
                tg_res = requests.post(tg_url, data={
                    "chat_id": chat_id,
                    "caption": f"🚨 **Visual Update Detected!**\n\n{summary}\n\nURL: {monitor_doc['url']}",
                    "parse_mode": "Markdown"
                }, files={"photo": f}, timeout=15)
                
                if tg_res.status_code == 200:
                    print(f"Telegram photo sent successfully.")
                    telegram_photo_sent = True
                else:
                    print(f"Telegram photo failed: {tg_res.text}")
        except Exception as tg_e:
            print(f"Error sending Telegram photo: {tg_e}")

    # Standard Payload for notify.js (Emails + Telegram fallback)
    payload = {
        "monitor": {
            "url": monitor_doc['url'],
            "user_email": monitor_doc['user_email'],
            "email_notifications_enabled": monitor_doc.get('email_notifications_enabled', False),
            # Only ask notify.js to send Telegram if we DIDN'T successfully send a photo already
            "telegram_notifications_enabled": telegram_enabled if not telegram_photo_sent else False,
            "telegram_chat_id": chat_id
        },
        "summary": summary
    }

    try:
        response = requests.post(notify_url, json=payload, headers=headers, timeout=10)
        if response.status_code == 200:
            print(f"Standard Notifications (Email/Proxy) triggered for {monitor_doc['url']}")
        else:
            print(f"Failed to trigger standard notifications: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"Error calling notification function: {e}")
        
    # --- CUSTOM DISCORD / SLACK WEBHOOK HANDLING ---
    custom_webhook = monitor_doc.get('custom_webhook_url', '')
    if custom_webhook:
        print(f"Firing custom webhook for {monitor_doc['url']}")
        
        # Prepare embedded message structure that works for Discord
        discord_payload = {
            "content": f"🚨 **Update Detected:** {monitor_doc['url']}",
            "embeds": [{
                "title": "Web Spider Alert",
                "description": summary,
                "color": 16711680 # Red
            }]
        }
        
        try:
            # If we have an image diff, send it as multipart form-data (Discord natively supports this)
            if image_path and os.path.exists(image_path) and "discord.com" in custom_webhook.lower():
                with open(image_path, "rb") as f:
                    # When sending files, payload must be sent as 'payload_json' in data
                    response = requests.post(
                        custom_webhook,
                        data={"payload_json": json.dumps(discord_payload)},
                        files={"file": (os.path.basename(image_path), f, "image/png")},
                        timeout=15
                    )
            else:
                # Standard JSON webhook
                response = requests.post(custom_webhook, json=discord_payload, timeout=15)
                
            if response.status_code in [200, 204]:
                print(f"Custom Webhook success for {monitor_doc['url']}")
            else:
                print(f"Custom webhook failed: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"Error firing custom webhook: {e}")

def compare_images(img_path1, img_path2):
    """
    Compares two images using Numpy/Pillow and returns the percentage of pixels that changed.
    Uses structural difference to ignore minor compression artifacts.
    """
    try:
        if not os.path.exists(img_path1) or not os.path.exists(img_path2):
            return 100.0 # Treat missing old image as 100% changed
            
        i1 = Image.open(img_path1).convert('RGB')
        i2 = Image.open(img_path2).convert('RGB')
        
        # Ensure identical sizes for strict comparison by resizing i2 to i1 if necessary
        # Usually they are same size from playwright, but deep crawl varying heights can cause issues
        if i1.size != i2.size:
            # Quick cheap diff: size changed
            return 100.0

        n1 = np.array(i1)
        n2 = np.array(i2)
        
        # Calculate absolute difference between RGB values
        diff = np.abs(n1.astype(int) - n2.astype(int))
        
        # Count pixels where any color channel differs by more than a tiny threshold 
        # (Threshold 10 out of 255 ignores tiny anti-aliasing shifts)
        threshold = 10
        changed_pixels = np.sum(np.any(diff > threshold, axis=-1))
        
        total_pixels = n1.shape[0] * n1.shape[1]
        percent_diff = (changed_pixels / total_pixels) * 100.0
        
        return percent_diff
    except Exception as e:
         print(f"Image Compare Error: {e}")
         return 0.0 # Safety fallback

async def summarize_changes(old_text, new_text, ai_focus_note="", trigger_mode_enabled=False):
    # If Trigger Mode is enabled, we completely bypass diffing the old/new text.
    # We strictly evaluate the NEW text against the user's condition.
    if trigger_mode_enabled and ai_focus_note:
        prompt = f"""
        You are a highly analytical 'Sniper Bot'. Your job is to evaluate if a strictly defined Trigger Condition has been met on a webpage.
        
        TRIGGER CONDITION:
        {ai_focus_note}
        
        CURRENT WEBPAGE TEXT:
        {new_text[:25000]} # Limit to prevent token overflow, 25k chars is ~6k tokens
        
        Evaluate the webpage text. Has the TRIGGER CONDITION been met?
        If YES, reply EXACTLY starting with "TRUE", followed by a new line and a very brief 1-sentence explanation of what you found.
        If NO, reply EXACTLY starting with "FALSE", followed by nothing else.
        """
        try:
            await asyncio.sleep(2)
            response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
            result_text = response.text.strip()
            
            if result_text.startswith("TRUE"):
                # Strip the "TRUE" to leave just the explanation
                explanation = result_text[4:].strip()
                return f"🎯 SNIPER TRIGGER MET: {explanation}"
            else:
                return "TRIGGER_NOT_MET"
                
        except Exception as e:
            print(f"Gemini API Error (Sniper Mode): {e}")
            return "TRIGGER_NOT_MET" # Fail safely

    # --- Standard Diff Mode Below ---
    differ = difflib.ndiff(old_text.splitlines(), new_text.splitlines())
    
    diff_lines = []
    for line in differ:
        if line.startswith('+ ') or line.startswith('- '):
            diff_lines.append(line)
            
    diff_text = "\n".join(diff_lines)
    
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
        await asyncio.sleep(2)
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return response.text.strip()
    except Exception as e:
        print(f"Gemini API Error: {e}")
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

async def scrape_monitor(context, monitor_doc, monitors_col, screenshot_path=None):
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
                
                # Take Optional Screenshot of the main page
                if screenshot_path and current_url == start_url:
                    try:
                        await page.wait_for_timeout(2000) # Wait for late-loading images/fonts
                        await page.screenshot(path=screenshot_path, full_page=True)
                        print(f"Saved visual screenshot for {start_url}")
                    except Exception as img_e:
                        print(f"Failed to capture screenshot for {start_url}: {img_e}")

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

        # Set up Visual Mode paths
        visual_mode_enabled = monitor.get('visual_mode_enabled', False)
        screenshots_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'screenshots')
        if visual_mode_enabled:
            os.makedirs(screenshots_dir, exist_ok=True)
            
        monitor_id = str(monitor['_id'])
        current_screenshot_path = os.path.join(screenshots_dir, f"{monitor_id}_current.png") if visual_mode_enabled else None
        last_screenshot_path = os.path.join(screenshots_dir, f"{monitor_id}_last.png") if visual_mode_enabled else None

        # Create an isolated browser context per monitor
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        )
        try:
            new_text = await scrape_monitor(context, monitor, monitors_col, screenshot_path=current_screenshot_path)
            
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
        trigger_mode_enabled = monitor.get('trigger_mode_enabled', False)

        if monitor.get('is_first_run'):
            print(f"First run for {monitor['url']}. Saving base text.")
            
            # For the first run, generate an initial baseline summary
            summary = await summarize_changes("No previous content. This is the first time the page is being scanned.", new_text, ai_focus_note, trigger_mode_enabled)
            
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
            
            # Send notification for the first run if it's NOT a silent trigger initialization
            if summary != "TRIGGER_NOT_MET":
                await trigger_notifications(monitor, summary, image_path=current_screenshot_path if visual_mode_enabled else None)
                
            # Overwrite the old image baseline
            if visual_mode_enabled and current_screenshot_path and os.path.exists(current_screenshot_path):
                if os.path.exists(last_screenshot_path):
                    os.remove(last_screenshot_path)
                os.rename(current_screenshot_path, last_screenshot_path)
        else:
            # Handle Visual Screen Monitoring Mode
            if visual_mode_enabled:
                print(f"Evaluating Visual Output for {monitor['url']}")
                
                # Compare the new screenshot against the old one
                percent_diff = compare_images(last_screenshot_path, current_screenshot_path)
                print(f"Visual Diff Percentage: {percent_diff:.2f}%")
                
                if percent_diff > 1.0: # 1% threshold
                    summary = f"📸 VISUAL CHANGE DETECTED: {percent_diff:.2f}% of the screen has changed."
                    
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
                    await trigger_notifications(monitor, summary, image_path=current_screenshot_path)
                    
                    # Store as new baseline
                    if os.path.exists(last_screenshot_path):
                        os.remove(last_screenshot_path)
                    if os.path.exists(current_screenshot_path):
                        os.rename(current_screenshot_path, last_screenshot_path)
                else:
                    print(f"Visual diff too small ({percent_diff:.2f}%) for {monitor['url']}.")
                    monitors_col.update_one(
                        {"_id": monitor["_id"]},
                        {"$set": {"last_updated_timestamp": datetime.datetime.now()}}
                    )
                    if current_screenshot_path and os.path.exists(current_screenshot_path):
                        os.remove(current_screenshot_path) # Cleanup unused temp image

            # Handle Sniper Trigger Mode
            elif trigger_mode_enabled:
                print(f"Evaluating Trigger Mode for {monitor['url']}")
                summary = await summarize_changes("", new_text, ai_focus_note, trigger_mode_enabled)
                
                if summary != "TRIGGER_NOT_MET":
                     monitors_col.update_one(
                        {"_id": monitor["_id"]},
                        {
                            "$set": {
                                "last_scraped_text": new_text, # update text to prevent endless re-triggers for the exact same state (optional, but good practice)
                                "latest_ai_summary": summary,
                                "last_updated_timestamp": datetime.datetime.now()
                            }
                        }
                    )
                     await trigger_notifications(monitor, summary)
                else:
                    print(f"Sniper Trigger NOT met for {monitor['url']}.")
                    # Update timestamp so user knows it checked, but silent
                    monitors_col.update_one(
                        {"_id": monitor["_id"]},
                        {"$set": {"last_updated_timestamp": datetime.datetime.now()}}
                    )

            # Handle Standard Mode
            else:
                old_text = monitor.get('last_scraped_text', '')
                
                if old_text != new_text:
                    print(f"Changes detected on {monitor['url']}")
                    summary = await summarize_changes(old_text, new_text, ai_focus_note, trigger_mode_enabled)
                    
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
