import * as path from "path";
import * as os from "os";
import { loadConfig } from "./simple-config";

export interface AuthConfig {
  cognitoDomain: string;
  cognitoClientId: string;
  cognitoRegion: string;
  frontendUrl: string;
  cliAuthUrl?: string;
}

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".flutch");

/**
 * Load auth config from config file or environment variables
 * @param configFile Path to config file (optional)
 */
export function getAuthConfig(configFile?: string): AuthConfig | null {
  // Resolve config file path (same logic as in simple-config.ts)
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

  // 1. Try to load from config file
  const config = loadConfig(configPath);
  if (
    config?.auth?.cognitoDomain &&
    config.auth?.cognitoClientId &&
    config.auth?.cognitoRegion &&
    config.auth?.frontendUrl
  ) {
    return {
      cognitoDomain: config.auth.cognitoDomain,
      cognitoClientId: config.auth.cognitoClientId,
      cognitoRegion: config.auth.cognitoRegion,
      frontendUrl: config.auth.frontendUrl,
      cliAuthUrl: config.auth.cliAuthUrl,
    };
  }

  // 2. Try environment variables
  const cognitoDomain = process.env.COGNITO_DOMAIN;
  const cognitoClientId = process.env.COGNITO_CLIENT_ID;
  const cognitoRegion = process.env.AWS_REGION;
  const frontendUrl = process.env.FRONTEND_URL;

  if (cognitoDomain && cognitoClientId && cognitoRegion && frontendUrl) {
    return {
      cognitoDomain,
      cognitoClientId,
      cognitoRegion,
      frontendUrl,
    };
  }

  return null;
}
