import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { promises as fs } from "fs";
import path from "path";
import { ApiClient, GraphManifest } from "../../api/client";
import { ConfigManager } from "../../config/config";
import {
  isUnifiedManifest,
  transformUnifiedToLegacy,
  validateUnifiedManifest,
  validateConfigSchemaFiles,
  analyzeBreakingChanges,
  UnifiedManifest,
} from "../../utils/manifest-transformer";

interface RegisterUnifiedOptions {
  environment?: string;
  apiKey?: string;
  dryRun?: boolean;
  manifestVersion?: string;
  status?: "development" | "beta" | "stable" | "deprecated";
  publish?: boolean;
  force?: boolean;
  update?: boolean;
}

export const registerUnifiedCommand = new Command("register")
  .description(
    "Register graph(s) from manifest file (supports both unified and legacy formats)"
  )
  .argument("<manifestPath>", "Path to graph manifest JSON file")
  .option("-e, --environment <env>", "Environment to use (dev, staging, prod)")
  .option("-k, --api-key <key>", "API key for authentication")
  .option("--dry-run", "Validate manifest without registering")
  .option(
    "-v, --manifest-version <version>",
    "Register specific version (for unified manifests)"
  )
  .option(
    "-s, --status <status>",
    "Status to set after registration (development, beta, stable, deprecated)",
    "development"
  )
  .option("--publish", "Publish to stable status (same as --status stable)")
  .option(
    "--force",
    "Force registration ignoring breaking changes and safety checks"
  )
  .option("--update", "Update existing graph if it already exists")
  .addHelpText(
    "after",
    `
Examples:
  # Unified manifest (all supported versions)
  flutch graph register manifest.json

  # Unified manifest (specific version)
  flutch graph register manifest.json --manifest-version 1.0.0

  # Dry run validation
  flutch graph register manifest.json --dry-run

  # Register and publish to stable
  flutch graph register manifest.json --publish

  # Register with custom status
  flutch graph register manifest.json --status beta

  # Force registration ignoring breaking changes
  flutch graph register manifest.json --force
  
  # Update existing graph
  flutch graph register manifest.json --update
`
  )
  .action(async (manifestPath: string, options: RegisterUnifiedOptions) => {
    try {
      await registerUnified(manifestPath, options);
    } catch (error) {
      console.error(chalk.red("✗ Registration failed:"), error);
      process.exit(1);
    }
  });

async function registerUnified(
  manifestPath: string,
  options: RegisterUnifiedOptions
): Promise<void> {
  const spinner = ora("Loading manifest file...").start();

  try {
    // Load and parse manifest
    const fullPath = path.resolve(manifestPath);

    if (!(await fs.stat(fullPath)).isFile()) {
      throw new Error(`File not found: ${fullPath}`);
    }

    const manifestContent = await fs.readFile(fullPath, "utf-8");
    let rawManifest: any;

    try {
      rawManifest = JSON.parse(manifestContent);
    } catch (parseError) {
      throw new Error(`Invalid JSON format: ${parseError}`);
    }

    spinner.succeed("Manifest loaded successfully");

    // Load configuration and API client
    const configManager = new ConfigManager();
    const config = configManager.getEnvironmentConfig(options.environment);

    if (options.apiKey) {
      config.apiKey = options.apiKey;
    }

    const apiClient = new ApiClient(config);

    // Process unified manifest
    if (!isUnifiedManifest(rawManifest)) {
      throw new Error("Invalid manifest format. Must be a unified manifest.");
    }

    await processUnifiedManifest(rawManifest, manifestPath, options, apiClient);
  } catch (error) {
    spinner.fail("Registration failed");
    throw error;
  }
}

async function processUnifiedManifest(
  manifest: UnifiedManifest,
  manifestPath: string,
  options: RegisterUnifiedOptions,
  apiClient: ApiClient
): Promise<void> {
  // Get config for companyId
  const configManager = new ConfigManager();
  const config = configManager.getEnvironmentConfig(options.environment);
  console.log(chalk.blue("📋 Detected unified manifest format"));

  // Local structure validation
  const structureValidation = validateUnifiedManifest(manifest);

  if (!structureValidation.valid) {
    console.log(chalk.red("✗ Structure validation failed:"));
    structureValidation.errors.forEach(error => {
      console.log(chalk.red(`  ${error}`));
    });
    process.exit(1);
  }

  // Validate config schema files exist and are valid JSON
  const schemaValidation = await validateConfigSchemaFiles(
    manifest,
    manifestPath
  );

  if (!schemaValidation.valid) {
    console.log(chalk.red("✗ Config schema validation failed:"));
    schemaValidation.errors.forEach(error => {
      console.log(chalk.red(`  ${error}`));
    });
    process.exit(1);
  }

  // Transform to legacy format(s)
  const spinner = ora("Transforming manifest to API format...").start();
  const legacyManifests = await transformUnifiedToLegacy(
    manifest,
    manifestPath,
    options.manifestVersion,
    config.companyId // Pass companyId from config
  );
  spinner.succeed(
    `Prepared ${legacyManifests.length} version(s) for registration`
  );

  // Show what will be registered
  console.log(
    chalk.cyan(`📦 Will register ${legacyManifests.length} version(s):`)
  );
  legacyManifests.forEach(legacyManifest => {
    console.log(
      chalk.dim(`  ${legacyManifest.graphType} (${legacyManifest.status})`)
    );
  });

  // Show what will be registered (informational)
  if (legacyManifests.length > 1) {
    console.log(
      chalk.cyan(`\n📦 Registering ${legacyManifests.length} versions...`)
    );
  }

  // Process each version
  for (const legacyManifest of legacyManifests) {
    console.log(chalk.dim(`\n→ POST /api/graph-registry/validate`));
    await processLegacyManifest(legacyManifest, options, apiClient);
  }

  console.log(
    chalk.green(
      `\n✓ Successfully processed ${legacyManifests.length} version(s)`
    )
  );
}

async function processLegacyManifest(
  manifest: GraphManifest,
  options: RegisterUnifiedOptions,
  apiClient: ApiClient
): Promise<void> {
  const spinner = ora(`Processing ${manifest.graphType}...`);

  // Check for breaking changes (unless forced or dry-run)
  if (!options.force && !options.dryRun) {
    await checkBreakingChanges(manifest, apiClient, spinner);
  }

  // Dry run - validate only
  if (options.dryRun) {
    spinner.start("Validating manifest...");
    const validation = await apiClient.validateManifest(manifest);

    if (validation.valid) {
      spinner.succeed(`${manifest.graphType} - Validation passed`);
    } else {
      spinner.fail(`${manifest.graphType} - Validation failed`);
      console.log(chalk.red("✗ API validation errors:"));
      validation.errors?.forEach(error => {
        console.log(chalk.red(`  ${error}`));
      });
      throw new Error("API validation failed");
    }
    return;
  }

  // Registration or Update
  spinner.start(`Registering ${manifest.graphType}...`);
  let result: any;

  try {
    result = await apiClient.registerGraph(manifest);
    spinner.succeed(`${manifest.graphType} - Registered`);
  } catch (error: any) {
    // Handle conflict (graph already exists)
    if (error.response?.status === 409) {
      if (options.update) {
        spinner.text = `Updating existing ${manifest.graphType}...`;
        try {
          result = await apiClient.updateGraph(manifest.graphType!, manifest);
          spinner.succeed(`${manifest.graphType} - Updated`);
        } catch (updateError: any) {
          spinner.fail(`${manifest.graphType} - Update failed`);
          throw updateError;
        }
      } else {
        spinner.fail(`${manifest.graphType} - Already exists`);
        console.log(chalk.red(`✗ Graph ${manifest.graphType} already exists`));
        console.log(chalk.yellow(`💡 To update existing graph, use:`));
        console.log(
          chalk.dim(`   flutch graph register manifest.json --update`)
        );
        throw new Error("Graph already exists. Use --update to overwrite.");
      }
    } else {
      spinner.fail(`${manifest.graphType} - Registration failed`);
      throw error;
    }
  }

  // Status is already set in manifest and sent to API during registration
  // No additional status update needed

  console.log(chalk.green(`✓ ${result.graphType}`));
  console.log(chalk.dim(`  Status: ${result.status}`));
  console.log(chalk.dim(`  Version: ${result.graphVersion}`));
}

async function checkBreakingChanges(
  manifest: GraphManifest,
  apiClient: ApiClient,
  spinner: any
): Promise<void> {
  spinner.start(`Checking for breaking changes in ${manifest.graphType}...`);

  try {
    // Get current version from API (if exists)
    if (!manifest.graphType) {
      throw new Error("Missing graphType in manifest");
    }
    const currentManifest = await apiClient.getGraph(manifest.graphType);

    if (
      currentManifest &&
      currentManifest.configSchema &&
      manifest.configSchema
    ) {
      const analysis = await analyzeBreakingChanges(
        currentManifest.configSchema,
        manifest.configSchema
      );

      if (analysis.hasBreakingChanges) {
        spinner.fail(`Breaking changes detected in ${manifest.graphType}`);

        console.log(chalk.red("🚨 Breaking Changes Detected:"));
        analysis.breakingChanges.forEach(change => {
          console.log(chalk.red(`  • ${change}`));
        });

        if (analysis.warnings.length > 0) {
          console.log(chalk.yellow("\n⚠ Warnings:"));
          analysis.warnings.forEach(warning => {
            console.log(chalk.yellow(`  • ${warning}`));
          });
        }

        console.log(
          chalk.yellow(
            `\n💡 To force registration despite breaking changes, use:`
          )
        );
        console.log(
          chalk.dim(`   flutch graph register manifest.json --force`)
        );

        throw new Error("Breaking changes detected. Use --force to override.");
      }

      if (analysis.warnings.length > 0) {
        spinner.warn(`Potential issues detected in ${manifest.graphType}`);
        console.log(chalk.yellow("⚠ Warnings:"));
        analysis.warnings.forEach(warning => {
          console.log(chalk.yellow(`  • ${warning}`));
        });
        console.log(); // Add spacing
      } else {
        spinner.succeed(
          `No breaking changes detected in ${manifest.graphType}`
        );
      }
    } else {
      // New graph or no config schema - no breaking changes possible
      spinner.succeed(
        `New graph ${manifest.graphType} - no compatibility issues`
      );
    }
  } catch (error: any) {
    if (error.message?.includes("Breaking changes detected")) {
      throw error; // Re-throw breaking changes errors
    }

    // Graph doesn't exist or API error - treat as new graph
    spinner.succeed(`${manifest.graphType} - treating as new version`);
  }
}
