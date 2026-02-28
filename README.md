# @rexipt/ai-employee

AI-powered business intelligence CLI for ecommerce operators.

> 📖 **First time setup?** See the **[Complete Setup Guide](./SETUP_GUIDE.md)** for detailed instructions, especially for Shopify integration which requires specific configuration steps.

## Install (Recommended)

This project assumes:

- Node.js `20+`
- npm `11+`

Install Node.js and npm from:

- https://nodejs.org

```bash
npm i -g @rexipt/ai-employee
```

## Binary Names

The package exposes two binaries:

- `rexipt-ai`
- `rai` (short alias)

Examples:

```bash
# after global install
rexipt-ai d
rexipt-ai ra

# short alias
rai d
rai ra
```

## Advanced (Optional)

```bash
# run without global install
npx @rexipt/ai-employee <command>
```

## Developer Setup (Local Repo)

```bash
npm install
# shorthand also works:
npm i
npm run build
```

## Quickstart

```bash
# 1) Initialize config
rexipt-ai init

# 2) Connect Shopify (recommended OAuth code flow)
rexipt-ai shopify oauth-connect

# 3) Run diagnostics
rexipt-ai doctor

# 4) Run all enabled skills once
rexipt-ai run-all

# 5) Start continuous scheduler in daemon mode
rexipt-ai start --daemon

# 6) Inspect runtime and logs
rexipt-ai status
rexipt-ai logs --limit 20

# 7) Stop daemon
rexipt-ai stop
```

## ⚠️ Shopify Setup - Important Steps

Before `shopify oauth-connect` will work, you **must** configure your Shopify app:

1. **Create app** in Shopify Dev Dashboard (not legacy custom apps)
2. **Add redirect URL:** `http://127.0.0.1:3456/callback`
3. **Enable Protected Customer Data Access** - required for order/customer data
4. **Release and install** the app to your store

Without step 3, you'll get `403: Protected customer data` errors.

👉 **See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for detailed step-by-step instructions.**

## AI in This Release

- `dailyBriefing`: multi-source performance synthesis (Shopify, Ads, Klaviyo) with validation.
- `anomalyDetection`: baseline-aware anomaly detection with severity + recommended actions.
- `customerSegmentation`: high-value / at-risk / churned segment generation.
- action queue + approval flow for human-in-the-loop decisions.

## Secrets and Configuration

Run `init` first. It auto-creates the config file at:

```bash
~/.rexipt/ai-employee/config.json
```

Users do not need to create this file manually.

Recommended enterprise workflow:

- Run `init` once to generate baseline config.
- After that, manage secrets in `.env.local` (preferred) instead of editing encrypted values in `config.json`.
- Use `rexipt-ai config --validate` after changes.
- For Shopify, preferred setup is `rexipt-ai shopify oauth-connect` (token generated then encrypted/stored).

If you must reset broken/rotated encrypted values, use:

```bash
rexipt-ai config --list-secrets
rexipt-ai config --reset-secret llm.apiKey integrations.shopify.accessToken
rexipt-ai config set-secret llm.apiKey LLM_API_KEY
```

Or with npm aliases:

```bash
npm run cfg:list-secrets
npm run cfg:list-keys
npm run cfg:set -- integrations.shopify.storeUrl your-store.myshopify.com
npm run cfg:reset-secret -- llm.apiKey
npm run cfg:set-secret -- llm.apiKey LLM_API_KEY
```

`storeUrl` is not in secret paths because it is not encrypted. Set it with:

```bash
rexipt-ai config set integrations.shopify.storeUrl your-store.myshopify.com
```

List all editable keys (secret keys are marked):

```bash
rexipt-ai config --list-keys
```

Set an entire object (JSON value):

```bash
rexipt-ai config set integrations.shopify '{"enabled":true,"storeUrl":"your-store.myshopify.com","accessToken":"","apiVersion":"2024-01"}'
```

Overwriting with `init` is also valid, but it re-runs the full setup flow:

```bash
rexipt-ai init
# choose overwrite = yes
```

Supported secret paths:

- `llm.apiKey`
- `integrations.shopify.accessToken`
- `integrations.googleAds.customerId`
- `integrations.googleAds.loginCustomerId`
- `integrations.googleAds.developerToken`
- `integrations.googleAds.accessToken`
- `integrations.googleAds.refreshToken`
- `integrations.googleAds.clientId`
- `integrations.googleAds.clientSecret`
- `integrations.metaAds.adAccountId`
- `integrations.metaAds.accessToken`
- `integrations.klaviyo.apiKey`
- `integrations.tiktokAds.advertiserId`
- `integrations.tiktokAds.accessToken`
- `integrations.tiktokShop.appKey`
- `integrations.tiktokShop.appSecret`
- `integrations.tiktokShop.accessToken`
- `integrations.tiktokShop.shopId`
- `notifications.slack.webhookUrl`
- `notifications.telegram.botToken`
- `notifications.telegram.chatId`

Example:

```json
{
  "integrations": {
    "shopify": {
      "enabled": true,
      "storeUrl": "your-store.myshopify.com",
      "accessToken": "shpat_xxx",
      "apiVersion": "2024-01"
    }
  }
}
```

Sensitive values are encrypted at rest when config is saved.

## Main Commands

- `init` (`i`) - initialize config
- `doctor` (`d`) - configuration and runtime diagnostics
- `start` (`s`) - run scheduler (`--once` or `--daemon`)
- `stop` (`x`) - stop daemon process
- `run` (`r`) - run one skill: `run <skillId>`
- `run-all` (`ra`) - run all enabled skills once
- `logs` (`l`) - query run history
- `backfill` (`bf`) - compute/update baseline metrics
- `shopify oauth-connect` (`shop oc`) - generate token via browser OAuth code flow (recommended)
- `shopify connect` (`shop c`) - generate short-lived token from client credentials
- `actions` (`a`) - action queue workflow (`list`/`approve`/`reject`)
- `status` (`st`) - overall status

## Short Command Examples

```bash
rexipt-ai r dailyBriefing
rexipt-ai ra
rexipt-ai d
rexipt-ai l --limit 5
rexipt-ai a ls --status pending
```

## Environment Variables

You can override config values with environment variables from:

- `.env`
- `.env.local` (loaded after `.env`, so it overrides `.env`)

In the directory where you run the project.

If the same setting exists in both `config.json` and env, env wins at runtime.

Examples:

- `REXIPT_ORG_NAME`
- `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY`
- `SHOPIFY_ENABLED`, `SHOPIFY_STORE_URL`, `SHOPIFY_ACCESS_TOKEN`
- `GOOGLE_ADS_ENABLED`, `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_ACCESS_TOKEN`, `GOOGLE_ADS_REFRESH_TOKEN`
- `META_ADS_ENABLED`, `META_ADS_ACCOUNT_ID`, `META_ADS_ACCESS_TOKEN`
- `KLAVIYO_ENABLED`, `KLAVIYO_API_KEY`
- `SLACK_ENABLED`, `SLACK_WEBHOOK_URL`, `SLACK_CHANNEL`, `SLACK_ALERTS_CHANNEL`

Example:

```bash
# .env.local
SHOPIFY_ENABLED=true
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxx
```

## Release

```bash
npm run release:prepare
npm run release:dry-run
# npm run release:publish
```

See `RELEASE_CHECKLIST.md` for full release steps.
