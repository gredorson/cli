import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { promises as fs } from "fs";
import path from "path";
import {
  ApiClient,
  GraphManifest,
  ModelTypeConstraint,
} from "../../api/client";
import { ConfigManager } from "../../config/config";

interface ValidateOptions {
  environment?: string;
  apiKey?: string;
  offline?: boolean;
  verbose?: boolean;
}

export const validateGraphCommand = new Command("validate")
  .description("Validate a graph manifest file")
  .argument("<manifestPath>", "Path to graph manifest JSON file")
  .option("-e, --environment <env>", "Environment to use for API validation")
  .option("-k, --api-key <key>", "API key for authentication")
  .option("--offline", "Skip API validation, only check local structure")
  .option("-v, --verbose", "Show detailed validation information")
  .action(async (manifestPath: string, options: ValidateOptions) => {
    try {
      await validateGraph(manifestPath, options);
    } catch (error) {
      console.error(chalk.red("✗ Validation failed:"), error);
      process.exit(1);
    }
  });

async function validateGraph(
  manifestPath: string,
  options: ValidateOptions
): Promise<void> {
  const spinner = ora("Loading manifest file...").start();

  try {
    // Load and parse manifest
    const fullPath = path.resolve(manifestPath);

    if (!(await fs.stat(fullPath)).isFile()) {
      throw new Error(`File not found: ${fullPath}`);
    }

    const manifestContent = await fs.readFile(fullPath, "utf-8");
    let manifest: GraphManifest;

    try {
      manifest = JSON.parse(manifestContent);
    } catch (parseError) {
      throw new Error(`Invalid JSON format: ${parseError}`);
    }

    spinner.succeed("Manifest loaded successfully");

    // Try to auto-derive graphType/baseType from CLI config if missing
    try {
      const cfgManager = new ConfigManager();
      const cfg = cfgManager.getEnvironmentConfig(options.environment);
      const companySlug = (cfg as any).companySlug as string | undefined;
      if (
        !manifest.graphType &&
        companySlug &&
        manifest.name &&
        manifest.graphVersion
      ) {
        const baseType = `${companySlug}.${manifest.name}`;
        manifest.baseType = baseType;
        manifest.graphType = `${baseType}::${manifest.graphVersion}`;
      }
    } catch (e) {
      // If config is not available, continue with local validation
    }

    // Validate local structure
    const localValidation = validateLocalStructure(
      manifest,
      options.verbose || false
    );

    if (!localValidation.valid) {
      console.log(chalk.red("✗ Local validation failed:"));
      localValidation.errors.forEach(error => {
        console.log(chalk.red(`  ${error}`));
      });
      process.exit(1);
    }

    console.log(chalk.green("✓ Local structure validation passed"));

    if (options.verbose) {
      showManifestSummary(manifest);
    }

    // Skip API validation if offline mode
    if (options.offline) {
      console.log(chalk.yellow("⚠ Skipping API validation (offline mode)"));
      console.log(chalk.green("✓ Offline validation completed successfully"));
      return;
    }

    // API validation
    spinner.start("Validating with API...");

    try {
      const configManager = new ConfigManager();
      const config = configManager.getEnvironmentConfig(options.environment);

      if (options.apiKey) {
        config.apiKey = options.apiKey;
      }

      const apiClient = new ApiClient(config);
      const apiValidation = await apiClient.validateManifest(manifest);

      if (apiValidation.valid) {
        spinner.succeed("API validation passed");
        console.log(chalk.green("✓ All validations completed successfully"));
        console.log(chalk.dim(`  Environment: ${config.environment}`));
      } else {
        spinner.fail("API validation failed");
        console.log(chalk.red("✗ API validation errors:"));
        apiValidation.errors?.forEach(error => {
          console.log(chalk.red(`  ${error}`));
        });
        process.exit(1);
      }
    } catch (apiError) {
      spinner.fail("API validation failed");
      console.log(chalk.yellow("⚠ Could not validate with API:"), apiError);
      console.log(chalk.green("✓ Local validation completed successfully"));
    }
  } catch (error) {
    spinner.fail("Validation failed");
    throw error;
  }
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateLocalStructure(
  manifest: GraphManifest,
  verbose: boolean
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  const requiredFields = [
    // graphType may be derived; baseType/companyId not required in manifest anymore
    "name",
    "graphVersion",
    "title",
    "description",
  ];

  requiredFields.forEach(field => {
    if (!manifest[field as keyof GraphManifest]) {
      errors.push(`Missing required field: ${field}`);
    }
  });

  // Validate graph type format if present
  if (manifest.graphType && !manifest.graphType.includes("::")) {
    errors.push('Invalid graphType format. Expected: "company.name::version"');
  }

  // Validate graph type consistency
  if (manifest.graphType && manifest.baseType && manifest.graphVersion) {
    const expectedGraphType = `${manifest.baseType}::${manifest.graphVersion}`;
    if (manifest.graphType !== expectedGraphType) {
      errors.push(
        `graphType "${manifest.graphType}" doesn't match baseType::version "${expectedGraphType}"`
      );
    }
  }

  // Validate base type format (optional)
  if (manifest.baseType && !manifest.baseType.includes(".")) {
    warnings.push('baseType should follow "company.name" format');
  }

  // Validate version format (semver)
  if (manifest.graphVersion && !isValidSemver(manifest.graphVersion)) {
    errors.push(
      'graphVersion should follow semantic versioning (e.g., "1.0.0")'
    );
  }

  // Validate status if provided
  const validStatuses = ["development", "beta", "stable", "deprecated"];
  if (manifest.status && !validStatuses.includes(manifest.status)) {
    errors.push(
      `Invalid status "${manifest.status}". Must be one of: ${validStatuses.join(", ")}`
    );
  }

  // Validate visibility if provided
  const validVisibilities = ["public", "private"];
  if (manifest.visibility && !validVisibilities.includes(manifest.visibility)) {
    errors.push(
      `Invalid visibility "${manifest.visibility}". Must be one of: ${validVisibilities.join(", ")}`
    );
  }

  // Validate config schema if present
  if (manifest.configSchema) {
    try {
      if (typeof manifest.configSchema !== "object") {
        errors.push("configSchema must be a valid JSON object");
      }
    } catch {
      errors.push("configSchema must be valid JSON");
    }
  }

  // Validate model types if specified
  if (manifest.modelTypes) {
    const modelTypeErrors = validateModelTypes(manifest);
    errors.push(...modelTypeErrors);
  }

  // Check for common issues
  if (manifest.title && manifest.title.length < 3) {
    warnings.push("Title is very short");
  }

  if (manifest.description && manifest.description.length < 10) {
    warnings.push("Description is very short");
  }

  if (manifest.changelog && manifest.changelog.length === 0) {
    warnings.push("Changelog is empty");
  }

  // Show warnings if verbose
  if (verbose && warnings.length > 0) {
    console.log(chalk.yellow("\n⚠ Warnings:"));
    warnings.forEach(warning => {
      console.log(chalk.yellow(`  ${warning}`));
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function showManifestSummary(manifest: GraphManifest): void {
  console.log(chalk.bold("\nManifest Summary:"));
  console.log(chalk.dim("  Graph Type:"), manifest.graphType);
  console.log(chalk.dim("  Title:"), manifest.title);
  console.log(chalk.dim("  Version:"), manifest.graphVersion);
  console.log(chalk.dim("  Status:"), manifest.status);
  console.log(chalk.dim("  Visibility:"), manifest.visibility);

  if (manifest.author) {
    console.log(chalk.dim("  Author:"), manifest.author);
  }

  if (manifest.changelog && manifest.changelog.length > 0) {
    console.log(chalk.dim("  Changelog entries:"), manifest.changelog.length);
  }

  if (manifest.configSchema) {
    const schemaKeys = Object.keys(manifest.configSchema.properties || {});
    console.log(chalk.dim("  Config properties:"), schemaKeys.length);
  }
}

function isValidSemver(version: string): boolean {
  const semverRegex =
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
  return semverRegex.test(version);
}

function validateModelTypes(manifest: GraphManifest): string[] {
  const errors: string[] = [];

  if (!manifest.configSchema || !manifest.configSchema.properties) {
    errors.push(
      "configSchema.properties is required when modelTypes are specified"
    );
    return errors;
  }

  const allConstraints = [
    ...(manifest.modelTypes?.required || []),
    ...(manifest.modelTypes?.optional || []),
  ];

  // Valid model types
  const validModelTypes = ["chat", "rerank", "embedding", "image", "speech"];

  for (const constraint of allConstraints) {
    // Validate model type enum
    if (!validModelTypes.includes(constraint.modelType)) {
      errors.push(
        `Invalid model type "${constraint.modelType}" in constraint for "${constraint.configPath}". Must be one of: ${validModelTypes.join(", ")}`
      );
      continue;
    }

    // Validate config path exists in schema
    const pathParts = constraint.configPath.split(".");
    let current = manifest.configSchema.properties;
    let pathValid = true;

    for (const part of pathParts) {
      if (!current || !current[part]) {
        pathValid = false;
        break;
      }

      if (current[part].properties) {
        current = current[part].properties;
      } else {
        // This is the final part, should be a modelId field
        if (part === "modelId" && current[part].type === "string") {
          // Valid modelId field
          break;
        } else if (pathParts.indexOf(part) < pathParts.length - 1) {
          // Not the last part but no properties - invalid path
          pathValid = false;
          break;
        }
      }
    }

    if (!pathValid) {
      errors.push(
        `Config path "${constraint.configPath}" specified in model type constraint does not exist in configSchema`
      );
    }
  }

  return errors;
}
