# Rexipt AI Employee - Complete Setup Guide

This guide walks you through setting up the Rexipt AI Employee CLI tool, with special attention to the Shopify integration which requires careful configuration.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Shopify Integration Setup](#shopify-integration-setup)
5. [Other Integrations](#other-integrations)
6. [Running Skills](#running-skills)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have:

- **Node.js** v18 or higher
- **npm** v9 or higher
- A **Shopify store** (required for most skills)
- An **AI provider API key** (OpenAI or Anthropic)
- Optional: Slack webhook URL or Telegram bot for notifications

---

## Installation

### Global Installation (Recommended)

```bash
npm install -g @rexipt/ai-employee
```

### Local Development

```bash
git clone <repository-url>
cd ai-employee
npm install
npm run build
```

For development with hot reload:
```bash
npm run dev -- <command>
```

### Updating Package

```bash
npm update @rexipt/ai-employee
```

---

## Quick Start

```bash
# 1. Initialize configuration
rexipt-ai init

# 2. Connect Shopify (recommended OAuth method)
rexipt-ai shopify oauth-connect

# 3. Verify setup
rexipt-ai doctor

# 4. Run a skill
rexipt-ai run dailyBriefing

# 5. Start the scheduler daemon
rexipt-ai start --daemon
```

---

## Shopify Integration Setup

This is the most critical integration. Follow these steps carefully.

### Step 1: Create a Custom App in Shopify Dev Dashboard

1. Go to your Shopify Admin: `https://admin.shopify.com/store/YOUR-STORE/settings/apps`
2. Click **"Settings"** → **"Apps and sales channels"**
3. Click **"Develop apps"** (or find the development section)
4. Click **"Dev Dashboard"** button
5. Click **"Create an app"**
6. Name your app (e.g., "Rexipt AI Employee")

### Step 2: Configure API Scopes

In your app's configuration, add these **Admin API scopes**:

```
read_orders,read_products,read_customers,read_discounts,write_inventory,write_orders,write_products
```

### Step 3: Configure Redirect URL

Add this **redirect URL** to your app's allowed URLs:

```
http://127.0.0.1:3456/callback
```

> ⚠️ **Important:** Without this redirect URL, the OAuth flow will fail with "redirect_uri is not whitelisted" error.

### Step 4: Enable Protected Customer Data Access

This step is **critical** - without it, you'll get 403 errors when accessing order/customer data.

1. In your app's Dev Dashboard, find **"App setup"** → **"Protected customer data access"**
2. **Select your data use reasons:**
   - ✅ Store management
   - ✅ Analytics
   - (Optional) Customer service, Personalization
   
3. **Select protected customer fields:**
   - ✅ Name
   - ✅ Email
   - ✅ Phone
   - ✅ Address

4. **Complete Data Protection Details:**

   | Question | Recommended Answer |
   |----------|-------------------|
   | Process minimum personal data required? | Yes |
   | Tell merchants what data you process? | Yes |
   | Limit use to that purpose? | Yes |
   | Privacy agreements with merchants? | Yes |
   | Respect consent decisions? | Yes |
   | Respect opt-out of data sale? | Not applicable |
   | Opt-out of automated decision-making? | Not applicable |
   | Retention periods? | Yes |
   | Encrypt data at rest and in transit? | Yes |

5. **Save** the configuration

### Step 5: Release and Install the App

1. Go back to your app's main page
2. Click **"Release"** to create a version
3. **Install** the app to your store

### Step 6: Get Your Credentials

After installation:

1. Go to your app's **"API credentials"** or **"Client credentials"** section
2. Copy the **Client ID** (API key)
3. Copy the **Client Secret** (you may need to reveal/generate it)

### Step 7: Connect via CLI

Run the OAuth connect command:

```bash
rexipt-ai shopify oauth-connect
```

You'll be prompted for:
- **Store name:** `your-store.myshopify.com`
- **Client ID:** (paste from step 6)
- **Client Secret:** (paste from step 6)

The CLI will:
1. Open your browser for authorization
2. You'll approve the app permissions
3. The CLI captures the authorization code
4. Exchanges it for an **offline access token** (non-expiring)
5. Saves the token encrypted in your config

### Step 8: Verify Connection

```bash
rexipt-ai doctor
```

You should see:
```
✓ Shopify: Connected to your-store.myshopify.com
```

---

## Authentication Methods Explained

### OAuth Connect (Recommended) ✅

```bash
rexipt-ai shopify oauth-connect
```

- Uses **Authorization Code Grant Flow**
- Gets an **offline token** that doesn't expire
- Ideal for scheduled background tasks
- Requires browser authorization once

### Client Credentials Connect ⚠️

```bash
rexipt-ai shopify connect
```

- Uses **Client Credentials Flow**
- Gets a **short-lived token** (24 hours)
- Requires re-authentication daily
- **Not recommended** for production use

---

## Other Integrations

### AI Provider (Required)

During `rexipt-ai init`, select your AI provider:

**Anthropic (Recommended):**
- Get API key from: https://console.anthropic.com/
- Model: `claude-3-5-sonnet-20241022`

**OpenAI:**
- Get API key from: https://platform.openai.com/api-keys
- Model: `gpt-4o-mini`

### Google Ads

Requires OAuth setup:
1. Developer Token from Google Ads
2. OAuth Client ID and Secret
3. Refresh Token from OAuth flow

### Meta Ads

1. Get Ad Account ID from Meta Business Suite
2. Generate Access Token from Meta Developer Portal

### TikTok Ads / TikTok Shop

1. Create app in TikTok Developer Portal
2. Get App Key, App Secret, and Access Token

### Klaviyo

1. Get API Key from Klaviyo Account Settings

### Notifications

**Slack:**
1. Create a Slack App at https://api.slack.com/apps
2. Create an Incoming Webhook
3. Copy the webhook URL

**Telegram:**
1. Create a bot via @BotFather
2. Get the bot token
3. Get your chat ID

---

## Running Skills

### Available Skills

| Skill | Description | Schedule |
|-------|-------------|----------|
| `dailyBriefing` | Revenue, spend, MER analysis with AI insights | Daily 7am |
| `anomalyDetection` | Detects unusual patterns in metrics | Continuous |
| `customerSegmentation` | Segments customers by behavior | Weekly |
| `competitorIntel` | Competitor analysis | Weekly |
| `creativeStrategy` | Ad creative recommendations | Weekly |
| `weeklyPL` | Profit & Loss report | Monday 6am |

### Run a Single Skill

```bash
rexipt-ai run dailyBriefing
rexipt-ai run anomalyDetection
rexipt-ai run customerSegmentation
```

### Run All Enabled Skills

```bash
rexipt-ai run-all
```

### Start the Scheduler

```bash
# Run in foreground
rexipt-ai start

# Run as background daemon
rexipt-ai start --daemon

# Stop the daemon
rexipt-ai stop
```

### Check Status

```bash
rexipt-ai status
```

### View Logs

```bash
# All logs
rexipt-ai logs

# Filter by skill
rexipt-ai logs --skill dailyBriefing

# Filter by status
rexipt-ai logs --status failed

# Recent logs
rexipt-ai logs --since-days 7
```

---

## Troubleshooting

### Error: "redirect_uri is not whitelisted"

**Cause:** The redirect URL isn't configured in your Shopify app.

**Fix:**
1. Go to your Shopify app in Dev Dashboard
2. Find Configuration → URLs
3. Add `http://127.0.0.1:3456/callback` to Allowed redirect URLs
4. Save and try again

### Error: "403: Protected customer data access not enabled"

**Cause:** Your Shopify app doesn't have protected customer data access enabled.

**Fix:**
1. Go to your app in Shopify Dev Dashboard
2. Navigate to "App setup" → "Protected customer data access"
3. Select your data use reasons (Store management, Analytics)
4. Select protected fields (Name, Email, Phone, Address)
5. Complete the Data Protection Details form
6. Save, release a new version, and reinstall the app
7. Run `rexipt-ai shopify oauth-connect` to get a new token

### Error: "app_not_installed"

**Cause:** The app hasn't been installed to your store.

**Fix:**
1. Go to your app in Shopify Dev Dashboard
2. Click "Install" or "Install app"
3. Approve the permissions
4. Try connecting again

### Error: "Invalid Client ID or Client Secret"

**Cause:** Credentials are incorrect or from a different app.

**Fix:**
1. Go to your app's API credentials section
2. Verify you're copying the correct Client ID
3. Regenerate the Client Secret if needed
4. Make sure you're using credentials from the same app

### Error: "Shopify API error 401"

**Cause:** Access token is invalid or expired.

**Fix:**
```bash
# For OAuth tokens (shouldn't expire, but may be revoked)
rexipt-ai shopify oauth-connect

# For client credentials tokens (expire in 24h)
rexipt-ai shopify connect
```

### Error: "Configuration not found"

**Cause:** Haven't run init yet.

**Fix:**
```bash
rexipt-ai init
```

### Skill Runs But No Data

**Possible causes:**
- Store has no orders in the reporting period
- Integration not enabled in config
- API scopes missing

**Check:**
```bash
rexipt-ai doctor
rexipt-ai config --validate
```

---

## Configuration Reference

### Config File Location

```bash
rexipt-ai config --path
# Output: ~/.rexipt/ai-employee/config.json
```

### View Current Config

```bash
rexipt-ai config
```

### Set Config Values

```bash
# Non-secret values
rexipt-ai config set integrations.shopify.storeUrl your-store.myshopify.com
rexipt-ai config set organization.timezone America/New_York

# Secret values (from environment variable)
export SHOPIFY_TOKEN=shpua_xxxxx
rexipt-ai config set-secret integrations.shopify.accessToken SHOPIFY_TOKEN
```

### List All Config Keys

```bash
rexipt-ai config list-keys
```

### Validate Config

```bash
rexipt-ai config validate
```

---

## Best Practices

1. **Always use OAuth connect** for Shopify - it provides non-expiring tokens
2. **Run `doctor`** after any configuration change
3. **Enable protected customer data** before connecting - saves troubleshooting time
4. **Start with `run` commands** before enabling the daemon scheduler
5. **Check logs** when skills fail to understand the issue
6. **Keep credentials secure** - they're encrypted in config but treat them carefully

---

## Getting Help

- Run `rexipt-ai --help` for command list
- Run `rexipt-ai <command> --help` for command-specific help
- Check logs: `rexipt-ai logs --status failed`
- Run diagnostics: `rexipt-ai doctor`

---

## Quick Reference Card

```bash
# Setup
rexipt-ai init                    # Initialize config
rexipt-ai shopify oauth-connect   # Connect Shopify (recommended)
rexipt-ai doctor                  # Verify setup

# Run Skills
rexipt-ai run <skillId>           # Run one skill
rexipt-ai run-all                 # Run all enabled skills

# Scheduler
rexipt-ai start --daemon          # Start background scheduler
rexipt-ai stop                    # Stop scheduler
rexipt-ai status                  # Check status

# Debugging
rexipt-ai logs                    # View logs
rexipt-ai config --validate       # Validate config
rexipt-ai doctor                  # Run diagnostics
```
