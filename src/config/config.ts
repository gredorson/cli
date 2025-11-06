import { cosmiconfigSync } from "cosmiconfig";
import Joi from "joi";
import chalk from "chalk";
import { FlutchConfig } from "../api/client";

// Schema for project .flutchrc (legacy + new format)
const projectConfigSchema = Joi.alternatives().try(
  // Legacy format: flat config
  Joi.object({
    apiUrl: Joi.string().uri().optional(),
    apiKey: Joi.string().optional(),
    companyId: Joi.string().optional(),
    companySlug: Joi.string().optional(),
    userEmail: Joi.string().email().optional(),
    environment: Joi.string().optional(), // Which global environment to use
  }),
  // New format: just environment selection
  Joi.object({
    environment: Joi.string().required(),
  })
);

// Schema for global ~/.flutch/config.json
const globalConfigSchema = Joi.object({
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
  auth: Joi.object({
    cognitoDomain: Joi.string().optional(),
    cognitoClientId: Joi.string().optional(),
    cognitoRegion: Joi.string().optional(),
    frontendUrl: Joi.string().uri().optional(),
  }).optional(),
}).required();

export interface GlobalConfigFile {
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
  auth?: {
    cognitoDomain?: string;
    cognitoClientId?: string;
    cognitoRegion?: string;
    frontendUrl?: string;
  };
}

export interface ProjectConfigFile {
  // New format: just select environment
  environment?: string;
  // Legacy format: inline config
  apiUrl?: string;
  apiKey?: string;
  companyId?: string;
  companySlug?: string;
  userEmail?: string;
}

// For backward compatibility
export type FlutchConfigFile = GlobalConfigFile;

export class ConfigManager {
  private explorer = cosmiconfigSync("flutch");

  /**
   * Load project configuration from .flutchrc
   */
  loadProjectConfig(): ProjectConfigFile | null {
    try {
      const result = this.explorer.search();

      if (!result) {
        return null;
      }

      // Validate configuration
      const { error, value } = projectConfigSchema.validate(result.config);

      if (error) {
        console.error(chalk.red("✗ Invalid project configuration:"));
        error.details.forEach(detail => {
          console.error(chalk.red(`  ${detail.message}`));
        });
        return null;
      }

      return value;
    } catch (error) {
      console.error(chalk.red("✗ Error loading project configuration:"), error);
      return null;
    }
  }

  /**
   * Load configuration from .flutchrc or package.json (legacy)
   * @deprecated Use loadProjectConfig() and global config instead
   */
  loadConfig(): FlutchConfigFile | null {
    const { loadGlobalConfig } = require("./global-config");
    return loadGlobalConfig();
  }

  /**
   * Get config for specific environment
   */
  getEnvironmentConfig(environment?: string): FlutchConfig {
    const { loadGlobalConfig } = require("./global-config");

    // 1. Try to load project config to get environment selection
    const projectConfig = this.loadProjectConfig();

    // 2. Check if project config is legacy format (has apiUrl)
    if (projectConfig?.apiUrl && projectConfig?.apiKey) {
      // Legacy format: use inline config
      console.log(chalk.dim("Using legacy .flutchrc format"));
      return {
        environment: "local",
        apiUrl: projectConfig.apiUrl,
        apiKey: projectConfig.apiKey,
        companyId: projectConfig.companyId,
        companySlug: projectConfig.companySlug,
        userEmail: projectConfig.userEmail,
      };
    }

    // 3. Load global config
    const globalConfig = loadGlobalConfig();

    if (!globalConfig) {
      console.error(
        chalk.red("✗ No global configuration found.")
      );
      console.log(chalk.dim("\nRun:"), chalk.cyan("flutch init --global"));
      console.log(chalk.dim("Or create:"), chalk.cyan("~/.flutch/config.json\n"));
      process.exit(1);
    }

    // 4. Determine which environment to use
    const envName =
      environment ||
      projectConfig?.environment ||
      globalConfig.defaultEnvironment;

    const envConfig = globalConfig.environments[envName];

    if (!envConfig) {
      console.error(
        chalk.red(`✗ Environment "${envName}" not found in global configuration`)
      );
      console.log(
        chalk.dim("Available environments:"),
        Object.keys(globalConfig.environments).join(", ")
      );
      console.log(chalk.dim("\nEdit:"), chalk.cyan("~/.flutch/config.json"));
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
      auth: {
        cognitoDomain: "your-domain.auth.eu-central-1.amazoncognito.com",
        cognitoClientId: "your-cognito-client-id",
        cognitoRegion: "eu-central-1",
        frontendUrl: "http://localhost:5173",
      },
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
