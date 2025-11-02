import { promises as fs } from "fs";
import path from "path";
import { GraphManifest } from "../api/client";

/**
 * Unified manifest structure (new format)
 */
export interface UnifiedManifest {
  companySlug: string;
  name: string;
  title: string;
  description: string;
  detailedDescription?: string;
  category: string;
  author: string;
  maintainer?: string;
  repository?: string;
  tags: string[];
  visibility: "public" | "private" | "corporate";
  ui?: {
    enabled: boolean;
    title: string;
    description: string;
    defaultScreen: string;
    menu: string[];
    screens: Record<string, any>;
    theme: {
      primaryColor: string;
      accentColor: string;
    };
    permissions: {
      read: string[];
      write: string[];
    };
  };
  versioning: {
    strategy: "semver";
    defaultVersion: string;
    supportedVersions: string[];
  };
  versions: Record<string, VersionConfig>;
}

export interface VersionConfig {
  status: "development" | "beta" | "stable" | "deprecated";
  releaseDate: string;
  isActive: boolean;
  configSchemaPath: string;
  changelog?: string[];
}

/**
 * Determines if a manifest is in the unified format
 */
export function isUnifiedManifest(manifest: any): manifest is UnifiedManifest {
  return manifest.versioning && manifest.versions && manifest.companySlug;
}

/**
 * Transform unified manifest to legacy format for API compatibility
 */
export async function transformUnifiedToLegacy(
  unifiedManifest: UnifiedManifest,
  manifestPath: string,
  version?: string,
  companyId?: string
): Promise<GraphManifest[]> {
  const manifests: GraphManifest[] = [];
  const manifestDir = path.dirname(manifestPath);

  // Get versions to process
  const versionsToProcess = version
    ? [version]
    : unifiedManifest.versioning.supportedVersions;

  for (const ver of versionsToProcess) {
    const versionConfig = unifiedManifest.versions[ver];
    if (!versionConfig) {
      throw new Error(`Version ${ver} not found in manifest`);
    }

    // Load config schema
    const configSchemaPath = path.resolve(
      manifestDir,
      versionConfig.configSchemaPath
    );
    const configSchemaContent = await fs.readFile(configSchemaPath, "utf-8");
    const parsedSchema = JSON.parse(configSchemaContent);

    // Extract the actual schema - handle both formats:
    // { "version": "X", "schema": {...} } -> use "schema" field
    // { "type": "object", ... } -> use directly
    let configSchema;
    if (parsedSchema.schema && typeof parsedSchema.schema === "object") {
      configSchema = parsedSchema.schema;
    } else if (parsedSchema.type) {
      configSchema = parsedSchema;
    } else {
      throw new Error(
        `Invalid config schema format in ${configSchemaPath}. Expected either { "schema": {...} } or direct schema object.`
      );
    }

    // Build legacy manifest
    const baseType = `${unifiedManifest.companySlug}.${unifiedManifest.name}`;
    const graphType = `${baseType}::${ver}`;

    const legacyManifest: GraphManifest = {
      graphType,
      baseType,
      companyId: companyId || unifiedManifest.companySlug, // Use provided companyId or fallback to companySlug
      name: unifiedManifest.name,
      graphVersion: ver,
      title: unifiedManifest.title,
      description: unifiedManifest.description,
      status: versionConfig.status,
      visibility: unifiedManifest.visibility,
      author: unifiedManifest.author,
      changelog: versionConfig.changelog || [],
      configSchema,
      // Copy UI configuration from unified manifest
      ui: unifiedManifest.ui,
    };

    manifests.push(legacyManifest);
  }

  return manifests;
}

/**
 * Validate unified manifest structure
 */
export function validateUnifiedManifest(manifest: UnifiedManifest): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  const requiredFields = [
    "companySlug",
    "name",
    "title",
    "description",
    "category",
    "author",
    "tags",
    "visibility",
    "versioning",
    "versions",
  ];

  requiredFields.forEach(field => {
    if (!manifest[field as keyof UnifiedManifest]) {
      errors.push(`Missing required field: ${field}`);
    }
  });

  // Validate versioning
  if (manifest.versioning) {
    if (manifest.versioning.strategy !== "semver") {
      errors.push('Versioning strategy must be "semver"');
    }

    // Validate that each version has required status field
    if (manifest.versions) {
      Object.entries(manifest.versions).forEach(([version, config]) => {
        if (!config.status) {
          errors.push(`Version ${version} is missing required "status" field`);
        }
        if (
          config.status &&
          !["development", "beta", "stable", "deprecated"].includes(
            config.status
          )
        ) {
          errors.push(
            `Version ${version} has invalid status "${config.status}". Must be one of: development, beta, stable, deprecated`
          );
        }
      });
    }

    if (!manifest.versioning.defaultVersion) {
      errors.push("Missing versioning.defaultVersion");
    }
    if (
      !manifest.versioning.supportedVersions ||
      manifest.versioning.supportedVersions.length === 0
    ) {
      errors.push("versioning.supportedVersions cannot be empty");
    }

    // Check if defaultVersion is in supportedVersions
    if (
      manifest.versioning.defaultVersion &&
      !manifest.versioning.supportedVersions.includes(
        manifest.versioning.defaultVersion
      )
    ) {
      errors.push("versioning.defaultVersion must be in supportedVersions");
    }
  }

  // Validate versions
  if (manifest.versions) {
    const versionKeys = Object.keys(manifest.versions);

    // Check if all supportedVersions have corresponding version configs
    manifest.versioning?.supportedVersions?.forEach(version => {
      if (!manifest.versions[version]) {
        errors.push(`Missing version configuration for ${version}`);
      }
    });

    // Validate each version config
    versionKeys.forEach(version => {
      const versionConfig = manifest.versions[version];

      if (!versionConfig.status) {
        errors.push(`Missing status for version ${version}`);
      }

      if (!versionConfig.releaseDate) {
        errors.push(`Missing releaseDate for version ${version}`);
      }

      if (!versionConfig.configSchemaPath) {
        errors.push(`Missing configSchemaPath for version ${version}`);
      }
    });

    // Check if there's at least one active version
    const hasActiveVersion = versionKeys.some(
      version => manifest.versions[version].isActive
    );
    if (!hasActiveVersion) {
      warnings.push("No active versions found");
    }
  }

  // Validate semantic versioning
  manifest.versioning?.supportedVersions?.forEach(version => {
    if (!isValidSemver(version)) {
      errors.push(`Invalid semantic version: ${version}`);
    }
  });

  // Validate companySlug format
  if (manifest.companySlug && !/^[a-z0-9-_.]+$/.test(manifest.companySlug)) {
    errors.push(
      "companySlug should contain only lowercase letters, numbers, hyphens, dots, and underscores"
    );
  }

  // Validate name format
  if (manifest.name && !/^[a-z0-9-_]+$/.test(manifest.name)) {
    errors.push(
      "name should contain only lowercase letters, numbers, hyphens, and underscores"
    );
  }

  // Validate visibility
  if (
    manifest.visibility &&
    !["public", "private", "corporate"].includes(manifest.visibility)
  ) {
    errors.push(
      `Invalid visibility "${manifest.visibility}". Must be one of: public, private, corporate`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if config schema files exist
 */
export async function validateConfigSchemaFiles(
  manifest: UnifiedManifest,
  manifestPath: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  const manifestDir = path.dirname(manifestPath);

  for (const version of manifest.versioning.supportedVersions) {
    const versionConfig = manifest.versions[version];
    if (!versionConfig) continue;

    const schemaPath = path.resolve(
      manifestDir,
      versionConfig.configSchemaPath
    );

    try {
      await fs.access(schemaPath);

      // Try to parse JSON
      const content = await fs.readFile(schemaPath, "utf-8");
      JSON.parse(content);
    } catch (error) {
      errors.push(
        `Config schema file not found or invalid JSON: ${versionConfig.configSchemaPath} for version ${version}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Analyze config schema for potential breaking changes
 */
export async function analyzeBreakingChanges(
  currentSchema: any,
  newSchema: any
): Promise<{
  hasBreakingChanges: boolean;
  breakingChanges: string[];
  warnings: string[];
}> {
  const breakingChanges: string[] = [];
  const warnings: string[] = [];

  if (!currentSchema || !newSchema) {
    return { hasBreakingChanges: false, breakingChanges, warnings };
  }

  // Check for removed fields
  const currentProps = currentSchema.properties || {};
  const newProps = newSchema.properties || {};

  for (const field of Object.keys(currentProps)) {
    if (!newProps[field]) {
      breakingChanges.push(`Removed field: ${field}`);
    }
  }

  // Check for changed field types
  for (const field of Object.keys(currentProps)) {
    if (newProps[field]) {
      const currentType = currentProps[field].type;
      const newType = newProps[field].type;

      if (currentType && newType && currentType !== newType) {
        breakingChanges.push(
          `Changed field type: ${field} (${currentType} → ${newType})`
        );
      }
    }
  }

  // Check for new required fields
  const currentRequired = currentSchema.required || [];
  const newRequired = newSchema.required || [];

  for (const field of newRequired) {
    if (!currentRequired.includes(field)) {
      breakingChanges.push(`New required field: ${field}`);
    }
  }

  // Check for changed validation rules (warnings)
  for (const field of Object.keys(newProps)) {
    if (currentProps[field] && newProps[field]) {
      const currentField = currentProps[field];
      const newField = newProps[field];

      // Check min/max changes
      if (
        currentField.minimum !== newField.minimum ||
        currentField.maximum !== newField.maximum
      ) {
        warnings.push(`Changed validation rules for field: ${field}`);
      }

      // Check format changes
      if (currentField.format !== newField.format) {
        warnings.push(`Changed format for field: ${field}`);
      }
    }
  }

  return {
    hasBreakingChanges: breakingChanges.length > 0,
    breakingChanges,
    warnings,
  };
}

function isValidSemver(version: string): boolean {
  const semverRegex =
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
  return semverRegex.test(version);
}
