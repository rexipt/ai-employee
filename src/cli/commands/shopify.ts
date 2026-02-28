import prompts, { PromptObject } from "prompts";
import https from "https";
import http from "http";
import crypto from "crypto";
import querystring from "querystring";
import { spawn } from "child_process";
import { loadConfig, setConfigValue, setConfigSecrets } from "../../lib/config-manager";
import { createBox, success, error, warning, tip, info } from "../utils/format";

interface ShopifyConnectOptions {
  shop?: string;
  clientId?: string;
  clientSecret?: string;
}

interface ShopifyOAuthConnectOptions {
  shop?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string;
  port?: string;
}

async function generateAccessToken(
  shop: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; scope: string; expiresIn: number }> {
  // Remove .myshopify.com if included
  const shopName = shop.replace(/\.myshopify\.com$/, "");

  const postData = querystring.stringify({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: `${shopName}.myshopify.com`,
      path: "/admin/oauth/access_token",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            resolve({
              accessToken: response.access_token,
              scope: response.scope || "",
              expiresIn: response.expires_in || 86400,
            });
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        } else {
          try {
            const errorData = JSON.parse(data);
            reject(
              new Error(
                errorData.error_description ||
                  errorData.error ||
                  `HTTP ${res.statusCode}: ${data}`,
              ),
            );
          } catch {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        }
      });
    });

    req.on("error", (err) => {
      reject(new Error(`Request failed: ${err.message}`));
    });

    req.write(postData);
    req.end();
  });
}

export async function runShopifyConnectCommand(
  options: ShopifyConnectOptions = {},
): Promise<void> {
  console.log("\n" + warning("⚠️  This command uses client credentials which generates a SHORT-LIVED token (24 hours)."));
  console.log(tip("For a non-expiring offline token, use: rexipt-ai shopify oauth-connect\n"));
  
  const confirmResponse = await prompts({
    type: "select",
    name: "choice",
    message: "How would you like to proceed?",
    choices: [
      { title: "Use OAuth (recommended) - Get non-expiring offline token", value: "oauth" },
      { title: "Continue with client credentials - 24 hour token", value: "continue" },
    ],
    initial: 0,
  }, {
    onCancel: () => {
      console.log("\n" + warning("Connection cancelled."));
      process.exit(0);
    },
  });

  if (confirmResponse.choice === "oauth") {
    console.log("\n" + info("Switching to OAuth flow...\n"));
    return runShopifyOAuthConnectCommand(options);
  }
  
  console.log("\n" + createBox("Shopify Connect", "Connecting to Shopify using client credentials..."));

  // Prompt for missing values
  const promptsToShow: PromptObject[] = [];
  
  if (!options.shop) {
    promptsToShow.push({
      type: "text",
      name: "shop",
      message: "Enter your Shopify store name:",
      initial: "mystore.myshopify.com",
      validate: (value: string) =>
        value.length > 0 ? true : "Store name is required",
    } as PromptObject);
  }

  if (!options.clientId) {
    promptsToShow.push({
      type: "text",
      name: "clientId",
      message: "Enter your Shopify App Client ID:",
      validate: (value: string) =>
        value.length > 0 ? true : "Client ID is required",
    } as PromptObject);
  }

  if (!options.clientSecret) {
    promptsToShow.push({
      type: "password",
      name: "clientSecret",
      message: "Enter your Shopify App Client Secret:",
      validate: (value: string) =>
        value.length > 0 ? true : "Client Secret is required",
    } as PromptObject);
  }

  let shop: string;
  let clientId: string;
  let clientSecret: string;

  if (promptsToShow.length > 0) {
    const response = await prompts(promptsToShow, {
      onCancel: () => {
        console.log("\n" + warning("Connection cancelled."));
        process.exit(0);
      },
    });

    shop = options.shop || response.shop;
    clientId = options.clientId || response.clientId;
    clientSecret = options.clientSecret || response.clientSecret;
  } else {
    shop = options.shop!;
    clientId = options.clientId!;
    clientSecret = options.clientSecret!;
  }

  if (!shop || !clientId || !clientSecret) {
    console.log("\n" + error("Missing required information. Connection cancelled."));
    process.exit(1);
  }

  // Normalize shop name
  const shopName = shop.replace(/\.myshopify\.com$/, "");
  const shopUrl = `${shopName}.myshopify.com`;

  console.log("\n" + info(`Generating access token for ${shopUrl}...`));

  try {
    const { accessToken, scope, expiresIn } = await generateAccessToken(
      shopName,
      clientId,
      clientSecret,
    );

    // Load existing config
    const config = await loadConfig();
    if (!config) {
      throw new Error("Failed to load config. Run 'rexipt-ai init' first.");
    }

    // Save config
    await setConfigValue("integrations.shopify.enabled", true);
    await setConfigValue("integrations.shopify.storeUrl", shopUrl);
    await setConfigSecrets([{ path: "integrations.shopify.accessToken", value: accessToken }]);

    const expiresInHours = Math.round(expiresIn / 3600);

    console.log("\n" + createBox(
      "Shopify Connected",
      [
        success(`Connected to ${shopUrl}`),
        "",
        `Access Token: ${accessToken.substring(0, 20)}...`,
        `Scope: ${scope || "default"}`,
        `Expires in: ${expiresInHours} hours`,
        "",
        "To verify your connection:",
        "  rexipt-ai status",
        "  rexipt-ai doctor",
      ].join("\n"),
    ));
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    
    // Check for specific error types
    const isAppNotInstalled = errorMessage.includes("app_not_installed");
    const isInvalidCredentials = errorMessage.includes("invalid_client") || 
                                 errorMessage.includes("401") ||
                                 errorMessage.includes("403");
    
    let errorDetails: string[];
    if (isAppNotInstalled) {
      errorDetails = [
        error("App not installed to your store"),
        "",
        warning("The client credentials flow requires your app to be installed first."),
        "",
        "To fix this:",
        "  1. Go to your Shopify admin: Apps → Develop apps",
        "  2. Find your app and click on it",
        "  3. Go to the 'Configuration' tab",
        "  4. Configure Admin API access scopes (read_orders, read_products, etc.)",
        "  5. Click 'Install app' or 'Save and install'",
        "  6. After installation, run this command again",
        "",
        tip("The app must be installed to your store before you can generate access tokens."),
      ];
    } else if (isInvalidCredentials) {
      errorDetails = [
        error("Invalid Client ID or Client Secret"),
        "",
        "Make sure you:",
        "  • Copied the Client ID correctly (starts with numbers)",
        "  • Copied the Client Secret correctly (from app credentials)",
        "  • Using credentials from the same app",
        "  • App is installed to your store",
      ];
    } else {
      errorDetails = [
        error(`Failed to connect: ${errorMessage.substring(0, 100)}${errorMessage.length > 100 ? "..." : ""}`),
        "",
        "Common issues:",
        "  • App not installed to your store (most common)",
        "  • Invalid Client ID or Client Secret",
        "  • Network connectivity issues",
        "",
        "Make sure you:",
        "  1. Created a custom app in Shopify (Apps → Develop apps)",
        "  2. Configured Admin API scopes in the Configuration tab",
        "  3. Installed the app to your store",
        "  4. Copied the correct Client ID and Secret from Settings tab",
      ];
    }
    
    errorDetails.push(
      "",
      "For help, see: https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets",
    );
    
    console.log("\n" + createBox("Connection Failed", errorDetails.join("\n")));
    process.exit(1);
  }
}

function trySpawnOpen(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { detached: true, stdio: "ignore" });
      child.on("error", () => resolve(false));
      child.unref();
      resolve(true);
    } catch {
      resolve(false);
    }
  });
}

async function openInBrowser(url: string): Promise<boolean> {
  const platform = process.platform;
  if (platform === "darwin") {
    return trySpawnOpen("open", [url]);
  }
  if (platform === "win32") {
    return trySpawnOpen("cmd", ["/c", "start", "", url]);
  }
  return trySpawnOpen("xdg-open", [url]);
}

async function exchangeOAuthCodeForToken(
  shop: string,
  clientId: string,
  clientSecret: string,
  code: string,
): Promise<{ accessToken: string; scope: string }> {
  const payload = JSON.stringify({
    client_id: clientId,
    client_secret: clientSecret,
    code,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: `${shop}.myshopify.com`,
        path: "/admin/oauth/access_token",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`OAuth token exchange failed (HTTP ${res.statusCode}): ${data}`));
            return;
          }
          try {
            const parsed = JSON.parse(data) as { access_token?: string; scope?: string };
            if (!parsed.access_token) {
              reject(new Error(`OAuth token exchange returned no access token: ${data}`));
              return;
            }
            resolve({ accessToken: parsed.access_token, scope: parsed.scope || "" });
          } catch {
            reject(new Error(`Failed to parse token exchange response: ${data}`));
          }
        });
      },
    );

    req.on("error", (err) => reject(new Error(`Token exchange request failed: ${err.message}`)));
    req.write(payload);
    req.end();
  });
}

export async function runShopifyOAuthConnectCommand(
  options: ShopifyOAuthConnectOptions = {},
): Promise<void> {
  console.log(
    "\n" +
      createBox(
        "Shopify OAuth Connect",
        "Connecting to Shopify with Authorization Code flow (offline token).",
      ),
  );

  const promptsToShow: PromptObject[] = [];
  if (!options.shop) {
    promptsToShow.push({
      type: "text",
      name: "shop",
      message: "Enter your Shopify store name:",
      initial: "mystore.myshopify.com",
      validate: (value: string) => (value.length > 0 ? true : "Store name is required"),
    } as PromptObject);
  }
  if (!options.clientId) {
    promptsToShow.push({
      type: "text",
      name: "clientId",
      message: "Enter your Shopify App Client ID:",
      validate: (value: string) => (value.length > 0 ? true : "Client ID is required"),
    } as PromptObject);
  }
  if (!options.clientSecret) {
    promptsToShow.push({
      type: "password",
      name: "clientSecret",
      message: "Enter your Shopify App Client Secret:",
      validate: (value: string) => (value.length > 0 ? true : "Client Secret is required"),
    } as PromptObject);
  }

  const response = promptsToShow.length
    ? await prompts(promptsToShow, {
        onCancel: () => {
          console.log("\n" + warning("OAuth connect cancelled."));
          process.exit(0);
        },
      })
    : {};

  const shopRaw = (options.shop || response.shop || "").replace(/\.myshopify\.com$/, "").trim();
  const clientId = (options.clientId || response.clientId || "").trim();
  const clientSecret = (options.clientSecret || response.clientSecret || "").trim();
  const scopes =
    (options.scopes || "").trim() ||
    "read_orders,read_products,read_customers,read_discounts";
  const port = Number.parseInt(options.port || "3456", 10);

  if (!shopRaw || !clientId || !clientSecret || !Number.isFinite(port) || port <= 0) {
    console.log("\n" + createBox("Connection Failed", error("Invalid OAuth connect inputs.")));
    process.exitCode = 1;
    return;
  }

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  // Build authorization URL with offline access mode for non-expiring tokens
  // Note: querystring.stringify doesn't handle array params well, so we build manually
  const authParams = new URLSearchParams({
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
  });
  // Request offline access token (non-expiring) - required for CLI background tasks
  authParams.append("grant_options[]", "offline");
  const authorizeUrl = `https://${shopRaw}.myshopify.com/admin/oauth/authorize?${authParams.toString()}`;

  console.log("\n" + info(`Preparing browser authorization for ${shopRaw}.myshopify.com ...`));
  console.log("");
  console.log(warning("IMPORTANT: Your Shopify app must have this redirect URI whitelisted:"));
  console.log(`  ${redirectUri}`);
  console.log("");
  console.log(tip("To add it: Shopify Admin → Settings → Apps → Develop apps → Your App → Configuration → Allowed redirection URL(s)"));
  console.log("");
  console.log(info(`Authorization URL:\n${authorizeUrl}`));

  const code = await new Promise<string>((resolve, reject) => {
    const timeoutMs = 5 * 60 * 1000;
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for OAuth callback."));
    }, timeoutMs);

    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
        if (url.pathname !== "/callback") {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }

        const receivedState = url.searchParams.get("state") || "";
        const receivedCode = url.searchParams.get("code") || "";
        const errorParam = url.searchParams.get("error");

        if (errorParam) {
          res.statusCode = 400;
          const errorDescription = url.searchParams.get("error_description") || errorParam;
          res.end(`OAuth failed: ${errorDescription}`);
          clearTimeout(timer);
          server.close();
          
          // Provide specific guidance for common errors
          let errorMessage = `OAuth authorization failed: ${errorDescription}`;
          if (errorParam === "invalid_request" && errorDescription.includes("redirect_uri")) {
            errorMessage += `\n\nFix: Add this redirect URI to your Shopify app:\n  ${redirectUri}\n\nSteps: Shopify Admin → Settings → Apps → Develop apps → Your App → Configuration → Allowed redirection URL(s)`;
          }
          reject(new Error(errorMessage));
          return;
        }

        if (receivedState !== state || !receivedCode) {
          res.statusCode = 400;
          res.end("Invalid OAuth callback.");
          clearTimeout(timer);
          server.close();
          reject(new Error("Invalid OAuth callback state or missing code."));
          return;
        }

        res.statusCode = 200;
        res.end("Shopify authorization received. You can close this tab.");
        clearTimeout(timer);
        server.close();
        resolve(receivedCode);
      } catch (err) {
        clearTimeout(timer);
        server.close();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

    server.listen(port, "127.0.0.1", async () => {
      const opened = await openInBrowser(authorizeUrl);
      if (!opened) {
        console.log(
          "\n" +
            warning(
              "Could not auto-open your browser. Open the Authorization URL above manually.",
            ),
        );
      } else {
        console.log(info("Browser opened. Complete authorization, then return here."));
      }
    });
    server.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start local callback server on port ${port}: ${err.message}`));
    });
  });

  try {
    const token = await exchangeOAuthCodeForToken(shopRaw, clientId, clientSecret, code);
    const config = await loadConfig();
    if (!config) {
      throw new Error("Failed to load config. Run `rexipt-ai init` first.");
    }

    await setConfigValue("integrations.shopify.enabled", true);
    await setConfigValue("integrations.shopify.storeUrl", `${shopRaw}.myshopify.com`);
    await setConfigSecrets([{ path: "integrations.shopify.accessToken", value: token.accessToken }]);

    console.log(
      "\n" +
        createBox(
          "Shopify Connected",
          [
            success(`Connected to ${shopRaw}.myshopify.com`),
            "",
            `Scope: ${token.scope || "default"}`,
            "",
            "Token saved encrypted in config.",
            "Run:",
            "  rexipt-ai doctor",
            "  rexipt-ai run dailyBriefing",
          ].join("\n"),
        ),
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.log("\n" + createBox("Connection Failed", error(message)));
    process.exitCode = 1;
  }
}
