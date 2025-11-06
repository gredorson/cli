import { Command } from "commander";
import chalk from "chalk";
import open from "open";
import ora from "ora";
import {
  startOAuthServer,
  exchangeCodeForTokens,
} from "../../auth/oauth-server";
import {
  saveTokens,
  getUserFromToken,
  loadTokens,
} from "../../auth/token-storage";
import { getAuthConfig } from "../../config/auth-config";

interface CognitoConfig {
  domain: string;
  clientId: string;
  region: string;
  frontendUrl: string;
}

/**
 * Get Cognito configuration from config files or environment
 */
function getCognitoConfig(configFile?: string): CognitoConfig {
  const config = getAuthConfig(configFile);

  if (!config) {
    console.error(
      chalk.red(
        "\n✗ Auth configuration not found. Please configure authentication first.\n"
      )
    );
    console.log(chalk.yellow("You can configure authentication in:\n"));
    console.log(
      chalk.dim("1. Global config:"),
      chalk.cyan("~/.flutch/config.json")
    );
    console.log(chalk.dim("2. Project config:"), chalk.cyan(".flutchrc"));
    console.log(chalk.dim("3. Environment variables:"));
    console.log(chalk.dim("   - COGNITO_DOMAIN"));
    console.log(chalk.dim("   - COGNITO_CLIENT_ID"));
    console.log(chalk.dim("   - AWS_REGION"));
    console.log(chalk.dim("   - FRONTEND_URL\n"));

    console.log(chalk.yellow("Example ~/.flutch/config.json:"));
    console.log(
      JSON.stringify(
        {
          auth: {
            cognitoDomain: "your-domain.auth.eu-central-1.amazoncognito.com",
            cognitoClientId: "your-cognito-client-id",
            cognitoRegion: "eu-central-1",
            frontendUrl: "http://localhost:5173",
          },
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  return {
    domain: config.cognitoDomain,
    clientId: config.cognitoClientId,
    region: config.cognitoRegion,
    frontendUrl: config.frontendUrl,
  };
}

/**
 * Login command handler
 */
async function loginHandler(options: { config?: string }, command: any) {
  // Get global options from parent command
  const configFile = options.config || command.parent?.opts().config;

  console.log(chalk.blue("🔐 Starting Flutch CLI authentication...\n"));

  const authConfig = getAuthConfig(configFile);

  if (!authConfig) {
    console.error(chalk.red("\n✗ Auth configuration not found.\n"));
    process.exit(1);
  }

  const config = getCognitoConfig(configFile);

  try {
    // Start local OAuth callback server
    const { port, codePromise, tokensPromise, server } = await startOAuthServer();

    const redirectUri = `http://localhost:${port}/callback`;

    // Build authorization URL
    // If cliAuthUrl is specified, use it as full URL
    // Otherwise, construct from frontendUrl + /cli-auth
    let authUrlString: string;
    if (authConfig.cliAuthUrl) {
      authUrlString = authConfig.cliAuthUrl;
    } else {
      const baseUrl = config.frontendUrl.replace(/\/$/, ''); // Remove trailing slash
      authUrlString = `${baseUrl}/cli-auth`;
    }

    const authUrl = new URL(authUrlString);
    authUrl.searchParams.append("redirect_uri", redirectUri);

    console.log(chalk.dim("Opening browser for authentication..."));
    console.log(chalk.dim(`Authorization URL: ${authUrl.toString()}\n`));

    // Open browser
    await open(authUrl.toString());

    console.log(
      chalk.yellow(
        "⏳ Waiting for authorization... (This will timeout in 5 minutes)"
      )
    );
    console.log(
      chalk.dim(
        "   If browser doesn't open, copy the URL above and paste it in your browser.\n"
      )
    );

    const spinner = ora("Waiting for authorization...").start();

    try {
      // Wait for tokens (direct flow) or authorization code (OAuth flow)
      const directTokens = await tokensPromise;

      let tokens;
      if (directTokens) {
        // Direct token flow - tokens received directly from frontend
        spinner.text = "Saving tokens...";
        tokens = directTokens;
      } else {
        // OAuth flow - exchange code for tokens
        const code = await codePromise;
        spinner.text = "Exchanging code for tokens...";
        tokens = await exchangeCodeForTokens(code, redirectUri, config);
      }

      saveTokens(tokens);
      spinner.succeed("Authentication successful!");

      // Decode and display user info
      const userInfo = getUserFromToken(tokens.idToken);
      if (userInfo) {
        console.log(chalk.green("\n✓ Logged in as:"), userInfo.email);
      }

      console.log(
        chalk.dim(
          `\nTokens saved to: ${require("os").homedir()}/.flutch/credentials.json`
        )
      );
      console.log(
        chalk.dim("Your session will be automatically refreshed when needed.\n")
      );
    } catch (error: any) {
      spinner.fail("Authentication failed");
      throw error;
    } finally {
      server.close();
    }
  } catch (error: any) {
    console.error(chalk.red("\n✗ Login failed:"), error.message);
    process.exit(1);
  }
}

/**
 * Logout command handler
 */
async function logoutHandler() {
  const { clearTokens } = await import("../../auth/token-storage");
  clearTokens();
  console.log(chalk.green("✓ Logged out successfully"));
}

/**
 * Whoami command handler (show current user)
 */
async function whoamiHandler() {
  const tokens = loadTokens();

  if (!tokens) {
    console.log(chalk.yellow("Not logged in"));
    console.log(chalk.dim("Run 'flutch login' to authenticate"));
    return;
  }

  const userInfo = getUserFromToken(tokens.idToken);

  if (userInfo) {
    console.log(chalk.green("✓ Logged in as:"), userInfo.email);
    console.log(chalk.dim("User ID:"), userInfo.sub);
    if (userInfo.name) {
      console.log(chalk.dim("Name:"), userInfo.name);
    }
  } else {
    console.log(chalk.yellow("Unable to decode user information"));
  }
}

export const loginCommand = new Command("login")
  .description("Authenticate with Flutch using web-based OAuth flow")
  .option("-c, --config <path>", "Path to config file")
  .action(loginHandler);

export const logoutCommand = new Command("logout")
  .description("Log out and clear stored credentials")
  .action(logoutHandler);

export const whoamiCommand = new Command("whoami")
  .description("Show current authenticated user")
  .action(whoamiHandler);
