import { Command } from "commander";
import chalk from "chalk";
import { ConfigManager } from "../../config/config";
import { ApiClient } from "../../api/client";

interface PublishOptions {
  status?: "development" | "beta" | "stable" | "deprecated";
  force?: boolean;
  environment?: "development" | "production";
}
export const publishGraphCommand = new Command("publish")
  .description("Update graph status (publish/unpublish)")
  .argument(
    "<graphType>",
    'Full graph type with version (e.g., "global.flutch-support::1.0.0")'
  )
  .option(
    "-s, --status <status>",
    "New status (development, beta, stable, deprecated)",
    "stable"
  )
  .option("-f, --force", "Skip confirmation prompts")
  .option(
    "-e, --environment <env>",
    "Target environment (development, production)",
    "development"
  )
  .action(async (graphType: string, options: PublishOptions) => {
    try {
      await publishGraph(graphType, options);
    } catch (error: any) {
      console.error(
        chalk.red("✗ Failed to publish graph:"),
        error.message || error
      );
      process.exit(1);
    }
  });

async function publishGraph(
  graphType: string,
  options: PublishOptions
): Promise<void> {
  try {
    console.log("- Loading graph information...");

    // Load configuration with environment override
    const configManager = new ConfigManager();
    let config = configManager.getEnvironmentConfig();

    // Override environment if specified
    if (options.environment) {
      config = configManager.getEnvironmentConfig(options.environment);
    }
    const apiClient = new ApiClient(config);

    // Get current graph info
    const currentGraph = await apiClient.getGraph(graphType);
    console.log(chalk.green("✔ Graph information loaded"));

    console.log(chalk.bold(`\nCurrent Graph Status:`));
    console.log(chalk.dim("  Graph Type:"), currentGraph.graphType);
    console.log(chalk.dim("  Title:"), currentGraph.title);
    console.log(
      chalk.dim("  Current Status:"),
      getStatusDisplay(currentGraph.status)
    );

    if (currentGraph.releaseDate) {
      console.log(
        chalk.dim("  Release Date:"),
        new Date(currentGraph.releaseDate).toLocaleDateString()
      );
    }

    const newStatus = options.status || "stable";

    // Check if status is actually changing
    if (newStatus === currentGraph.status) {
      console.log(
        chalk.yellow("⚠ Status is already set to"),
        getStatusDisplay(newStatus)
      );
      return;
    }

    // Show what will change
    console.log(chalk.bold(`\nStatus Change:`));
    console.log(chalk.dim("  From:"), getStatusDisplay(currentGraph.status));
    console.log(chalk.dim("  To:"), getStatusDisplay(newStatus));
    console.log(chalk.dim("  Environment:"), config.environment);

    // Show impact warning for certain transitions
    showStatusTransitionWarning(currentGraph.status, newStatus);

    if (!options.force) {
      console.log(
        chalk.yellow(`\n⚠ This will change the graph status. Continue? (y/N)`)
      );
      // For now, we'll assume user wants to continue
      // In future, can add proper confirmation
    }

    // Update status
    console.log(`- Updating status to ${newStatus}...`);
    const updatedGraph = await apiClient.updateGraphStatus(
      graphType,
      newStatus
    );

    console.log(chalk.green("✔ Graph status updated successfully"));
    console.log(`  Graph Type: ${updatedGraph.graphType}`);
    console.log(`  New Status: ${getStatusDisplay(updatedGraph.status)}`);
    console.log(`  Environment: ${config.environment}`);

    // Show post-update guidance
    showPostUpdateGuidance(newStatus);
  } catch (error: any) {
    console.error(chalk.red("✖ Failed to update status"));
    throw error;
  }
}

function getStatusDisplay(status: string): string {
  switch (status) {
    case "stable":
      return chalk.green("STABLE");
    case "beta":
      return chalk.yellow("BETA");
    case "development":
      return chalk.blue("DEVELOPMENT");
    case "deprecated":
      return chalk.red("DEPRECATED");
    default:
      return status.toUpperCase();
  }
}

function showStatusTransitionWarning(
  currentStatus: string,
  newStatus: string
): void {
  if (currentStatus === "stable" && newStatus === "deprecated") {
    console.log(chalk.red("\n⚠️  WARNING: Deprecating a stable version!"));
    console.log(chalk.dim("  This will mark the graph as end-of-life."));
  }

  if (currentStatus === "deprecated" && newStatus === "stable") {
    console.log(chalk.yellow("\n⚠️  NOTE: Restoring deprecated version"));
    console.log(
      chalk.dim("  This will make the graph available for use again.")
    );
  }

  if (newStatus === "stable") {
    console.log(chalk.green("\n✨ Promoting to stable!"));
    console.log(
      chalk.dim("  This version will be recommended for production use.")
    );
  }
}

function showPostUpdateGuidance(status: string): void {
  console.log(); // Empty line

  switch (status) {
    case "stable":
      console.log(
        chalk.green("🎉 Graph is now stable and ready for production!")
      );
      break;

    case "beta":
      console.log(chalk.yellow("🧪 Graph is now in beta testing phase"));
      break;

    case "development":
      console.log(chalk.blue("🚧 Graph is back in development"));
      break;
    case "deprecated":
      console.log(chalk.red("⚠️  Graph is now deprecated"));
      console.log(
        chalk.dim("  Users will be encouraged to migrate to newer versions.")
      );
      break;
  }
}
