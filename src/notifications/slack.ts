import { logInfo } from "../lib/logger";
import { HttpClientConfig, requestWithPolicy } from "../utils/http-client";

/**
 * Convert Markdown to Slack mrkdwn format
 * Slack uses different syntax than standard Markdown
 */
function markdownToSlackMrkdwn(text: string): string {
  return text
    // Convert ### headers to bold with emoji
    .replace(/^#### (.+)$/gm, "▸ *$1*")
    .replace(/^### (.+)$/gm, "\n*$1*")
    .replace(/^## (.+)$/gm, "\n*$1*")
    .replace(/^# (.+)$/gm, "\n*$1*")
    // Convert **bold** to *bold* (Slack format) - handle multi-word and special chars
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    // Convert __bold__ to *bold* (alternative markdown bold)
    .replace(/__([^_]+)__/g, "*$1*")
    // Convert numbered lists with bold items like "1. **Item**:" to cleaner format
    .replace(/^(\d+)\. \*([^*]+)\*:/gm, "$1. *$2:*")
    // Keep bullet points as-is (Slack supports -)
    // Convert --- horizontal rules to divider
    .replace(/^---+$/gm, "────────────────────")
    // Clean up extra newlines
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Build Slack Block Kit payload for rich formatting
 */
function buildSlackBlocks(message: string, title?: string): object[] {
  const blocks: object[] = [];
  
  // Add header if title provided
  if (title) {
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: title,
        emoji: true,
      },
    });
  }
  
  // Split message into sections (by double newline or headers)
  const sections = message.split(/\n(?=\*[^*]+\*\n)/);
  
  for (const section of sections) {
    if (section.trim()) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: section.trim().substring(0, 3000), // Slack limit
        },
      });
    }
  }
  
  // Add timestamp footer
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `📅 ${new Date().toLocaleString()}`,
      },
    ],
  });
  
  return blocks;
}

export class SlackNotifier {
  constructor(
    private readonly config: {
      enabled: boolean;
      webhookUrl: string;
      channel: string;
      alertsChannel: string;
      segmentationChannel: string;
    },
    private readonly httpConfig: HttpClientConfig,
  ) {}

  private isReady(): boolean {
    return Boolean(
      this.config?.enabled &&
        this.config?.webhookUrl &&
        this.config.webhookUrl.startsWith("https://"),
    );
  }

  async send(
    message: string,
    options: { channel?: string; title?: string; useBlocks?: boolean } = {},
  ): Promise<{ delivered: boolean; transport: string }> {
    if (!this.isReady()) {
      logInfo("Slack delivery disabled or not configured. Message output locally.");
      logInfo(message);
      return { delivered: false, transport: "console" };
    }

    const channel = options.channel || this.config.channel;
    const formattedMessage = markdownToSlackMrkdwn(message);
    
    // Use Block Kit for richer formatting, or fall back to simple mrkdwn
    const payload = options.useBlocks !== false
      ? {
          text: message.substring(0, 200) + "...", // Fallback text for notifications
          blocks: buildSlackBlocks(formattedMessage, options.title),
          ...(channel ? { channel } : {}),
        }
      : {
          text: formattedMessage,
          mrkdwn: true,
          ...(channel ? { channel } : {}),
        };

    const response = await requestWithPolicy(this.config.webhookUrl, this.httpConfig, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Slack webhook error ${response.status}: ${body}`);
    }

    return { delivered: true, transport: "slack-webhook" };
  }
}
