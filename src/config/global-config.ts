import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import chalk from "chalk";
import Joi from "joi";

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".flutch");
const GLOBAL_CONFIG_FILE = path.join(GLOBAL_CONFIG_DIR, "config.json");

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

/**
 * Load global config from ~/.flutch/config.json
 */
export function loadGlobalConfig(): GlobalConfigFile | null {
  if (!fs.existsSync(GLOBAL_CONFIG_FILE)) {
    return null;
  }

  try {
    const data = fs.readFileSync(GLOBAL_CONFIG_FILE, "utf-8");
    const config = JSON.parse(data);

    // Validate
    const { error, value } = globalConfigSchema.validate(config);
    if (error) {
      console.error(chalk.red("✗ Invalid global config:"));
      error.details.forEach(detail => {
        console.error(chalk.red(`  ${detail.message}`));
      });
      return null;
    }

    return value;
  } catch (error) {
    console.error(chalk.red("✗ Error loading global config:"), error);
    return null;
  }
}

/**
 * Save global config to ~/.flutch/config.json
 */
export function saveGlobalConfig(config: GlobalConfigFile): void {
  // Ensure directory exists
  if (!fs.existsSync(GLOBAL_CONFIG_DIR)) {
    fs.mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true, mode: 0o700 });
  }

  // Validate before saving
  const { error } = globalConfigSchema.validate(config);
  if (error) {
    throw new Error(`Invalid config: ${error.message}`);
  }

  fs.writeFileSync(GLOBAL_CONFIG_FILE, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
}

/**
 * Get default global config
 */
export function getDefaultGlobalConfig(): GlobalConfigFile {
  return {
    environments: {
      development: {
        apiUrl: "http://localhost:3000",
        apiKey: "dev-api-key-here",
      },
      staging: {
        apiUrl: "https://api-staging.amelie.ai",
        apiKey: "staging-api-key-here",
      },
      production: {
        apiUrl: "https://api.amelie.ai",
        apiKey: "prod-api-key-here",
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
}

/**
 * Initialize global config file
 */
export function initGlobalConfig(): void {
  if (fs.existsSync(GLOBAL_CONFIG_FILE)) {
    console.log(
      chalk.yellow(
        `⚠ Global config already exists at ${GLOBAL_CONFIG_FILE}`
      )
    );
    return;
  }

  const defaultConfig = getDefaultGlobalConfig();
  saveGlobalConfig(defaultConfig);

  console.log(chalk.green(`✓ Created global config at ${GLOBAL_CONFIG_FILE}`));
  console.log(
    chalk.dim(
      "\nEdit this file to configure your environments and authentication."
    )
  );
}

/**
 * Get global config path
 */
export function getGlobalConfigPath(): string {
  return GLOBAL_CONFIG_FILE;
}
