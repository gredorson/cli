import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import chalk from "chalk";
import Joi from "joi";
import { FlutchConfig } from "../api/client";

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".flutch");
const DEFAULT_CONFIG_FILE = path.join(GLOBAL_CONFIG_DIR, "config.json");

export interface ConfigFile {
  apiUrl: string;
  apiKey: string;
  siteName?: string;
  companyId?: string;
  companySlug?: string;
  userEmail?: string;
  auth?: {
    cognitoDomain?: string;
    cognitoClientId?: string;
    cognitoRegion?: string;
    frontendUrl?: string;
    cliAuthUrl?: string;
  };
}

const configSchema = Joi.object({
  apiUrl: Joi.string().uri().required(),
  apiKey: Joi.string().required(),
  siteName: Joi.string().optional(),
  companyId: Joi.string().allow("").optional(),
  companySlug: Joi.string().allow("").optional(),
  userEmail: Joi.string().email().optional(),
  auth: Joi.object({
    cognitoDomain: Joi.string().optional(),
    cognitoClientId: Joi.string().optional(),
    cognitoRegion: Joi.string().optional(),
    frontendUrl: Joi.string().uri().optional(),
    cliAuthUrl: Joi.string().uri().optional(),
  }).optional(),
}).required();

/**
 * Load config from file
 * @param configPath Path to config file (optional, defaults to ~/.flutch/config.json)
 */
export function loadConfig(configPath?: string): ConfigFile | null {
  const filePath = configPath || DEFAULT_CONFIG_FILE;

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const data = fs.readFileSync(filePath, "utf-8");
    const config = JSON.parse(data);

    // Validate
    const { error, value } = configSchema.validate(config);
    if (error) {
      console.error(chalk.red(`✗ Invalid config file: ${filePath}`));
      error.details.forEach(detail => {
        console.error(chalk.red(`  ${detail.message}`));
      });
      return null;
    }

    return value;
  } catch (error) {
    console.error(chalk.red(`✗ Error loading config from ${filePath}:`), error);
    return null;
  }
}

/**
 * Get config
 * @param configFile Path to config file (e.g., "~/.flutch/config-local.json" or "config-local.json")
 */
export function getConfig(configFile?: string): FlutchConfig {
  // Resolve config file path
  let configPath = configFile;

  if (configPath) {
    // Handle relative paths - look in ~/.flutch/ directory
    if (!configPath.startsWith("/") && !configPath.startsWith("~/")) {
      configPath = path.join(GLOBAL_CONFIG_DIR, configPath);
    }
    // Handle ~/ paths
    if (configPath.startsWith("~/")) {
      configPath = path.join(os.homedir(), configPath.slice(2));
    }
  }

  // Load config
  const config = loadConfig(configPath);

  if (!config) {
    const displayPath = configPath || DEFAULT_CONFIG_FILE;
    console.error(chalk.red(`✗ Config file not found: ${displayPath}`));
    console.log(chalk.dim("\nCreate config file with:"));
    console.log(chalk.cyan("  mkdir -p ~/.flutch"));
    console.log(chalk.cyan('  cat > ' + displayPath + ' << EOF'));
    console.log(
      chalk.dim(
        JSON.stringify(
          {
            apiUrl: "https://api.amelie.ai",
            apiKey: "${INTERNAL_API_TOKEN}",
            companyId: "",
            companySlug: "",
          },
          null,
          2
        )
      )
    );
    console.log(chalk.cyan("EOF"));
    process.exit(1);
  }

  // Resolve environment variables in values
  return {
    environment: "default",
    apiUrl: resolveEnvVar(config.apiUrl),
    apiKey: resolveEnvVar(config.apiKey),
    siteName: config.siteName || "flutch",
    companyId: config.companyId,
    companySlug: config.companySlug,
    userEmail: config.userEmail,
  };
}

/**
 * Resolve environment variables in string (e.g., "${VAR_NAME}")
 */
function resolveEnvVar(value: string): string {
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
 * Save config to file
 */
export function saveConfig(config: ConfigFile, configPath?: string): void {
  const filePath = configPath || DEFAULT_CONFIG_FILE;

  // Ensure directory exists
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  // Validate before saving
  const { error } = configSchema.validate(config);
  if (error) {
    throw new Error(`Invalid config: ${error.message}`);
  }

  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
}

/**
 * Initialize default config file
 */
export function initConfig(configPath?: string): void {
  const filePath = configPath || DEFAULT_CONFIG_FILE;

  if (fs.existsSync(filePath)) {
    console.log(chalk.yellow(`⚠ Config already exists: ${filePath}`));
    return;
  }

  const defaultConfig: ConfigFile = {
    apiUrl: "https://api.amelie.ai",
    apiKey: "${INTERNAL_API_TOKEN}",
    companyId: "",
    companySlug: "",
    auth: {
      cognitoDomain: "amelieai.auth.eu-central-1.amazoncognito.com",
      cognitoClientId: "your-cognito-client-id",
      cognitoRegion: "eu-central-1",
      frontendUrl: "https://admin.amelie.ai",
    },
  };

  saveConfig(defaultConfig, filePath);
  console.log(chalk.green(`✓ Created config: ${filePath}`));
  console.log(chalk.dim("\nEdit this file to configure your API settings."));
}

/**
 * Get default config file path
 */
export function getDefaultConfigPath(): string {
  return DEFAULT_CONFIG_FILE;
}
