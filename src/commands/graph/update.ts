import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { promises as fs } from "fs";
import path from "path";
import { ApiClient, GraphManifest } from "../../api/client";
import { ConfigManager } from "../../config/config";

interface UpdateOptions {
  environment?: string;
  apiKey?: string;
  dryRun?: boolean;
}

export const updateGraphCommand = new Command("update")
  .description("Update an existing graph from manifest file")
  .argument("<manifestPath>", "Path to updated graph manifest JSON file")
  .option("-e, --environment <env>", "Environment to use (dev, staging, prod)")
  .option("-k, --api-key <key>", "API key for authentication")
  .option("--dry-run", "Validate manifest without updating")
  .addHelpText(
    "after",
    `
Examples:
  flutch graph update manifest.json              # Update graph
  flutch graph update manifest.json --dry-run    # Validate update only
  flutch graph update manifest.json -e staging   # Update in staging
`
  )
  .action(async (manifestPath: string, options: UpdateOptions) => {
    try {
      await updateGraph(manifestPath, options);
    } catch (error) {
      console.error(chalk.red("✗ Update failed:"), error);
      process.exit(1);
    }
  });

async function updateGraph(
  manifestPath: string,
  options: UpdateOptions
): Promise<void> {
  const spinner = ora("Loading manifest file...").start();

  try {
    // Load and parse manifest
    const fullPath = path.resolve(manifestPath);
    const manifestContent = await fs.readFile(fullPath, "utf-8");
    const manifest: GraphManifest = JSON.parse(manifestContent);

    spinner.succeed("Manifest loaded successfully");

    // Validate manifest structure
    validateManifestStructure(manifest);

    // Load configuration
    const configManager = new ConfigManager();
    const config = configManager.getEnvironmentConfig(options.environment);

    // Override API key if provided
    if (options.apiKey) {
      config.apiKey = options.apiKey;
    }

    const apiClient = new ApiClient(config);

    // Auto-derive graphType/baseType if missing using companySlug from config
    if (!manifest.graphType) {
      const companySlug = (config as any).companySlug as string | undefined;
      if (!companySlug) {
        console.error(
          chalk.red(
            "✗ companySlug is not set in CLI config and graphType is missing. Run 'flutch config -i' or specify graphType in the manifest."
          )
        );
        process.exit(1);
      }
      if (!manifest.name || !manifest.graphVersion) {
        console.error(
          chalk.red(
            "✗ graphType is missing and cannot be derived without 'name' and 'graphVersion'"
          )
        );
        process.exit(1);
      }
      const baseType = `${companySlug}.${manifest.name}`;
      manifest.baseType = baseType;
      manifest.graphType = `${baseType}::${manifest.graphVersion}`;
    } else if (!manifest.baseType) {
      manifest.baseType = manifest.graphType.split("::")[0];
    }

    // Check if graph exists
    spinner.start(`Checking if graph ${manifest.graphType} exists...`);
    let existingGraph;
    try {
      existingGraph = await apiClient.getGraph(manifest.graphType);
      spinner.succeed(`Graph ${manifest.graphType} found`);
    } catch (error) {
      spinner.fail(`Graph ${manifest.graphType} not found`);
      console.log(
        chalk.yellow(
          `\n⚠ Graph does not exist. Use "flutch graph register" to create a new graph.`
        )
      );
      process.exit(1);
    }

    // Show differences
    console.log(chalk.dim("\nChanges to be applied:"));
    showDifferences(existingGraph, manifest);

    // Dry run - validate only
    if (options.dryRun) {
      spinner.start("Validating manifest...");
      const validation = await apiClient.validateManifest(manifest);

      if (validation.valid) {
        spinner.succeed("Manifest is valid");
        console.log(chalk.green("✓ Manifest validation passed"));
        console.log(chalk.yellow("\n⚠ Dry run mode - no changes were made"));
      } else {
        spinner.fail("Manifest validation failed");
        console.log(chalk.red("✗ Validation errors:"));
        validation.errors?.forEach(error => {
          console.log(chalk.red(`  ${error}`));
        });
        process.exit(1);
      }
      return;
    }

    // Update graph
    spinner.start(`Updating graph ${manifest.graphType}...`);

    // Note: Since the backend doesn't have a full update endpoint,
    // we can only update the status for now. In a real implementation,
    // you would need to add a full update endpoint to the backend.

    if (manifest.status && existingGraph.status !== manifest.status) {
      const result = await apiClient.updateGraphStatus(
        manifest.graphType,
        manifest.status
      );
      spinner.succeed("Graph updated successfully");

      console.log(chalk.green("✓ Graph update completed"));
      console.log(chalk.dim("  Graph Type:"), result.graphType);
      console.log(chalk.dim("  Version:"), result.graphVersion);
      console.log(chalk.dim("  Status:"), result.status);
      console.log(chalk.dim("  Environment:"), config.environment);
    } else {
      spinner.info("No status changes to apply");
      console.log(
        chalk.yellow(
          "\n⚠ Only status updates are currently supported. To update other fields, you may need to create a new version."
        )
      );
    }

    // Suggest next steps
    if (manifest.status === "development") {
      console.log(
        chalk.yellow(
          '\n⚠ Graph is in development status. Use "flutch graph publish" to move to stable.'
        )
      );
    }
  } catch (error) {
    spinner.fail("Update failed");
    throw error;
  }
}

function validateManifestStructure(manifest: GraphManifest): void {
  // For update, we only need to know graphType. If it's missing, require name+graphVersion to derive it.
  if (!manifest.graphType) {
    const required = ["name", "graphVersion"] as const;
    const missing = required.filter(
      field => !manifest[field as keyof GraphManifest]
    );
    if (missing.length > 0) {
      console.error(chalk.red("✗ Missing required fields in manifest:"));
      missing.forEach(field => {
        console.error(chalk.red(`  ${field}`));
      });
      process.exit(1);
    }
  }

  // Validate status if provided
  if (manifest.status) {
    const validStatuses = ["development", "beta", "stable", "deprecated"];
    if (!validStatuses.includes(manifest.status)) {
      console.error(
        chalk.red(
          `✗ Invalid status "${manifest.status}". Must be one of: ${validStatuses.join(", ")}`
        )
      );
      process.exit(1);
    }
  }
}

function showDifferences(existing: any, updated: GraphManifest): void {
  const fields = ["title", "description", "status", "author", "visibility"];

  let hasChanges = false;

  fields.forEach(field => {
    const existingValue = existing[field];
    const updatedValue = updated[field as keyof GraphManifest];

    if (existingValue !== updatedValue) {
      hasChanges = true;
      console.log(chalk.dim(`  ${field}:`));
      console.log(chalk.red(`    - ${existingValue || "(empty)"}`));
      console.log(chalk.green(`    + ${updatedValue || "(empty)"}`));
    }
  });

  if (!hasChanges) {
    console.log(chalk.dim("  No changes detected"));
  }
}
