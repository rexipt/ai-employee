import {
  CONFIG_SECRET_PATHS,
  getConfigPath,
  isConfigSecretPath,
  listConfigLeafPaths,
  loadConfig,
  createDefaultConfig,
  resetConfigSecrets,
  setConfigValue,
  setConfigSecrets,
} from "../../lib/config-manager";
import { createBox, info, success, warning } from "../utils/format";
import fs from "node:fs/promises";

interface ConfigCommandOptions {
  path?: boolean;
  validate?: boolean;
  resetSecret?: string[];
  listSecrets?: boolean;
  listKeys?: boolean;
  setSecretKey?: string;
  setSecretValueEnv?: string;
  setKey?: string;
  setValue?: string;
}

function parseCliValue(value: string): unknown {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new Error("Invalid JSON value. Wrap JSON in single quotes and ensure valid syntax.");
    }
  }

  const lower = value.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  if (lower === "null") return null;
  if (lower === "undefined") return undefined;
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber) && value.trim() !== "") {
    return asNumber;
  }
  return value;
}

export async function runConfigCommand(options: ConfigCommandOptions): Promise<void> {
  const configPath = getConfigPath();

  if (options.path) {
    console.log(configPath);
    return;
  }

  if (options.listSecrets) {
    const lines = [
      "Supported secret paths:",
      ...CONFIG_SECRET_PATHS.map((secretPath) => `- ${secretPath}`),
      "",
      "Example:",
      "rexipt-ai config --reset-secret llm.apiKey integrations.shopify.accessToken",
      "rexipt-ai config reset-secret llm.apiKey",
    ];
    console.log("\n" + createBox("Config Secrets", lines.join("\n")));
    return;
  }

  if (options.listKeys) {
    const defaults = createDefaultConfig() as unknown as Record<string, unknown>;
    const allPaths = listConfigLeafPaths(defaults);
    const lines = [
      "Editable config keys:",
      ...allPaths.map((pathValue) =>
        isConfigSecretPath(pathValue) ? `- ${pathValue} [secret]` : `- ${pathValue}`,
      ),
      "",
      "Set non-secret:",
      "rexipt-ai config set integrations.shopify.storeUrl your-store.myshopify.com",
      "",
      "Set secret from env:",
      "rexipt-ai config set-secret llm.apiKey LLM_API_KEY",
    ];
    console.log("\n" + createBox("Config Keys", lines.join("\n")));
    return;
  }

  try {
    await fs.access(configPath);
  } catch {
    console.log(
      "\n" +
        createBox(
          "Config",
          warning(
            `No config found.\n\nRun \`rexipt-ai init\` first.\nExpected path: ${configPath}`,
          ),
        ),
    );
    process.exitCode = 1;
    return;
  }

  if (options.resetSecret && options.resetSecret.length > 0) {
    try {
      const result = await resetConfigSecrets(options.resetSecret);
      const lines: string[] = [];
      if (result.reset.length > 0) {
        lines.push(success(`Reset ${result.reset.length} secret key(s):`));
        lines.push(...result.reset.map((secretPath) => `- ${secretPath}`));
      }
      if (result.invalid.length > 0) {
        lines.push("");
        lines.push(warning("Ignored invalid secret path(s):"));
        lines.push(...result.invalid.map((secretPath) => `- ${secretPath}`));
      }
      lines.push("");
      lines.push(
        info(
          "Add new values via .env/.env.local (recommended) or config file, then run `rexipt-ai config --validate`.",
        ),
      );
      console.log("\n" + createBox("Config", lines.join("\n")));
      if (result.reset.length === 0) {
        process.exitCode = 1;
      }
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(
        "\n" +
          createBox(
            "Config",
            warning(`Failed to reset secrets.\n\n${message}\n\nPath:\n${configPath}`),
          ),
      );
      process.exitCode = 1;
      return;
    }
  }

  if (options.setSecretKey || options.setSecretValueEnv) {
    if (!options.setSecretKey || !options.setSecretValueEnv) {
      console.log(
        "\n" +
          createBox(
            "Config",
            warning(
              "Missing required args for set-secret.\n\nUse:\n`rexipt-ai config --set-secret-key <secretPath> --set-secret-value-env <ENV_VAR>`",
            ),
          ),
      );
      process.exitCode = 1;
      return;
    }

    const envVar = options.setSecretValueEnv;
    const envValue = process.env[envVar];
    if (!envValue) {
      console.log(
        "\n" +
          createBox(
            "Config",
            warning(
              `Environment variable ${envVar} is empty or not set.\n\nExport it first, then retry.`,
            ),
          ),
      );
      process.exitCode = 1;
      return;
    }

    try {
      const result = await setConfigSecrets([{ path: options.setSecretKey, value: envValue }]);
      const lines: string[] = [];
      if (result.set.length > 0) {
        lines.push(success(`Set ${result.set.length} secret key(s):`));
        lines.push(...result.set.map((secretPath) => `- ${secretPath}`));
      }
      if (result.invalid.length > 0) {
        lines.push("");
        lines.push(warning("Invalid secret path(s):"));
        lines.push(...result.invalid.map((secretPath) => `- ${secretPath}`));
      }
      lines.push("");
      lines.push(
        info(
          "Run `rexipt-ai config --validate` to verify and reseal encrypted values.",
        ),
      );
      console.log("\n" + createBox("Config", lines.join("\n")));
      if (result.set.length === 0) {
        process.exitCode = 1;
      }
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(
        "\n" +
          createBox(
            "Config",
            warning(`Failed to set secret.\n\n${message}\n\nPath:\n${configPath}`),
          ),
      );
      process.exitCode = 1;
      return;
    }
  }

  if (options.setKey || options.setValue) {
    if (!options.setKey || options.setValue === undefined) {
      console.log(
        "\n" +
          createBox(
            "Config",
            warning(
              "Missing required args for set.\n\nUse:\n`rexipt-ai config set <path> <value>`",
            ),
          ),
      );
      process.exitCode = 1;
      return;
    }

    if (isConfigSecretPath(options.setKey)) {
      console.log(
        "\n" +
          createBox(
            "Config",
            warning(
              `Path "${options.setKey}" is a secret path.\n\nUse set-secret instead:\n\`rexipt-ai config set-secret ${options.setKey} <ENV_VAR>\``,
            ),
          ),
      );
      process.exitCode = 1;
      return;
    }

    try {
      await setConfigValue(options.setKey, parseCliValue(options.setValue));
      console.log(
        "\n" +
          createBox(
            "Config",
            `${success(`Set config value: ${options.setKey}`)}\n\n${info(
              "Run `rexipt-ai config --validate` to verify.",
            )}`,
          ),
      );
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(
        "\n" +
          createBox(
            "Config",
            warning(`Failed to set config value.\n\n${message}\n\nPath:\n${configPath}`),
          ),
      );
      process.exitCode = 1;
      return;
    }
  }

  let config;
  try {
    config = await loadConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      "\n" +
        createBox(
          "Config",
          warning(`Configuration is invalid.\n\n${message}\n\nPath:\n${configPath}`),
        ),
    );
    process.exitCode = 1;
    return;
  }

  if (!config) {
    console.log(
      "\n" +
        createBox(
          "Config",
          warning(`No config found.\n\nRun \`rexipt-ai init\` first.\nExpected path: ${configPath}`),
        ),
    );
    process.exitCode = 1;
    return;
  }

  if (options.validate) {
    console.log(
      "\n" + createBox("Config", success(`Configuration is valid.\n\nPath:\n${configPath}`)),
    );
    return;
  }

  const enabledSkills = Object.entries(config.skills)
    .filter(([, v]) => v.enabled)
    .map(([k]) => k);

  const output = [
    success("Configuration loaded."),
    "",
    `Path: ${configPath}`,
    `Organization: ${config.organization.name || "(not set)"}`,
    `LLM: ${config.llm.provider}/${config.llm.model}`,
    `Enabled skills: ${enabledSkills.length > 0 ? enabledSkills.join(", ") : "(none)"}`,
    "",
    info("Use `rexipt-ai config --path` to print config path."),
    info("Use `rexipt-ai config --validate` to validate config."),
    info("Use `rexipt-ai config --list-secrets` to list resettable secret keys."),
    info("Use `rexipt-ai config --list-keys` to list all editable config keys."),
    info(
      "Use `rexipt-ai config --set-secret-key <path> --set-secret-value-env <ENV_VAR>` to set a secret from env.",
    ),
    info("Use `rexipt-ai config set <path> <value>` to set non-secret config values."),
  ];

  console.log("\n" + createBox("Config", output.join("\n")));
}
