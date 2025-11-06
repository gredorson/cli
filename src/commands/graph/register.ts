import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { promises as fs } from "fs";
import path from "path";
import { ApiClient, GraphManifest } from "../../api/client";
import { getConfig } from "../../config";

interface RegisterOptions {
  environment?: string;
  apiKey?: string;
  dryRun?: boolean;
  status?: "development" | "beta" | "stable" | "deprecated";
  publish?: boolean;
  config?: string;
}

export const registerGraphCommand = new Command("register")
  .description("Register a graph from manifest file")
  .argument("<manifestPath>", "Path to graph manifest JSON file")
  .option("-e, --environment <env>", "Environment to use (dev, staging, prod)")
  .option("-c, --config <path>", "Path to config file")
  .option("-k, --api-key <key>", "API key for authentication")
  .option("--dry-run", "Validate manifest without registering")
  .option(
    "-s, --status <status>",
    "Status to set after registration (development, beta, stable, deprecated)",
    "development"
  )
  .option("--publish", "Publish to stable status (same as --status stable)")
  .addHelpText(
    "after",
    `
Examples:
  flutch graph register manifest.json              # Register as development
  flutch graph register manifest.json --publish    # Register and publish to stable
  flutch graph register manifest.json -s beta      # Register as beta
  flutch graph register manifest.json --dry-run    # Validate only
`
  )
  .action(async (manifestPath: string, options: RegisterOptions, command) => {
    try {
      // Merge global options from parent command
      const globalOpts = command.parent?.parent?.opts() || {};
      const mergedOptions = { ...options, ...globalOpts };
      await registerGraph(manifestPath, mergedOptions);
    } catch (error) {
      console.error(chalk.red("✗ Registration failed:"), error);
      process.exit(1);
    }
  });

async function registerGraph(
  manifestPath: string,
  options: RegisterOptions
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
    const config = getConfig(options.config);

    // Override API key if provided
    if (options.apiKey) {
      config.apiKey = options.apiKey;
    }

    const apiClient = new ApiClient(config);

    // Get companySlug from manifest or config
    const companySlug =
      (manifest as any).companySlug || (config as any).companySlug;
    if (!companySlug) {
      console.error(
        chalk.red(
          "✗ companySlug is not set in CLI config or manifest. Run 'flutch config -i' or specify companySlug in manifest."
        )
      );
      process.exit(1);
    }

    // Generate base type
    const baseType = `${companySlug}.${manifest.name}`;

    // Get versions to register
    const versions = (manifest as any).versions || {};
    const versionKeys = Object.keys(versions);

    if (versionKeys.length === 0) {
      console.error(
        chalk.red(
          "✗ No versions found in manifest. Add at least one version in 'versions' object."
        )
      );
      process.exit(1);
    }

    console.log(
      chalk.blue(
        `📋 Found ${versionKeys.length} version(s): ${versionKeys.join(", ")}`
      )
    );

    const registrationResults = [];

    // Process each version
    for (const version of versionKeys) {
      const versionConfig = versions[version];
      const graphType = `${baseType}::${version}`;

      try {
        // Load config schema from file
        let configSchema = {};
        if (versionConfig.configSchemaPath) {
          const schemaPath = path.resolve(
            path.dirname(fullPath),
            versionConfig.configSchemaPath
          );
          try {
            const schemaContent = await fs.readFile(schemaPath, "utf-8");
            const parsedSchema = JSON.parse(schemaContent);

            // Extract the actual schema - handle both formats:
            // { "version": "X", "schema": {...} } -> use "schema" field
            // { "type": "object", ... } -> use directly
            if (
              parsedSchema.schema &&
              typeof parsedSchema.schema === "object"
            ) {
              configSchema = parsedSchema.schema;
            } else if (parsedSchema.type) {
              configSchema = parsedSchema;
            } else {
              console.error(
                chalk.red(
                  `✗ Invalid config schema format in ${schemaPath}. Expected either { "schema": {...} } or direct schema object.`
                )
              );
              continue;
            }
          } catch (error) {
            console.error(
              chalk.red(`✗ Failed to load config schema from ${schemaPath}:`),
              error
            );
            continue;
          }
        }

        // Build graph data for registration
        const graphData: GraphManifest = {
          graphType,
          baseType,
          name: manifest.name,
          graphVersion: version,
          title: manifest.title,
          description: manifest.description,
          status: versionConfig.status || options.status || "development",
          configSchema,
          author: (manifest as any).author,
          changelog: (manifest as any).changelog || [],
          visibility:
            versionConfig.visibility ||
            (manifest as any).visibility ||
            "public",
          companyId: (config as any).companyId,
        };

        // Debug: log the configSchema structure
        console.log(
          chalk.blue(`🔍 Debug - configSchema structure for ${graphType}:`)
        );
        console.log(
          chalk.dim(
            JSON.stringify(configSchema, null, 2).substring(0, 500) +
              (JSON.stringify(configSchema).length > 500 ? "..." : "")
          )
        );

        // Dry run - validate only
        if (options.dryRun) {
          spinner.start(`Validating ${graphType}...`);
          const validation = await apiClient.validateManifest(graphData);

          if (validation.valid) {
            spinner.succeed(`${graphType} is valid`);
          } else {
            spinner.fail(`${graphType} validation failed`);
            console.log(chalk.red(`✗ Validation errors for ${graphType}:`));
            validation.errors?.forEach(error => {
              console.log(chalk.red(`  ${error}`));
            });
          }
          continue;
        }

        // Register this version
        spinner.start(`Registering ${graphType}...`);
        let result = await apiClient.registerGraph(graphData);

        // Determine desired status
        let desiredStatus =
          options.status || versionConfig.status || "development";
        if (options.publish) {
          desiredStatus = "stable";
        }

        // Update status if different from registered status
        if (result.status !== desiredStatus) {
          spinner.start(
            `Updating status to ${desiredStatus} for ${graphType}...`
          );
          result = await apiClient.updateGraphStatus(
            result.graphType,
            desiredStatus as any
          );
        }

        spinner.succeed(`${graphType} registered as ${result.status}`);
        registrationResults.push(result);
      } catch (error: any) {
        spinner.fail(`Failed to register ${graphType}`);
        console.error(
          chalk.red(`✗ Error registering ${graphType}:`),
          error.message
        );
      }
    }

    if (options.dryRun) {
      console.log(
        chalk.blue(
          `\n✓ Validation completed for ${versionKeys.length} version(s)`
        )
      );
      return;
    }

    // Summary
    if (registrationResults.length > 0) {
      console.log(
        chalk.green(
          `\n✓ Successfully registered ${registrationResults.length} graph version(s):`
        )
      );
      registrationResults.forEach(result => {
        console.log(chalk.dim(`  ${result.graphType} - ${result.status}`));
      });
      console.log(chalk.dim(`  Environment: ${config.environment}`));

      // Show status message
      const hasStable = registrationResults.some(r => r.status === "stable");
      const allDev = registrationResults.every(r => r.status === "development");

      if (allDev) {
        console.log(
          chalk.yellow(
            "\n⚠ All graphs are in development status. Use --publish to register as stable."
          )
        );
      } else if (hasStable) {
        console.log(
          chalk.green(
            "\n🎉 Some/all graphs are now stable and ready for production!"
          )
        );
      }
    } else {
      console.error(chalk.red("\n✗ No graphs were successfully registered"));
      process.exit(1);
    }
  } catch (error) {
    spinner.fail("Registration failed");
    throw error;
  }
}

function validateManifestStructure(manifest: any): void {
  const required = ["name", "title", "description"];
  const missing = required.filter(field => !manifest[field]);

  if (missing.length > 0) {
    console.error(chalk.red("✗ Missing required fields in manifest:"));
    missing.forEach(field => {
      console.error(chalk.red(`  ${field}`));
    });
    process.exit(1);
  }

  // Check if versions object exists
  if (!manifest.versions || typeof manifest.versions !== "object") {
    console.error(
      chalk.red("✗ Missing or invalid 'versions' object in manifest")
    );
    process.exit(1);
  }

  // Validate each version
  const validStatuses = ["development", "beta", "stable", "deprecated"];
  for (const [version, versionConfig] of Object.entries(
    manifest.versions as any
  )) {
    if (!version) {
      console.error(chalk.red("✗ Empty version key found"));
      process.exit(1);
    }

    const config = versionConfig as any;
    if (config.status && !validStatuses.includes(config.status)) {
      console.error(
        chalk.red(
          `✗ Invalid status "${config.status}" for version ${version}. Must be one of: ${validStatuses.join(", ")}`
        )
      );
      process.exit(1);
    }
  }
}
