# -*- coding: utf-8 -*-
import asyncio
import os
from scraper import summarize_changes

async def main():
    print("Testing Standard Text Diff with Image Attachment...")
    old_text = "The background of the website is currently green."
    new_text = "The background of the website is currently blue."
    
    test_image = "public/spider-bg-logo.png"
    
    if os.path.exists(test_image):
        print(f"Using {test_image} for vision test.")
    else:
        print("Image not found. Run from root dir.")
        test_image = None
        
    ai_note = "Did the background color change?"
    
    # 1. Test standard mode with an image explicitly passed
    res1 = await summarize_changes(old_text, new_text, ai_focus_note=ai_note, trigger_mode_enabled=False, image_path=test_image)
    print("\n--- STANDARD MODE RESULT ---")
    print(res1)
    
    # 2. Test Trigger mode with an image explicitly passed
    res2 = await summarize_changes(old_text, new_text, ai_focus_note=ai_note, trigger_mode_enabled=True, image_path=test_image)
    print("\n--- TRIGGER MODE RESULT ---")
    print(res2)

if __name__ == "__main__":
    import sys
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    asyncio.run(main())
