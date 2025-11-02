import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { ApiClient } from "../../api/client";
import { ConfigManager } from "../../config/config";

interface ListOptions {
  environment?: string;
  apiKey?: string;
  status?: string;
  format?: "table" | "json";
}

export const listGraphsCommand = new Command("list")
  .description("List graphs and their versions")
  .argument("[baseType]", 'Base type to filter by (e.g., "global.simple")')
  .option("-e, --environment <env>", "Environment to use")
  .option("-k, --api-key <key>", "API key for authentication")
  .option(
    "-s, --status <status>",
    "Filter by status (development, beta, stable, deprecated)"
  )
  .option("-f, --format <format>", "Output format (table, json)", "table")
  .action(async (baseType: string | undefined, options: ListOptions) => {
    try {
      await listGraphs(baseType, options);
    } catch (error) {
      console.error(chalk.red("✗ Failed to list graphs:"), error);
      process.exit(1);
    }
  });

async function listGraphs(
  baseType: string | undefined,
  options: ListOptions
): Promise<void> {
  const spinner = ora("Fetching graphs...").start();

  try {
    // Load configuration
    const configManager = new ConfigManager();
    const config = configManager.getEnvironmentConfig(options.environment);

    // Override API key if provided
    if (options.apiKey) {
      config.apiKey = options.apiKey;
    }

    const apiClient = new ApiClient(config);

    // Fetch graphs
    const graphs = await apiClient.listGraphs(baseType);

    // Filter by status if specified
    const filteredGraphs = options.status
      ? graphs.filter(graph => graph.status === options.status)
      : graphs;

    spinner.succeed(
      `Found ${filteredGraphs.length} graph${filteredGraphs.length !== 1 ? "s" : ""}`
    );

    if (filteredGraphs.length === 0) {
      console.log(chalk.yellow("No graphs found matching the criteria"));
      return;
    }

    // Output in requested format
    if (options.format === "json") {
      console.log(JSON.stringify(filteredGraphs, null, 2));
      return;
    }

    // Table format
    console.log(); // Empty line for spacing

    if (baseType) {
      console.log(chalk.bold(`Versions of ${baseType}:`));
    } else {
      console.log(chalk.bold("All Graphs:"));
    }

    // Group by base type if showing all graphs
    if (!baseType) {
      const groupedGraphs = groupByBaseType(filteredGraphs);

      Object.entries(groupedGraphs).forEach(([base, versions]) => {
        console.log(chalk.cyan(`\n${base}:`));
        versions.forEach(graph => {
          printGraphRow(graph);
        });
      });
    } else {
      // Sort by version if showing specific base type
      const sortedGraphs = filteredGraphs.sort((a, b) => {
        return compareVersions(b.graphVersion, a.graphVersion); // Latest first
      });

      console.log(); // Empty line
      sortedGraphs.forEach(graph => {
        printGraphRow(graph);
      });
    }

    // Show summary
    console.log(
      chalk.dim(
        `\nTotal: ${filteredGraphs.length} graph${filteredGraphs.length !== 1 ? "s" : ""}`
      )
    );
    console.log(chalk.dim(`Environment: ${config.environment}`));
  } catch (error) {
    spinner.fail("Failed to fetch graphs");
    throw error;
  }
}

function groupByBaseType(graphs: any[]): Record<string, any[]> {
  return graphs.reduce((acc, graph) => {
    if (!acc[graph.baseType]) {
      acc[graph.baseType] = [];
    }
    acc[graph.baseType].push(graph);
    return acc;
  }, {});
}

function printGraphRow(graph: any): void {
  const statusColor = getStatusColor(graph.status);
  const statusBadge = statusColor(` ${graph.status.toUpperCase()} `);

  console.log(`  ${statusBadge} v${graph.graphVersion} - ${graph.title}`);

  if (graph.description) {
    console.log(chalk.dim(`    ${graph.description}`));
  }

  if (graph.releaseDate) {
    const date = new Date(graph.releaseDate).toLocaleDateString();
    console.log(chalk.dim(`    Released: ${date}`));
  }
}

function getStatusColor(status: string): (text: string) => string {
  switch (status) {
    case "stable":
      return chalk.bgGreen.black;
    case "beta":
      return chalk.bgYellow.black;
    case "development":
      return chalk.bgBlue.white;
    case "deprecated":
      return chalk.bgRed.white;
    default:
      return chalk.bgGray.white;
  }
}

function compareVersions(a: string, b: string): number {
  const aParts = a.split(".").map(Number);
  const bParts = b.split(".").map(Number);

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aPart = aParts[i] || 0;
    const bPart = bParts[i] || 0;

    if (aPart !== bPart) {
      return aPart - bPart;
    }
  }

  return 0;
}
