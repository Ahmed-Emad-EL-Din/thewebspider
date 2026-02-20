# Web Watcher - Technical Documentation & Walkthrough

Web Watcher is a full-stack automated monitoring platform that tracks webpage changes, generates AI-powered summaries of significant updates using Google Gemini, and notifies users via Email and Telegram.

## 🏗️ Architecture Overview

The system is designed as a distributed application to leverage serverless cost-efficiency and GitHub's automation:

- **Frontend**: Vanilla HTML/CSS/JS dashboard deployed on **Netlify**.
- **Backend (Serverless API)**: **Netlify Functions** (Node.js) communicating with a **MongoDB** database.
- **Background Worker**: **Python 3** script (`scraper.py`) utilizing **Playwright** for headless scraping and **Google Gemini 1.5 Flash** for analysis.
- **Scheduler**: **GitHub Actions** (cron job) running the worker every 10 minutes.
- **Notifications Proxy**: A dedicated Netlify Function (`notify.js`) that decouples the scraper from direct notification delivery (handles Telegram & SMTP Email).

## 🛠️ Tech Stack & Dependencies

- **Frontend**: Google Identity Services (OAuth), CSS Grid/Flexbox, Vanilla JS fetch API.
- **API**: `mongodb` (Node driver), `nodemailer`.
- **Worker**: `playwright-python`, `pymongo`, `google-generativeai`, `requests`.
- **Infrastructure**: Netlify, GitHub Actions, MongoDB Atlas.

## 💾 Core Logic & Flow

### 1. Scraper Logic (`scraper.py`)
- **First Run**: If a monitor's `is_first_run` flag is `true`, the scraper captures the baseline `innerText` and stores it. No AI analysis or notification is triggered.
- **Change Detection**: On subsequent runs, the new text is compared against `last_scraped_text`.
- **AI Analysis**: If changes exist, Gemini 1.5 Flash compares the old and new content. If the AI identifies "Significant changes", it generates 2-3 bullet points. Minor changes (like timestamps) are ignored based on the prompt.
- **Notification Proxy**: The scraper POSTs to the Netlify `notify` function, which then executes the user's notification preferences.

### 2. Dashboard Rules
- **10-Page Limit**: Enforced both on the client side (UI) and server side (API) to prevent users from exceeding 10 active monitors.
- **Auth Gate**: A strict overlay requires Google Login before the dashboard initializes.

## ⚙️ Configuration & Secrets

The following environment variables are required across both Netlify and GitHub:

| Variable | Description | Location |
| :--- | :--- | :--- |
| `MONGO_URI` | MongoDB Atlas Connection String | Netlify & GitHub |
| `GEMINI_API_KEY` | Google AI Studio API Key | GitHub |
| `GOOGLE_CLIENT_ID` | OAuth Client ID from Google Cloud | Netlify (via JS) |
| `TELEGRAM_BOT_TOKEN`| Bot API token from @BotFather | Netlify |
| `NETLIFY_URL` | Your production site URL | GitHub |
| `EMAIL_HOST` | SMTP Host (e.g., smtp.gmail.com) | Netlify |
| `EMAIL_PORT` | SMTP Port (587 or 465) | Netlify |
| `EMAIL_HOST_USER` | SMTP Username | Netlify |
| `EMAIL_HOST_PASSWORD`| SMTP App-Specific Password | Netlify |

## 🚀 Comprehensive Deployment Guide (AI & Human Friendly)

This section provides a rigorous, step-by-step guide for deploying the Web Watcher ecosystem. It is structured to be easily parsable by an AI agent assisting you, or by a human developer.

### Phase 1: Database Provisioning (MongoDB Atlas)
1. **Create Account/Login**: Navigate to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and authenticate.
2. **Deploy Cluster**: Create a new free-tier cluster (M0 Sandbox).
3. **Database User Setup**: Go to **Database Access** > **Add New Database User**. Choose "Password" authentication. Note the `<username>` and `<password>`.
4. **Network Access**: Go to **Network Access** > **Add IP Address**. Allow access from anywhere (`0.0.0.0/0`) since Netlify and GitHub Actions IP addresses are dynamic.
5. **Get Connection String**: Go back to **Databases** > **Connect** > **Drivers** (Node.js/Python). Copy the URI string. It will look like: 
   `mongodb+srv://<username>:<password>@clusterX.mongodb.net/?retryWrites=true&w=majority`
6. **Assign Database Name**: In the connection string, insert the database name `webwatcher` before the `?`, like so: `...mongodb.net/webwatcher?retryWrites...`. This exact string is your `MONGO_URI`.

### Phase 2: Authentication Configuration (Google OAuth)
1. **Google Cloud Console**: Navigate to [Google Cloud](https://console.cloud.google.com/). Create a new generic "Project" (e.g., "Web Watcher App").
2. **OAuth Consent Screen**: Search and go to "OAuth consent screen". Choose "External" and fill out the required App Name and Support Email fields.
3. **Create Credentials**: Go to **Credentials** > **Create Credentials** > **OAuth client ID**.
4. **App Type**: Select "Web application".
5. **Authorized JavaScript Origins**: Add your local development URL (e.g., `http://localhost:8888`) AND your future production URL (e.g., `https://your-custom-name.netlify.app`).
6. **Capture ID**: Copy the generated "Client ID" (e.g., `123456789-abcde...apps.googleusercontent.com`).
7. **Code Setup**: Because this frontend uses Vite, you **do not** paste this ID into the code directly. Instead, you assign the "Client ID" from Step 6 to an environment variable named `VITE_GOOGLE_CLIENT_ID`.
   - **For Local Development**: Open the `.env` file in the root of your project and add the following line:
     `VITE_GOOGLE_CLIENT_ID=your_copied_client_id_here.apps.googleusercontent.com`
   - **For Production (Netlify)**: Because your `.env` file is safely ignored by Git, you will need to add this exact same `VITE_GOOGLE_CLIENT_ID` variable in the Netlify Dashboard (explained in Phase 4).

### Phase 3: Notification Integrations

#### Telegram Bot Setup
1. **Bot Creation**: Open Telegram App. Search for `@BotFather`. Start a chat and send `/newbot`.
2. **Bot Token**: Follow the prompts to name your bot. Upon success, `@BotFather` will provide an HTTP API Token. This string is your `TELEGRAM_BOT_TOKEN`.
3. **Automated Linking (Magic!)**: You do **not** need to manually find Chat IDs or configure Webhooks anymore! The Web Watcher application now features a seamless deep-linking integration.
   - When a user clicks "Add Monitor" and enables Telegram, they simply click the **"Connect Telegram App"** button.
   - Behind the scenes, our `telegram-config` Netlify function automatically sets up a secure webhook with Telegram.
   - The user opens Telegram, clicks "Start", and the dashboard instantly auto-fills their Chat ID via background polling.
1. **App Passwords**: For security, do not use your primary account password. If using Gmail, go to Google Account Manage > Security > 2-Step Verification > App passwords.
2. **Generate**: Create a new app password for "Other (Custom name)" and call it "Web Watcher".
3. **Credentials**:
   - `EMAIL_HOST`: `smtp.gmail.com`
   - `EMAIL_PORT`: `587`
   - `EMAIL_HOST_USER`: Your Gmail address.
   - `EMAIL_HOST_PASSWORD`: The 16-character app password generated above.

### Phase 4: Frontend & API Hosting (Netlify)
1. **Connect Git Repository**: Log into Netlify. Click **Add new site** > **Import an existing project** > **GitHub**. Select the `webwatcher` repository.
2. **Build Settings**: 
   - **Base directory**: Leave blank.
   - `Publish directory`: `dist` (Vite's default build output)
   - `Functions directory`: `functions` (Netlify will automatically detect and build the Node.js files here, installing packages from `package.json`).
3. **Environment Variables**: Before clicking "Deploy", click **Add environment variables**. Add the following:
   - `MONGO_URI`
   - `VITE_GOOGLE_CLIENT_ID` (Your Google Auth Client ID)
   - `TELEGRAM_BOT_TOKEN`
   - `EMAIL_HOST`
   - `EMAIL_PORT`
   - `EMAIL_HOST_USER`
   - `EMAIL_HOST_PASSWORD`
4. **Deploy**: Click **Deploy site**. Once live, note the production URL (e.g., `https://your-watcher.netlify.app`).

### Phase 5: AI Scraper & Automation (GitHub Actions)
1. **Gemini API Key**: Go to [Google AI Studio](https://aistudio.google.com/app/apikey) and generate a free API key. This is your `GEMINI_API_KEY`.
2. **GitHub Repository Settings**: Go to the GitHub repository page corresponding to this project.
3. **Secrets Setup**: Navigate to **Settings** > **Secrets and variables** > **Actions** > **New repository secret**.
4. **Add Secrets**: Add the following secrets one by one:
   - `MONGO_URI` (Same as Netlify)
   - `GEMINI_API_KEY` (From AI Studio)
   - `NETLIFY_URL` (The production URL from Phase 4, e.g., `https://your-watcher.netlify.app`)
5. **Activate Automation**:
   - Go to the **Actions** tab in the GitHub repo.
   - Click "I understand my workflows, go ahead and enable them" (if prompted).
   - You can manually trigger the "Web Watcher Scraper" workflow to test it immediately.
   - Otherwise, the cron job (`watcher.yml`) will run automatically every 10 minutes.

### 📤 Phase 6: Syncing Local Code to GitHub (For Multi-Account Users)
If you are developing locally and need to push to a specific GitHub profile:
1. Ensure your local `git` directory is ready:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```
2. Verify SSH/Auth context for the correct account using GitHub CLI:
   ```bash
   gh auth status
   # If incorrect, run: gh auth logout && gh auth login
   ```
3. Add remote and push:
   ```bash
   git remote add origin https://github.com/TARGET_USERNAME/webwatcher.git
   git branch -M main
   git push -u origin main
   ```

> [!CAUTION]
> Rely on `.gitignore`. Ensure `.env` is fully excluded so raw credentials do not leak onto public repository pages.

---
*Developed by Antigravity AI*
