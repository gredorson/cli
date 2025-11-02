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
  UnifiedManifest,
} from "../../utils/manifest-transformer";

interface ValidateUnifiedOptions {
  environment?: string;
  apiKey?: string;
  offline?: boolean;
  verbose?: boolean;
  manifestVersion?: string;
}

export const validateUnifiedCommand = new Command("validate")
  .description(
    "Validate graph manifest file (supports both unified and legacy formats)"
  )
  .argument("<manifestPath>", "Path to graph manifest JSON file")
  .option("-e, --environment <env>", "Environment to use for API validation")
  .option("-k, --api-key <key>", "API key for authentication")
  .option("--offline", "Skip API validation, only check local structure")
  .option("-v, --verbose", "Show detailed validation information")
  .option(
    "--manifest-version <version>",
    "Validate specific version (for unified manifests)"
  )
  .addHelpText(
    "after",
    `
Examples:
  # Validate unified manifest (all versions)
  flutch graph validate manifest.json

  # Validate specific version
  flutch graph validate manifest.json --manifest-version 1.0.0

  # Offline validation only
  flutch graph validate manifest.json --offline

  # Verbose output
  flutch graph validate manifest.json --verbose
`
  )
  .action(async (manifestPath: string, options: ValidateUnifiedOptions) => {
    try {
      await validateUnified(manifestPath, options);
    } catch (error) {
      console.error(chalk.red("✗ Validation failed:"), error);
      process.exit(1);
    }
  });

async function validateUnified(
  manifestPath: string,
  options: ValidateUnifiedOptions
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

    // Validate unified manifest
    if (!isUnifiedManifest(rawManifest)) {
      throw new Error("Invalid manifest format. Must be a unified manifest.");
    }

    await validateUnifiedManifestFile(rawManifest, manifestPath, options);

    console.log(chalk.green("✓ All validations completed successfully"));
  } catch (error) {
    spinner.fail("Validation failed");
    throw error;
  }
}

async function validateUnifiedManifestFile(
  manifest: UnifiedManifest,
  manifestPath: string,
  options: ValidateUnifiedOptions
): Promise<void> {
  console.log(chalk.blue("📋 Validating unified manifest format"));

  // Local structure validation
  const structureValidation = validateUnifiedManifest(manifest);

  if (!structureValidation.valid) {
    console.log(chalk.red("✗ Structure validation failed:"));
    structureValidation.errors.forEach(error => {
      console.log(chalk.red(`  ${error}`));
    });
    process.exit(1);
  }

  console.log(chalk.green("✓ Structure validation passed"));

  // Show warnings
  if (structureValidation.warnings.length > 0) {
    console.log(chalk.yellow("⚠ Warnings:"));
    structureValidation.warnings.forEach(warning => {
      console.log(chalk.yellow(`  ${warning}`));
    });
  }

  // Validate config schema files exist and are valid JSON
  const spinner = ora("Validating config schema files...").start();
  const schemaValidation = await validateConfigSchemaFiles(
    manifest,
    manifestPath
  );

  if (!schemaValidation.valid) {
    spinner.fail("Config schema validation failed");
    console.log(chalk.red("✗ Config schema errors:"));
    schemaValidation.errors.forEach(error => {
      console.log(chalk.red(`  ${error}`));
    });
    process.exit(1);
  }

  spinner.succeed("Config schema files validated");

  // Show manifest summary if verbose
  if (options.verbose) {
    showUnifiedManifestSummary(manifest);
  }

  // Skip API validation if offline mode
  if (options.offline) {
    console.log(chalk.yellow("⚠ Skipping API validation (offline mode)"));
    return;
  }

  // API validation - transform to legacy format and validate each version
  const transformSpinner = ora(
    "Transforming to API format for validation..."
  ).start();
  const legacyManifests = await transformUnifiedToLegacy(
    manifest,
    manifestPath,
    options.manifestVersion
  );
  transformSpinner.succeed(
    `Prepared ${legacyManifests.length} version(s) for API validation`
  );

  // Load API client
  const configManager = new ConfigManager();
  const config = configManager.getEnvironmentConfig(options.environment);

  if (options.apiKey) {
    config.apiKey = options.apiKey;
  }

  const apiClient = new ApiClient(config);

  // Validate each version with API
  for (const legacyManifest of legacyManifests) {
    await validateWithAPI(legacyManifest, apiClient);
  }

  console.log(
    chalk.green(
      `✓ API validation completed for ${legacyManifests.length} version(s)`
    )
  );
  console.log(chalk.dim(`  Environment: ${config.environment}`));
}

async function validateWithAPI(
  manifest: GraphManifest,
  apiClient: ApiClient
): Promise<void> {
  const spinner = ora(`Validating ${manifest.graphType} with API...`).start();

  try {
    const apiValidation = await apiClient.validateManifest(manifest);

    if (apiValidation.valid) {
      spinner.succeed(`${manifest.graphType} - API validation passed`);
    } else {
      spinner.fail(`${manifest.graphType} - API validation failed`);
      console.log(chalk.red("✗ API validation errors:"));
      apiValidation.errors?.forEach(error => {
        console.log(chalk.red(`  ${error}`));
      });
      throw new Error("API validation failed");
    }
  } catch (apiError) {
    spinner.fail(`${manifest.graphType} - API validation failed`);
    throw apiError;
  }
}

function showUnifiedManifestSummary(manifest: UnifiedManifest): void {
  console.log(chalk.bold("\nUnified Manifest Summary:"));
  console.log(chalk.dim("  Company:"), manifest.companySlug);
  console.log(chalk.dim("  Name:"), manifest.name);
  console.log(chalk.dim("  Title:"), manifest.title);
  console.log(chalk.dim("  Category:"), manifest.category);
  console.log(
    chalk.dim("  Default Version:"),
    manifest.versioning.defaultVersion
  );
  console.log(
    chalk.dim("  Supported Versions:"),
    manifest.versioning.supportedVersions.join(", ")
  );
  console.log(chalk.dim("  Tags:"), manifest.tags.join(", "));

  if (manifest.author) {
    console.log(chalk.dim("  Author:"), manifest.author);
  }

  // Show version details
  console.log(chalk.bold("\nVersion Details:"));
  manifest.versioning.supportedVersions.forEach(version => {
    const vConfig = manifest.versions[version];
    console.log(
      chalk.dim(`  ${version}:`),
      `${vConfig.status} (${manifest.visibility})`
    );
  });
}
