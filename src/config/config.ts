import { cosmiconfigSync } from "cosmiconfig";
import Joi from "joi";
import chalk from "chalk";
import { FlutchConfig } from "../api/client";

const configSchema = Joi.object({
  environments: Joi.object()
    .pattern(
      Joi.string(),
      Joi.object({
        apiUrl: Joi.string().uri().required(),
        apiKey: Joi.string().required(),
        companyId: Joi.string().optional(),
        companySlug: Joi.string().optional(),
        userEmail: Joi.string().email().optional(),
      })
    )
    .required(),
  defaultEnvironment: Joi.string().required(),
}).required();

export interface FlutchConfigFile {
  environments: {
    [envName: string]: {
      apiUrl: string;
      apiKey: string;
      companyId?: string;
      companySlug?: string;
      userEmail?: string;
    };
  };
  defaultEnvironment: string;
}

export class ConfigManager {
  private explorer = cosmiconfigSync("flutch");

  /**
   * Load configuration from .flutchrc or package.json
   */
  loadConfig(): FlutchConfigFile | null {
    try {
      const result = this.explorer.search();

      if (!result) {
        return null;
      }

      // Validate configuration
      const { error, value } = configSchema.validate(result.config);

      if (error) {
        console.error(chalk.red("✗ Invalid configuration:"));
        error.details.forEach(detail => {
          console.error(chalk.red(`  ${detail.message}`));
        });
        process.exit(1);
      }

      return value;
    } catch (error) {
      console.error(chalk.red("✗ Error loading configuration:"), error);
      process.exit(1);
    }
  }

  /**
   * Get config for specific environment
   */
  getEnvironmentConfig(environment?: string): FlutchConfig {
    const config = this.loadConfig();

    if (!config) {
      console.error(
        chalk.red("✗ No configuration found. Please create a .flutchrc file.")
      );
      console.log(chalk.dim("\nExample .flutchrc:"));
      console.log(
        JSON.stringify(
          {
            environments: {
              development: {
                apiUrl: "http://localhost:3000",
                apiKey: "${FLUTCH_DEV_API_KEY}",
              },
              production: {
                apiUrl: "https://api.amelie.ai",
                apiKey: "${FLUTCH_PROD_API_KEY}",
              },
            },
            defaultEnvironment: "development",
          },
          null,
          2
        )
      );
      process.exit(1);
    }

    const envName = environment || config.defaultEnvironment;
    const envConfig = config.environments[envName];

    if (!envConfig) {
      console.error(
        chalk.red(`✗ Environment "${envName}" not found in configuration`)
      );
      console.log(
        chalk.dim("Available environments:"),
        Object.keys(config.environments).join(", ")
      );
      process.exit(1);
    }

    // Resolve environment variables
    const resolvedConfig: FlutchConfig = {
      environment: envName,
      apiUrl: this.resolveEnvVar(envConfig.apiUrl),
      apiKey: this.resolveEnvVar(envConfig.apiKey),
      companyId: envConfig.companyId,
      companySlug: envConfig.companySlug,
      userEmail: envConfig.userEmail,
    };

    return resolvedConfig;
  }

  /**
   * Resolve environment variables in config values
   */
  private resolveEnvVar(value: string): string {
    return value.replace(/\$\{([^}]+)\}/g, (match, envVar) => {
      const envValue = process.env[envVar];
      if (!envValue) {
        console.error(chalk.red(`✗ Environment variable ${envVar} is not set`));
        process.exit(1);
      }
      return envValue;
    });
  }

  /**
   * Update config for specific environment
   */
  updateEnvironmentConfig(
    environment: string,
    updates: Partial<{
      companyId: string;
      companySlug: string;
      userEmail: string;
    }>
  ): void {
    // Use the same config loading logic as loadConfig
    const result = this.explorer.search();
    if (!result) {
      console.error(
        chalk.red(
          "✗ Configuration file not found. Please create a .flutchrc file."
        )
      );
      process.exit(1);
    }

    let config: FlutchConfigFile = result.config;

    if (!config.environments[environment]) {
      console.error(
        chalk.red(`✗ Environment "${environment}" not found in config`)
      );
      console.log(
        chalk.dim("Available environments:"),
        Object.keys(config.environments).join(", ")
      );
      process.exit(1);
    }

    // Update the environment config
    Object.assign(config.environments[environment], updates);

    // Write back to file
    try {
      const fs = require("fs");
      fs.writeFileSync(result.filepath, JSON.stringify(config, null, 2));
      console.log(
        chalk.green(`✓ Updated config for environment "${environment}"`)
      );
    } catch (error) {
      console.error(chalk.red("✗ Error writing config file:"), error);
      process.exit(1);
    }
  }

  /**
   * Initialize configuration file
   */
  async initConfig(): Promise<void> {
    const configPath = ".flutchrc";
    const fs = await import("fs");

    if (fs.existsSync(configPath)) {
      console.log(
        chalk.yellow("⚠ Configuration file already exists at .flutchrc")
      );
      return;
    }

    const defaultConfig: FlutchConfigFile = {
      environments: {
        development: {
          apiUrl: "http://localhost:3000",
          apiKey: "${FLUTCH_DEV_API_KEY}",
        },
        staging: {
          apiUrl: "https://api-staging.amelie.ai",
          apiKey: "${FLUTCH_STAGING_API_KEY}",
        },
        production: {
          apiUrl: "https://api.amelie.ai",
          apiKey: "${FLUTCH_PROD_API_KEY}",
        },
      },
      defaultEnvironment: "development",
    };

    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(chalk.green("✓ Created .flutchrc configuration file"));
    console.log(chalk.dim("\nDon't forget to set environment variables:"));
    console.log(chalk.dim("  export FLUTCH_DEV_API_KEY=your_dev_api_key"));
    console.log(
      chalk.dim("  export FLUTCH_STAGING_API_KEY=your_staging_api_key")
    );
    console.log(chalk.dim("  export FLUTCH_PROD_API_KEY=your_prod_api_key"));
  }
}
