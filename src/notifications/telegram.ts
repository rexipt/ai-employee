import { logInfo } from "../lib/logger";
import { HttpClientConfig, requestWithPolicy } from "../utils/http-client";

export class TelegramNotifier {
  constructor(
    private readonly config: {
      enabled: boolean;
      botToken: string;
      chatId: string;
      channel?: string;
      alertsChannel?: string;
      segmentationChannel?: string;
      competitorChannel?: string;
      creativeChannel?: string;
      financeChannel?: string;
    },
    private readonly httpConfig: HttpClientConfig,
  ) {}

  private isReady(): boolean {
    return Boolean(
      this.config?.enabled &&
        this.config?.botToken &&
        this.config?.chatId &&
        this.config.botToken.length > 0,
    );
  }

  private getChatId(channel?: string): string {
    // Use channel-specific chat ID if provided, otherwise fall back to default
    if (channel === "alerts" && this.config.alertsChannel) {
      return this.config.alertsChannel;
    }
    if (channel === "segmentation" && this.config.segmentationChannel) {
      return this.config.segmentationChannel;
    }
    if (channel === "competitor" && this.config.competitorChannel) {
      return this.config.competitorChannel;
    }
    if (channel === "creative" && this.config.creativeChannel) {
      return this.config.creativeChannel;
    }
    if (channel === "finance" && this.config.financeChannel) {
      return this.config.financeChannel;
    }
    return this.config.chatId;
  }

  async send(
    message: string,
    options: { channel?: string } = {},
  ): Promise<{ delivered: boolean; transport: string }> {
    if (!this.isReady()) {
      logInfo("Telegram delivery disabled or not configured. Message output locally.");
      logInfo(message);
      return { delivered: false, transport: "console" };
    }

    const chatId = this.getChatId(options.channel);
    const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;

    // Telegram has a 4096 character limit per message
    const maxLength = 4096;
    const messages = message.length > maxLength
      ? this.splitMessage(message, maxLength)
      : [message];

    let allDelivered = true;

    for (const msg of messages) {
      const payload = {
        chat_id: chatId,
        text: msg,
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      };

      const response = await requestWithPolicy(url, this.httpConfig, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Telegram API error ${response.status}: ${body}`);
      }

      const result = (await response.json()) as { ok?: boolean };
      if (!result.ok) {
        allDelivered = false;
      }
    }

    return { delivered: allDelivered, transport: "telegram" };
  }

  private splitMessage(message: string, maxLength: number): string[] {
    const lines = message.split("\n");
    const chunks: string[] = [];
    let currentChunk = "";

    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = "";
        }
        // If a single line is too long, truncate it
        if (line.length > maxLength) {
          chunks.push(line.substring(0, maxLength - 3) + "...");
        } else {
          currentChunk = line;
        }
      } else {
        currentChunk += (currentChunk ? "\n" : "") + line;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }
}
