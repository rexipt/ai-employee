import prompts from "prompts";
import {
  createDefaultConfig,
  getConfigPath,
  saveConfig,
  loadConfig,
} from "../../lib/config-manager";
import { createBox, success, tip, info } from "../utils/format";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "America/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Madrid",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Asia/Dubai",
  "Australia/Sydney",
  "Australia/Melbourne",
  "UTC",
];

const AI_PROVIDERS = [
  { title: "OpenAI (GPT-4)", value: "openai" },
  { title: "Anthropic (Claude) - Recommended", value: "anthropic" },
];

const NOTIFICATION_CHANNELS = [
  { title: "Slack", value: "slack" },
  { title: "Telegram", value: "telegram" },
  { title: "Skip for now", value: "skip" },
];

// Helper to handle prompt cancellation
const onCancel = () => {
  console.log("\n\nSetup cancelled.");
  process.exit(0);
};

async function promptOrganizationName(): Promise<string> {
  const response = await prompts({
    type: "text",
    name: "name",
    message: "What's your organization name?",
    initial: "",
  });
  if (response === undefined || response === null) {
    onCancel();
  }
  return response?.name || "";
}

async function promptTimezone(): Promise<string> {
  const response = await prompts({
    type: "select",
    name: "timezone",
    message: "What timezone are you in?",
    choices: TIMEZONES.map((tz) => ({ title: tz, value: tz })),
    initial: 0,
  });
  if (response === undefined || response === null) {
    onCancel();
  }
  return response?.timezone || "UTC";
}

async function promptPlatforms(): Promise<string[]> {
  while (true) {
    const response = await prompts({
      type: "multiselect",
      name: "platforms",
      message:
        "Which platforms do you want to connect? (Use <space> to select, <enter> to continue)",
      choices: [
        { title: "Shopify", value: "shopify", selected: false },
        { title: "Google Ads", value: "googleAds", selected: false },
        { title: "Meta Ads", value: "metaAds", selected: false },
        { title: "TikTok Ads", value: "tiktokAds", selected: false },
        { title: "TikTok Shop", value: "tiktokShop", selected: false },
        { title: "Klaviyo", value: "klaviyo", selected: false },
      ],
    });
    if (response === undefined || response === null) {
      onCancel();
    }

    const selected = response?.platforms || [];
    if (selected.length > 0) {
      return selected;
    }

    const confirmSkip = await prompts(
      {
        type: "confirm",
        name: "skip",
        message: "No platform selected. Continue without connecting any platform?",
        initial: false,
      },
      { onCancel },
    );
    if (confirmSkip?.skip) {
      return [];
    }
  }
}

async function promptShopifyConfig(): Promise<{
  storeUrl: string;
  accessToken: string;
  useOAuth: boolean;
} | null> {
  // First, ask how they want to authenticate
  const authMethodResponse = await prompts(
    {
      type: "select",
      name: "method",
      message: "How would you like to connect to Shopify?",
      choices: [
        { title: "OAuth (Recommended) - Opens browser for secure authorization", value: "oauth" },
        { title: "Manual Token - Paste an existing access token", value: "manual" },
      ],
      initial: 0,
    },
    { onCancel },
  );

  if (!authMethodResponse || !authMethodResponse.method) {
    return null;
  }

  const storeResponse = await prompts(
    {
      type: "text",
      name: "storeUrl",
      message: "Enter your Shopify store URL:",
      initial: "mystore.myshopify.com",
      validate: (value: string) =>
        value.includes("myshopify.com") || value.length > 0
          ? true
          : "Please enter a valid Shopify store URL",
    },
    { onCancel },
  );

  if (!storeResponse || !storeResponse.storeUrl) {
    return null;
  }

  if (authMethodResponse.method === "oauth") {
    // Return with flag to indicate OAuth should be used after init completes
    console.log("\n" + info("Shopify OAuth will be configured after init completes."));
    console.log(tip("You'll need your Shopify App Client ID and Client Secret from the Shopify Dev Dashboard."));
    return { storeUrl: storeResponse.storeUrl, accessToken: "", useOAuth: true };
  }

  // Manual token entry (legacy flow)
  const tokenResponse = await prompts(
    {
      type: "password",
      name: "accessToken",
      message: "Enter your Shopify Admin API Access Token:",
      validate: (value: string) =>
        value.length > 0 ? true : "Admin API Access Token is required for Shopify API access",
    },
    { onCancel },
  );

  if (!tokenResponse || !tokenResponse.accessToken) {
    console.log(tip("Shopify setup skipped: Admin API Access Token is required."));
    return null;
  }

  return { storeUrl: storeResponse.storeUrl, accessToken: tokenResponse.accessToken, useOAuth: false };
}

async function promptGoogleAdsConfig(): Promise<{
  customerId: string;
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
} | null> {
  console.log("\n" + tip("Google Ads requires OAuth setup. You'll need:"));
  console.log("  1. Developer Token from Google Ads");
  console.log("  2. OAuth Client ID and Secret");
  console.log("  3. Refresh Token (from OAuth flow)\n");

  const response = await prompts([
    {
      type: "text",
      name: "customerId",
      message: "Enter your Google Ads Customer ID:",
      validate: (value: string) => (value.length > 0 ? true : "Customer ID is required"),
    },
    {
      type: "password",
      name: "developerToken",
      message: "Enter your Developer Token:",
      validate: (value: string) => (value.length > 0 ? true : "Developer Token is required"),
    },
    {
      type: "text",
      name: "clientId",
      message: "Enter your OAuth Client ID:",
      validate: (value: string) => (value.length > 0 ? true : "Client ID is required"),
    },
    {
      type: "password",
      name: "clientSecret",
      message: "Enter your OAuth Client Secret:",
      validate: (value: string) => (value.length > 0 ? true : "Client Secret is required"),
    },
    {
      type: "password",
      name: "refreshToken",
      message: "Enter your OAuth Refresh Token:",
      validate: (value: string) => (value.length > 0 ? true : "Refresh Token is required"),
    },
    ],
    { onCancel },
  );

  if (
    !response ||
    !response.customerId ||
    !response.developerToken ||
    !response.clientId ||
    !response.clientSecret ||
    !response.refreshToken
  ) {
    return null;
  }

  return response;
}

async function promptMetaAdsConfig(): Promise<{ adAccountId: string; accessToken: string } | null> {
  const response = await prompts(
    [
      {
        type: "text",
        name: "adAccountId",
        message: "Enter your Meta Ads Account ID:",
        validate: (value: string) => (value.length > 0 ? true : "Account ID is required"),
      },
      {
        type: "password",
        name: "accessToken",
        message: "Enter your Meta Ads Access Token:",
        validate: (value: string) => (value.length > 0 ? true : "Access Token is required"),
      },
    ],
    { onCancel },
  );

  if (!response || !response.adAccountId || !response.accessToken) {
    return null;
  }

  return response;
}

async function promptTikTokAdsConfig(): Promise<{ advertiserId: string; accessToken: string } | null> {
  const response = await prompts(
    [
      {
        type: "text",
        name: "advertiserId",
        message: "Enter your TikTok Ads Advertiser ID:",
        validate: (value: string) => (value.length > 0 ? true : "Advertiser ID is required"),
      },
      {
        type: "password",
        name: "accessToken",
        message: "Enter your TikTok Ads Access Token:",
        validate: (value: string) => (value.length > 0 ? true : "Access Token is required"),
      },
    ],
    { onCancel },
  );

  if (!response || !response.advertiserId || !response.accessToken) {
    return null;
  }

  return response;
}

async function promptTikTokShopConfig(): Promise<{
  appKey: string;
  appSecret: string;
  accessToken: string;
  shopId: string;
} | null> {
  const response = await prompts(
    [
      {
        type: "text",
        name: "appKey",
        message: "Enter your TikTok Shop App Key:",
        validate: (value: string) => (value.length > 0 ? true : "App Key is required"),
      },
      {
        type: "password",
        name: "appSecret",
        message: "Enter your TikTok Shop App Secret:",
        validate: (value: string) => (value.length > 0 ? true : "App Secret is required"),
      },
      {
        type: "password",
        name: "accessToken",
        message: "Enter your TikTok Shop Access Token:",
        validate: (value: string) => (value.length > 0 ? true : "Access Token is required"),
      },
      {
        type: "text",
        name: "shopId",
        message: "Enter your TikTok Shop ID:",
        validate: (value: string) => (value.length > 0 ? true : "Shop ID is required"),
      },
    ],
    { onCancel },
  );

  if (!response || !response.appKey || !response.appSecret || !response.accessToken || !response.shopId) {
    return null;
  }

  return response;
}

async function promptKlaviyoConfig(): Promise<{ apiKey: string } | null> {
  const response = await prompts({
    type: "password",
    name: "apiKey",
    message: "Enter your Klaviyo API Key:",
    validate: (value: string) => (value.length > 0 ? true : "API Key is required"),
  });

  if (response === undefined || response === null) {
    onCancel();
  }

  if (!response || !response.apiKey) {
    return null;
  }

  return { apiKey: response.apiKey };
}

async function promptAIProvider(): Promise<{ provider: string; apiKey: string; model: string; baseUrl: string } | null> {
  const providerResponse = await prompts({
    type: "select",
    name: "provider",
    message: "Which AI provider do you want to use?",
    choices: AI_PROVIDERS,
    initial: 1,
  });

  if (providerResponse === undefined || providerResponse === null) {
    onCancel();
  }

  if (!providerResponse || !providerResponse.provider) {
    return null;
  }

  const provider = providerResponse.provider as "openai" | "anthropic";
  const defaultModel = provider === "openai" ? "gpt-4o-mini" : "claude-3-5-sonnet-20241022";
  const defaultBaseUrl =
    provider === "openai" ? "https://api.openai.com/v1" : "https://api.anthropic.com/v1";

  const apiResponse = await prompts(
    [
      {
        type: "password",
        name: "apiKey",
        message: `Enter your ${provider === "openai" ? "OpenAI" : "Anthropic"} API key:`,
        validate: (value: string) => (value.length > 0 ? true : "API key is required"),
      },
      {
        type: "text",
        name: "model",
        message: "Enter model name:",
        initial: defaultModel,
      },
      {
        type: "text",
        name: "baseUrl",
        message: "Enter API base URL:",
        initial: defaultBaseUrl,
      },
    ],
    { onCancel },
  );

  if (!apiResponse || !apiResponse.apiKey) {
    return null;
  }

  return {
    provider,
    apiKey: apiResponse.apiKey,
    model: apiResponse.model || defaultModel,
    baseUrl: apiResponse.baseUrl || defaultBaseUrl,
  };
}

async function promptNotifications(): Promise<{
  slack?: { webhookUrl: string; channel: string };
  telegram?: { botToken: string; chatId: string };
} | null> {
  const channelResponse = await prompts({
    type: "select",
    name: "channel",
    message: "Where should we send reports and alerts?",
    choices: NOTIFICATION_CHANNELS,
  });

  if (channelResponse === undefined || channelResponse === null) {
    onCancel();
  }

  if (!channelResponse || !channelResponse.channel || channelResponse.channel === "skip") {
    return null;
  }

  if (channelResponse.channel === "slack") {
    const slackResponse = await prompts(
      [
        {
          type: "password",
          name: "webhookUrl",
          message: "Enter your Slack webhook URL:",
          validate: (value: string) =>
            value.startsWith("https://") ? true : "Webhook URL must start with https://",
        },
        {
          type: "text",
          name: "channel",
          message: "Which Slack channel for all notifications?",
          initial: "#rexipt-employee",
        },
      ],
      { onCancel },
    );

    if (!slackResponse || !slackResponse.webhookUrl) {
      return null;
    }

    return {
      slack: {
        webhookUrl: slackResponse.webhookUrl,
        channel: slackResponse.channel || "#rexipt-employee",
      },
    };
  }

  if (channelResponse.channel === "telegram") {
    const telegramResponse = await prompts(
      [
        {
          type: "password",
          name: "botToken",
          message: "Enter your Telegram Bot Token:",
          validate: (value: string) => (value.length > 0 ? true : "Bot Token is required"),
        },
        {
          type: "text",
          name: "chatId",
          message: "Enter your Telegram Chat ID:",
          validate: (value: string) => (value.length > 0 ? true : "Chat ID is required"),
        },
      ],
      { onCancel },
    );

    if (!telegramResponse || !telegramResponse.botToken || !telegramResponse.chatId) {
      return null;
    }

    return {
      telegram: {
        botToken: telegramResponse.botToken,
        chatId: telegramResponse.chatId,
      },
    };
  }

  return null;
}

async function promptSkills(): Promise<string[]> {
  const response = await prompts({
    type: "multiselect",
    name: "skills",
    message: "Which skills would you like to enable? (Press <space> to select)",
    choices: [
      { title: "Daily Briefing (7am daily)", value: "dailyBriefing", selected: true },
      { title: "Anomaly Detection (24/7 monitoring)", value: "anomalyDetection", selected: true },
      { title: "Customer Segmentation (Weekly)", value: "customerSegmentation", selected: false },
      { title: "Competitor Intelligence (Weekly)", value: "competitorIntel", selected: false },
      { title: "Creative Strategy (Weekly)", value: "creativeStrategy", selected: false },
      { title: "Weekly P&L (Monday 6am)", value: "weeklyPL", selected: false },
    ],
  });
  if (response === undefined || response === null) {
    onCancel();
  }
  return response?.skills || [];
}

export async function runInitCommand(): Promise<void> {
  // Check if config already exists
  const existing = await loadConfig();
  if (existing) {
    const response = await prompts({
      type: "confirm",
      name: "overwrite",
      message: "Configuration already exists. Do you want to overwrite it?",
      initial: false,
    });

    if (response === undefined || response === null) {
      onCancel();
    }

    if (!response || !response.overwrite) {
      const existingPath = getConfigPath();
      console.log("\n" + tip(`Keeping existing configuration.\n\nConfig path: ${existingPath}`));
      console.log(tip("Use `rexipt-ai config --path` anytime to print the config location."));
      return;
    }
  }

  console.log("\n" + createBox("Welcome to Rexipt AI Employee! 🚀", "I'll help you set up your AI-powered\nbusiness intelligence system."));

  // Step 1: Organization
  const orgName = await promptOrganizationName();
  const timezone = await promptTimezone();

  const config = createDefaultConfig();
  config.organization.name = orgName;
  config.organization.timezone = timezone;

  console.log("\n" + success(`Configuration file will be created at ${getConfigPath()}`));

  // Step 2: Platforms
  console.log("\n" + createBox("Step 1: Connect Your Platforms", ""));
  const platforms = await promptPlatforms();
  let needsShopifyOAuth = false;

  for (const platform of platforms) {
    console.log(`\n→ ${platform.charAt(0).toUpperCase() + platform.slice(1)} Setup:`);

    if (platform === "shopify") {
      const shopifyConfig = await promptShopifyConfig();
      if (shopifyConfig) {
        config.integrations.shopify.storeUrl = shopifyConfig.storeUrl;
        if (shopifyConfig.useOAuth) {
          // Mark for OAuth setup after init - enabled will be set by oauth-connect
          config.integrations.shopify.enabled = false;
          needsShopifyOAuth = true;
          console.log(success("Shopify store URL saved. Run OAuth after init completes."));
        } else {
          config.integrations.shopify.enabled = true;
          config.integrations.shopify.accessToken = shopifyConfig.accessToken;
          console.log(success("Shopify connected successfully!"));
        }
      }
    } else if (platform === "googleAds") {
      const googleAdsConfig = await promptGoogleAdsConfig();
      if (googleAdsConfig) {
        config.integrations.googleAds.enabled = true;
        config.integrations.googleAds.customerId = googleAdsConfig.customerId;
        config.integrations.googleAds.developerToken = googleAdsConfig.developerToken;
        config.integrations.googleAds.clientId = googleAdsConfig.clientId;
        config.integrations.googleAds.clientSecret = googleAdsConfig.clientSecret;
        config.integrations.googleAds.refreshToken = googleAdsConfig.refreshToken;
        console.log(success("Google Ads connected successfully!"));
      }
    } else if (platform === "metaAds") {
      const metaAdsConfig = await promptMetaAdsConfig();
      if (metaAdsConfig) {
        config.integrations.metaAds.enabled = true;
        config.integrations.metaAds.adAccountId = metaAdsConfig.adAccountId;
        config.integrations.metaAds.accessToken = metaAdsConfig.accessToken;
        console.log(success("Meta Ads connected successfully!"));
      }
    } else if (platform === "tiktokAds") {
      const tiktokAdsConfig = await promptTikTokAdsConfig();
      if (tiktokAdsConfig) {
        config.integrations.tiktokAds.enabled = true;
        config.integrations.tiktokAds.advertiserId = tiktokAdsConfig.advertiserId;
        config.integrations.tiktokAds.accessToken = tiktokAdsConfig.accessToken;
        console.log(success("TikTok Ads connected successfully!"));
      }
    } else if (platform === "tiktokShop") {
      const tiktokShopConfig = await promptTikTokShopConfig();
      if (tiktokShopConfig) {
        config.integrations.tiktokShop.enabled = true;
        config.integrations.tiktokShop.appKey = tiktokShopConfig.appKey;
        config.integrations.tiktokShop.appSecret = tiktokShopConfig.appSecret;
        config.integrations.tiktokShop.accessToken = tiktokShopConfig.accessToken;
        config.integrations.tiktokShop.shopId = tiktokShopConfig.shopId;
        console.log(success("TikTok Shop connected successfully!"));
      }
    } else if (platform === "klaviyo") {
      const klaviyoConfig = await promptKlaviyoConfig();
      if (klaviyoConfig) {
        config.integrations.klaviyo.enabled = true;
        config.integrations.klaviyo.apiKey = klaviyoConfig.apiKey;
        console.log(success("Klaviyo connected successfully!"));
      }
    }
  }

  // Step 3: AI Provider
  console.log("\n" + createBox("Step 2: Configure AI Provider", ""));
  const aiConfig = await promptAIProvider();
  if (aiConfig) {
    config.llm.provider = aiConfig.provider as "openai" | "anthropic";
    config.llm.apiKey = aiConfig.apiKey;
    config.llm.model = aiConfig.model;
    config.llm.baseUrl = aiConfig.baseUrl;
    console.log(success("AI provider configured!"));
  }

  // Step 4: Notifications
  console.log("\n" + createBox("Step 3: Set Up Notifications", ""));
  const notificationConfig = await promptNotifications();
  if (notificationConfig) {
    if (notificationConfig.slack) {
      const slackChannel = notificationConfig.slack.channel;
      config.notifications.slack.enabled = true;
      config.notifications.slack.webhookUrl = notificationConfig.slack.webhookUrl;
      config.notifications.slack.channel = slackChannel;
      config.notifications.slack.alertsChannel = slackChannel;
      config.notifications.slack.segmentationChannel = slackChannel;
      config.notifications.slack.competitorChannel = slackChannel;
      config.notifications.slack.creativeChannel = slackChannel;
      config.notifications.slack.financeChannel = slackChannel;
      console.log(success("Slack configured! All notifications will go to " + slackChannel));
    }
    if (notificationConfig.telegram) {
      config.notifications.telegram.enabled = true;
      config.notifications.telegram.botToken = notificationConfig.telegram.botToken;
      config.notifications.telegram.chatId = notificationConfig.telegram.chatId;
      console.log(success("Telegram configured!"));
    }
  }

  // Step 5: Skills
  console.log("\n" + createBox("Step 4: Enable Skills", ""));
  const enabledSkills = await promptSkills();
  for (const skillId of Object.keys(config.skills)) {
    config.skills[skillId as keyof typeof config.skills].enabled = enabledSkills.includes(skillId);
  }
  console.log(success("Skills configured!"));

  // Save config
  await saveConfig(config);

  // Completion message
  const nextSteps = needsShopifyOAuth
    ? [
        "Your AI Employee is almost ready!",
        "",
        "IMPORTANT: Complete Shopify OAuth setup:",
        "  rexipt-ai shopify oauth-connect",
        "",
        "Then:",
        "  1. Start the AI Employee: rexipt-ai start",
        "  2. Check status: rexipt-ai status",
        "  3. View logs: rexipt-ai logs",
      ]
    : [
        "Your AI Employee is ready to go!",
        "",
        "Next steps:",
        "  1. Start the AI Employee: rexipt-ai start",
        "  2. Check status: rexipt-ai status",
        "  3. View logs: rexipt-ai logs",
      ];

  nextSteps.push(
    "",
    "Config file: rexipt-ai config --path",
    "Validate config: rexipt-ai config --validate",
    "",
    "Install once (recommended): npm i -g @rexipt/ai-employee",
  );

  console.log("\n" + createBox("Setup Complete! 🎉", nextSteps.join("\n")));
}
