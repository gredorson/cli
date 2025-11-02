import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { ApiClient } from "../../api/client";
import { ConfigManager } from "../../config/config";
import * as fs from "fs";
import * as path from "path";

interface RegisterToolsOptions {
  environment?: string;
  apiKey?: string;
  manifest: string;
  dryRun?: boolean;
}

interface ToolManifest {
  version: string;
  server: string;
  description: string;
  tools: Array<{
    toolName: string;
    title: string;
    description: string;
    category: string;
    isActive: boolean;
    configSchema?: any[];
  }>;
}

export const registerToolsCommand = new Command("register-tools")
  .description("Register tools from a manifest file")
  .requiredOption("-m, --manifest <path>", "Path to tools manifest JSON file")
  .option("-e, --environment <env>", "Environment to use (dev, staging, prod)")
  .option("-k, --api-key <key>", "API key for authentication")
  .option(
    "--dry-run",
    "Validate manifest without actually registering tools",
    false
  )
  .addHelpText(
    "after",
    `
Examples:
  # Register tools from manifest
  flutch tools-catalog register-tools \\
    --manifest packages/mcp-runtime/src/servers/logistics-driver/tools-manifest.json

  # Dry run to validate manifest
  flutch tools-catalog register-tools \\
    --manifest tools-manifest.json \\
    --dry-run

  # Register to production
  flutch tools-catalog register-tools \\
    --manifest tools-manifest.json \\
    --environment prod \\
    --api-key your-api-key
`
  )
  .action(async (options: RegisterToolsOptions) => {
    try {
      await registerTools(options);
    } catch (error) {
      console.error(chalk.red("✗ Failed to register tools:"), error);
      process.exit(1);
    }
  });

async function registerTools(options: RegisterToolsOptions): Promise<void> {
  // Load and validate manifest
  const manifestPath = path.resolve(process.cwd(), options.manifest);

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found: ${manifestPath}`);
  }

  let manifest: ToolManifest;
  try {
    const manifestContent = fs.readFileSync(manifestPath, "utf-8");
    manifest = JSON.parse(manifestContent);
  } catch (error) {
    throw new Error(`Failed to parse manifest file: ${error}`);
  }

  // Validate manifest structure
  validateManifest(manifest);

  console.log(chalk.cyan("📋 Tools Manifest:"));
  console.log(chalk.dim("  Server:"), manifest.server);
  console.log(chalk.dim("  Version:"), manifest.version);
  console.log(chalk.dim("  Description:"), manifest.description);
  console.log(chalk.dim("  Tools count:"), manifest.tools.length);
  console.log();

  // List tools
  console.log(chalk.cyan("🔧 Tools to register:"));
  manifest.tools.forEach((tool, index) => {
    console.log(
      chalk.dim(`  ${index + 1}.`),
      chalk.white(tool.toolName),
      chalk.dim(`- ${tool.title}`)
    );
    console.log(
      chalk.dim(`     Category: ${tool.category}, Active: ${tool.isActive}`)
    );
  });
  console.log();

  if (options.dryRun) {
    console.log(chalk.yellow("✓ Dry run completed - manifest is valid"));
    console.log(chalk.dim("  No tools were registered (--dry-run mode)"));
    return;
  }

  // Load configuration
  const configManager = new ConfigManager();
  const config = configManager.getEnvironmentConfig(options.environment);

  if (options.apiKey) {
    config.apiKey = options.apiKey;
  }

  const spinner = ora("Registering tools...").start();

  try {
    const apiClient = new ApiClient(config);

    const results = await apiClient.registerTools(manifest.tools);

    spinner.succeed("Tools registered successfully");

    console.log();
    console.log(chalk.green("✓ Registration complete"));
    console.log(chalk.dim("  Environment:"), config.environment);
    console.log(chalk.dim("  Registered:"), results.registered);
    console.log(chalk.dim("  Updated:"), results.updated);
    console.log(chalk.dim("  Skipped:"), results.skipped);
    console.log(chalk.dim("  Failed:"), results.failed);

    if (results.errors && results.errors.length > 0) {
      console.log();
      console.log(chalk.yellow("⚠️  Errors encountered:"));
      results.errors.forEach((error: any) => {
        console.log(chalk.yellow(`  • ${error.toolName}: ${error.error}`));
      });
    }

    if (results.details && results.details.length > 0) {
      console.log();
      console.log(chalk.dim("📊 Details:"));
      results.details.forEach((detail: any) => {
        const status =
          detail.status === "registered"
            ? "✓"
            : detail.status === "updated"
              ? "↻"
              : detail.status === "skipped"
                ? "→"
                : "✗";
        const color =
          detail.status === "registered" || detail.status === "updated"
            ? chalk.green
            : detail.status === "skipped"
              ? chalk.dim
              : chalk.red;
        console.log(color(`  ${status} ${detail.toolName} - ${detail.status}`));
      });
    }
  } catch (error) {
    spinner.fail("Failed to register tools");
    throw error;
  }
}

function validateManifest(manifest: ToolManifest): void {
  if (!manifest.version) {
    throw new Error("Manifest missing required field: version");
  }

  if (!manifest.server) {
    throw new Error("Manifest missing required field: server");
  }

  if (!manifest.tools || !Array.isArray(manifest.tools)) {
    throw new Error("Manifest missing required field: tools (must be array)");
  }

  if (manifest.tools.length === 0) {
    throw new Error("Manifest contains no tools");
  }

  // Validate each tool
  manifest.tools.forEach((tool, index) => {
    const requiredFields = [
      "toolName",
      "title",
      "description",
      "category",
      "isActive",
    ];

    requiredFields.forEach(field => {
      if (!(field in tool)) {
        throw new Error(
          `Tool at index ${index} missing required field: ${field}`
        );
      }
    });

    // Validate tool name format
    if (!tool.toolName.match(/^[a-z0-9._-]+$/i)) {
      throw new Error(
        `Tool ${tool.toolName} has invalid name format. Use alphanumeric characters, dots, hyphens, and underscores only.`
      );
    }

    // Validate category
    const validCategories = [
      "knowledge",
      "web",
      "code",
      "communication",
      "data",
      "logistics",
      "custom",
    ];
    if (!validCategories.includes(tool.category)) {
      console.warn(
        chalk.yellow(
          `⚠️  Tool ${tool.toolName} has uncommon category: ${tool.category}`
        )
      );
    }
  });

  console.log(chalk.green("✓ Manifest validation passed"));
}
