import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { ApiClient } from "../../api/client";
import { ConfigManager } from "../../config/config";

interface ListToolsOptions {
  environment?: string;
  apiKey?: string;
  category?: string;
  activeOnly?: boolean;
}

export const listToolsCommand = new Command("list-tools")
  .description("List tools from the catalog")
  .option("-e, --environment <env>", "Environment to use (dev, staging, prod)")
  .option("-k, --api-key <key>", "API key for authentication")
  .option("-c, --category <category>", "Filter by category")
  .option("--active-only", "Show only active tools", false)
  .addHelpText(
    "after",
    `
Examples:
  # List all tools
  flutch tools-catalog list-tools

  # List only active tools
  flutch tools-catalog list-tools --active-only

  # List tools by category
  flutch tools-catalog list-tools --category logistics

  # List from production
  flutch tools-catalog list-tools --environment prod
`
  )
  .action(async (options: ListToolsOptions) => {
    try {
      await listTools(options);
    } catch (error) {
      console.error(chalk.red("✗ Failed to list tools:"), error);
      process.exit(1);
    }
  });

async function listTools(options: ListToolsOptions): Promise<void> {
  // Load configuration
  const configManager = new ConfigManager();
  const config = configManager.getEnvironmentConfig(options.environment);

  if (options.apiKey) {
    config.apiKey = options.apiKey;
  }

  const spinner = ora("Fetching tools...").start();

  try {
    const apiClient = new ApiClient(config);

    const tools = await apiClient.listTools();

    spinner.stop();

    // Apply filters
    let filteredTools = tools;

    if (options.category) {
      filteredTools = filteredTools.filter(
        tool => tool.category === options.category
      );
    }

    if (options.activeOnly) {
      filteredTools = filteredTools.filter(tool => tool.isActive);
    }

    console.log(chalk.cyan(`🔧 Tools Catalog (${filteredTools.length} tools)`));
    console.log(chalk.dim("  Environment:"), config.environment);
    if (options.category) {
      console.log(chalk.dim("  Category:"), options.category);
    }
    if (options.activeOnly) {
      console.log(chalk.dim("  Filter:"), "Active only");
    }
    console.log();

    if (filteredTools.length === 0) {
      console.log(chalk.yellow("  No tools found"));
      return;
    }

    // Group by category
    const byCategory: Record<string, any[]> = {};
    filteredTools.forEach(tool => {
      if (!byCategory[tool.category]) {
        byCategory[tool.category] = [];
      }
      byCategory[tool.category].push(tool);
    });

    // Display by category
    Object.keys(byCategory)
      .sort()
      .forEach(category => {
        console.log(
          chalk.bold(`${getCategoryIcon(category)} ${category.toUpperCase()}`)
        );
        console.log();

        byCategory[category].forEach(tool => {
          const statusIcon = tool.isActive ? chalk.green("●") : chalk.red("○");
          console.log(`  ${statusIcon} ${chalk.white(tool.toolName)}`);
          console.log(chalk.dim(`     ${tool.title}`));
          console.log(chalk.dim(`     ${tool.description}`));
          if (tool.configSchema && tool.configSchema.length > 0) {
            console.log(
              chalk.dim(`     Config: ${tool.configSchema.length} parameters`)
            );
          }
          console.log();
        });
      });

    // Summary
    const activeCount = filteredTools.filter(t => t.isActive).length;
    const inactiveCount = filteredTools.length - activeCount;

    console.log(chalk.dim("─".repeat(60)));
    console.log(
      chalk.dim("  Total:"),
      filteredTools.length,
      chalk.dim("│"),
      chalk.green(`Active: ${activeCount}`),
      chalk.dim("│"),
      chalk.red(`Inactive: ${inactiveCount}`)
    );
  } catch (error) {
    spinner.fail("Failed to fetch tools");
    throw error;
  }
}

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    knowledge: "📚",
    web: "🌐",
    code: "💻",
    communication: "📧",
    data: "📊",
    logistics: "🚚",
    custom: "🔧",
  };
  return icons[category] || "🔧";
}
