import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { jwtDecode } from "jwt-decode";

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number;
}

const CONFIG_DIR = path.join(os.homedir(), ".flutch");
const TOKEN_FILE = path.join(CONFIG_DIR, "credentials.json");

/**
 * Ensure the config directory exists
 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Save tokens to local storage
 */
export function saveTokens(tokens: TokenData): void {
  ensureConfigDir();
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), {
    mode: 0o600,
  });
}

/**
 * Load tokens from local storage
 */
export function loadTokens(): TokenData | null {
  if (!fs.existsSync(TOKEN_FILE)) {
    return null;
  }

  try {
    const data = fs.readFileSync(TOKEN_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Failed to load tokens:", error);
    return null;
  }
}

/**
 * Clear stored tokens
 */
export function clearTokens(): void {
  if (fs.existsSync(TOKEN_FILE)) {
    fs.unlinkSync(TOKEN_FILE);
  }
}

/**
 * Check if tokens are expired
 */
export function isTokenExpired(tokens: TokenData): boolean {
  return Date.now() >= tokens.expiresAt;
}

/**
 * Get valid ID token (auto-refresh if needed)
 * ID token is used for authentication with the backend
 */
export async function getValidIdToken(): Promise<string | null> {
  const tokens = loadTokens();

  if (!tokens) {
    return null;
  }

  // If token is not expired, return it
  if (!isTokenExpired(tokens)) {
    return tokens.idToken;
  }

  // Token is expired, try to refresh
  try {
    const refreshed = await refreshAccessToken(tokens.refreshToken);
    return refreshed.idToken;
  } catch (error) {
    console.error("Failed to refresh token:", error);
    clearTokens();
    return null;
  }
}

/**
 * Get valid access token (auto-refresh if needed)
 */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = loadTokens();

  if (!tokens) {
    return null;
  }

  // If token is not expired, return it
  if (!isTokenExpired(tokens)) {
    return tokens.accessToken;
  }

  // Token is expired, try to refresh
  try {
    const refreshed = await refreshAccessToken(tokens.refreshToken);
    return refreshed.accessToken;
  } catch (error) {
    console.error("Failed to refresh token:", error);
    clearTokens();
    return null;
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenData> {
  const {
    CognitoIdentityProviderClient,
    InitiateAuthCommand,
  } = await import("@aws-sdk/client-cognito-identity-provider");

  const client = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || "eu-central-1",
  });

  const command = new InitiateAuthCommand({
    AuthFlow: "REFRESH_TOKEN_AUTH",
    ClientId: process.env.COGNITO_CLIENT_ID || "",
    AuthParameters: {
      REFRESH_TOKEN: refreshToken,
    },
  });

  const response = await client.send(command);

  if (
    !response.AuthenticationResult?.AccessToken ||
    !response.AuthenticationResult?.IdToken
  ) {
    throw new Error("Failed to refresh token");
  }

  const accessToken = response.AuthenticationResult.AccessToken;
  const idToken = response.AuthenticationResult.IdToken;
  const expiresIn = response.AuthenticationResult.ExpiresIn || 3600;

  const newTokens: TokenData = {
    accessToken,
    idToken,
    refreshToken, // Keep the same refresh token
    expiresAt: Date.now() + expiresIn * 1000,
  };

  saveTokens(newTokens);
  return newTokens;
}

/**
 * Extract user info from ID token
 */
export function getUserFromToken(idToken: string): any {
  try {
    return jwtDecode(idToken);
  } catch (error) {
    console.error("Failed to decode token:", error);
    return null;
  }
}
