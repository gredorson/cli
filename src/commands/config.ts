import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import { ConfigManager } from "../config/config";

interface ConfigOptions {
  environment?: string;
  companyId?: string;
  userEmail?: string;
  interactive?: boolean;
}

export const configCommand = new Command("config")
  .description("Manage CLI configuration")
  .option(
    "-e, --environment <env>",
    "Environment to configure (dev, staging, prod)"
  )
  .option("--company-id <id>", "Set company ID for the environment")
  .option("--user-email <email>", "Set user email for the environment")
  .option("-i, --interactive", "Interactive configuration mode")
  .addHelpText(
    "after",
    `
Examples:
  # Interactive configuration
  flutch config -i

  # Set company ID for development environment
  flutch config -e development --company-id 67b344a744b9e7a1c9b7175a

  # Set user email for production environment  
  flutch config -e production --user-email user@company.com

  # Set both company ID and email
  flutch config -e staging --company-id abc123 --user-email dev@company.com
`
  )
  .action(async (options: ConfigOptions) => {
    try {
      await configureEnvironment(options);
    } catch (error) {
      console.error(chalk.red("✗ Configuration failed:"), error);
      process.exit(1);
    }
  });

async function configureEnvironment(options: ConfigOptions): Promise<void> {
  const configManager = new ConfigManager();

  let environment = options.environment;
  let companyId = options.companyId;
  let userEmail = options.userEmail;
  let companySlug: string | undefined;

  // Interactive mode or missing parameters
  if (options.interactive || (!environment && !companyId && !userEmail)) {
    const config = configManager.loadConfig();

    if (!config) {
      console.log(
        chalk.yellow(
          "⚠ No configuration found. Please run 'flutch init' first."
        )
      );
      process.exit(1);
    }

    const environments = Object.keys(config.environments);

    const answers = await inquirer.prompt([
      {
        type: "list",
        name: "environment",
        message: "Select environment to configure:",
        choices: environments,
        default: environment || config.defaultEnvironment,
      },
      {
        type: "input",
        name: "companyId",
        message: "Enter company ID:",
        default:
          companyId ||
          config.environments[environment || config.defaultEnvironment]
            ?.companyId,
        validate: input => input.length > 0 || "Company ID is required",
      },
      {
        type: "input",
        name: "companySlug",
        message: "Enter company slug (used in graphType):",
        default:
          config.environments[environment || config.defaultEnvironment]
            ?.companySlug,
        validate: input =>
          (!!input && input.length > 0) || "Company slug is required",
      },
      {
        type: "input",
        name: "userEmail",
        message: "Enter user email:",
        default:
          userEmail ||
          config.environments[environment || config.defaultEnvironment]
            ?.userEmail,
        validate: input => {
          if (!input) return "User email is required";
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          return emailRegex.test(input) || "Please enter a valid email address";
        },
      },
    ]);

    environment = answers.environment;
    companyId = answers.companyId;
    companySlug = answers.companySlug;
    userEmail = answers.userEmail;
  }

  if (!environment) {
    console.error(
      chalk.red(
        "✗ Environment is required. Use -e flag or -i for interactive mode."
      )
    );
    process.exit(1);
  }

  const updates: Partial<{
    companyId: string;
    companySlug: string;
    userEmail: string;
  }> = {};

  if (companyId) {
    updates.companyId = companyId;
  }
  if (companySlug) {
    updates.companySlug = companySlug;
  }

  if (userEmail) {
    updates.userEmail = userEmail;
  }

  if (Object.keys(updates).length === 0) {
    console.log(chalk.yellow("⚠ No configuration changes to apply."));
    return;
  }

  // Update configuration
  configManager.updateEnvironmentConfig(environment, updates);

  console.log(chalk.green("✓ Configuration updated successfully"));
  console.log(chalk.dim("  Environment:"), environment);
  if (companyId) console.log(chalk.dim("  Company ID:"), companyId);
  if (companySlug) console.log(chalk.dim("  Company Slug:"), companySlug);
  if (userEmail) console.log(chalk.dim("  User Email:"), userEmail);
}

export const whoamiCommand = new Command("whoami")
  .description("Show current user and environment information")
  .option("-e, --environment <env>", "Show info for specific environment")
  .addHelpText(
    "after",
    `
Examples:
  # Show current user info for default environment
  flutch whoami

  # Show info for specific environment
  flutch whoami -e production
`
  )
  .action(async (options: { environment?: string }) => {
    try {
      await showUserInfo(options);
    } catch (error) {
      console.error(chalk.red("✗ Failed to show user info:"), error);
      process.exit(1);
    }
  });

async function showUserInfo(options: { environment?: string }): Promise<void> {
  const configManager = new ConfigManager();
  const config = configManager.loadConfig();

  if (!config) {
    console.log(
      chalk.yellow("⚠ No configuration found. Please run 'flutch init' first.")
    );
    process.exit(1);
  }

  const environment = options.environment || config.defaultEnvironment;
  const envConfig = config.environments[environment];

  if (!envConfig) {
    console.error(
      chalk.red(`✗ Environment "${environment}" not found in configuration`)
    );
    process.exit(1);
  }

  console.log(chalk.green("🔍 Current Configuration"));
  console.log(chalk.dim("  Environment:"), chalk.cyan(environment));
  console.log(chalk.dim("  API URL:"), envConfig.apiUrl);
  console.log(
    chalk.dim("  Company ID:"),
    envConfig.companyId || chalk.dim("(not set)")
  );
  console.log(
    chalk.dim("  Company Slug:"),
    (envConfig as any).companySlug || chalk.dim("(not set)")
  );
  console.log(
    chalk.dim("  User Email:"),
    envConfig.userEmail || chalk.dim("(not set)")
  );
  console.log(
    chalk.dim("  API Key:"),
    envConfig.apiKey.includes("${")
      ? chalk.dim("(from environment variable)")
      : chalk.dim("(set)")
  );

  if (!envConfig.companyId) {
    console.log(
      chalk.yellow(
        "\n⚠ Company ID not set. Use 'flutch config' to configure it."
      )
    );
  }
  if (!(envConfig as any).companySlug) {
    console.log(
      chalk.yellow(
        "⚠ Company slug not set. Use 'flutch config -i' to configure it."
      )
    );
  }

  if (!envConfig.userEmail) {
    console.log(
      chalk.yellow(
        "⚠ User email not set. Use 'flutch config' to configure it."
      )
    );
  }
}
