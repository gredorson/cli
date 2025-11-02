import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { promises as fs } from "fs";
import path from "path";

interface AddVersionOptions {
  manifestPath?: string;
  basedOn?: string;
  force?: boolean;
}

interface GraphManifest {
  graphType: string;
  baseType: string;
  companyId: string;
  name: string;
  graphVersion: string;
  title: string;
  description: string;
  author?: string;
  status: "development" | "beta" | "stable" | "deprecated";
  visibility: "public" | "private";
  releaseDate?: string;
  configSchema?: any;
  changelog?: Array<{
    version: string;
    date: string;
    changes: string[];
  }>;
}

export const addVersionCommand = new Command("add-version")
  .description("Add a new version to an existing graph")
  .option(
    "-m, --manifest <path>",
    "Path to existing manifest file",
    "./graph.manifest.json"
  )
  .option(
    "-b, --based-on <version>",
    "Base the new version on specific existing version"
  )
  .option("-f, --force", "Overwrite existing files")
  .action(async (options: AddVersionOptions) => {
    try {
      await addVersion(options);
    } catch (error) {
      console.error(chalk.red("✗ Failed to add version:"), error);
      process.exit(1);
    }
  });

async function addVersion(options: AddVersionOptions): Promise<void> {
  console.log(chalk.bold("🔄 Adding new version to existing graph...\n"));

  const manifestPath = path.resolve(
    options.manifestPath || "./graph.manifest.json"
  );

  // Load existing manifest
  const spinner = ora("Loading existing manifest...").start();
  let currentManifest: GraphManifest;

  try {
    const manifestContent = await fs.readFile(manifestPath, "utf-8");
    currentManifest = JSON.parse(manifestContent);
    spinner.succeed("Manifest loaded successfully");
  } catch (error) {
    spinner.fail("Failed to load manifest");
    throw new Error(`Could not load manifest at ${manifestPath}: ${error}`);
  }

  // Show current graph info
  console.log(chalk.bold("Current Graph:"));
  console.log(chalk.dim("  Base Type:"), currentManifest.baseType);
  console.log(chalk.dim("  Current Version:"), currentManifest.graphVersion);
  console.log(chalk.dim("  Title:"), currentManifest.title);
  console.log(chalk.dim("  Status:"), currentManifest.status);

  // Collect new version information
  const versionAnswers = await inquirer.prompt([
    {
      type: "input",
      name: "newVersion",
      message: "New version number:",
      validate: (input: string) => {
        const semverRegex = /^(\d+)\.(\d+)\.(\d+)$/;
        if (!semverRegex.test(input)) {
          return 'Version must follow semantic versioning (e.g., "1.1.0")';
        }

        // Simple version comparison
        const currentParts = currentManifest.graphVersion
          .split(".")
          .map(Number);
        const newParts = input.split(".").map(Number);

        for (let i = 0; i < 3; i++) {
          if (newParts[i] > currentParts[i]) {
            return true; // New version is higher
          } else if (newParts[i] < currentParts[i]) {
            return "New version must be higher than current version";
          }
        }
        return "New version must be higher than current version";
      },
    },
    {
      type: "input",
      name: "title",
      message: "Version title (optional):",
      default: (answers: any) =>
        `${currentManifest.title} v${answers.newVersion}`,
    },
    {
      type: "input",
      name: "description",
      message: "What's new in this version:",
      validate: (input: string) =>
        input.length >= 10 || "Description must be at least 10 characters",
    },
    {
      type: "checkbox",
      name: "changes",
      message: "What type of changes does this version include:",
      choices: [
        { name: "New features", value: "features" },
        { name: "Bug fixes", value: "bugfixes" },
        { name: "Performance improvements", value: "performance" },
        { name: "Breaking changes", value: "breaking" },
        { name: "Documentation updates", value: "docs" },
        { name: "Dependency updates", value: "deps" },
      ],
    },
    {
      type: "input",
      name: "customChanges",
      message: "Additional changelog entries (comma-separated):",
    },
  ]);

  // Determine version type for builder class name
  const { versionType } = await inquirer.prompt([
    {
      type: "list",
      name: "versionType",
      message: "How should this version be implemented:",
      choices: [
        {
          name: "🔄 Copy existing builder (recommended for incremental changes)",
          value: "copy",
        },
        {
          name: "🆕 Create new builder from scratch",
          value: "new",
        },
        {
          name: "🔀 Extend existing builder (inheritance)",
          value: "extend",
        },
      ],
    },
  ]);

  // Generate new files
  const newGraphType = `${currentManifest.baseType}::${versionAnswers.newVersion}`;
  const className = toPascalCase(currentManifest.name);
  const versionSuffix = `V${versionAnswers.newVersion.replace(/\./g, "")}`;
  const newBuilderClass = `${className}${versionSuffix}Builder`;

  spinner.start("Creating new version files...");

  try {
    // Create new builder file
    await createNewBuilder(
      currentManifest,
      versionAnswers,
      newGraphType,
      newBuilderClass,
      versionType,
      options.force || false
    );

    // Update main module
    await updateMainModule(currentManifest, versionAnswers, newBuilderClass);

    // Create new manifest
    await createNewManifest(
      currentManifest,
      versionAnswers,
      newGraphType,
      manifestPath
    );

    // Update package.json version
    await updatePackageVersion(versionAnswers.newVersion);

    spinner.succeed("New version created successfully!");

    // Show summary
    console.log(chalk.green("\n✓ Version added successfully!"));
    console.log(chalk.bold("\nGenerated/Updated files:"));
    console.log(
      chalk.dim(
        `  🧩 src/${kebabCase(currentManifest.name)}-${kebabCase(versionSuffix)}.builder.ts`
      )
    );
    console.log(chalk.dim("  🏗️  src/main.module.ts (updated)"));
    console.log(chalk.dim("  📄 graph.manifest.json (updated)"));
    console.log(chalk.dim("  📦 package.json (version updated)"));

    console.log(chalk.bold("\nNext steps:"));
    console.log(chalk.dim("  1. Implement the new version logic"));
    console.log(chalk.dim("  2. yarn build"));
    console.log(chalk.dim("  3. Test the new version"));
    console.log(chalk.dim("  4. flutch graph register ./graph.manifest.json"));
    console.log(
      chalk.dim(
        `  5. flutch graph publish ${newGraphType} --status development`
      )
    );
  } catch (error) {
    spinner.fail("Failed to create new version");
    throw error;
  }
}

async function createNewBuilder(
  currentManifest: GraphManifest,
  versionAnswers: any,
  newGraphType: string,
  newBuilderClass: string,
  versionType: string,
  force: boolean
): Promise<void> {
  const className = toPascalCase(currentManifest.name);
  const currentBuilderFile = `src/${kebabCase(currentManifest.name)}.builder.ts`;
  const newBuilderFile = `src/${kebabCase(currentManifest.name)}-${kebabCase(versionAnswers.newVersion.replace(/\./g, ""))}.builder.ts`;

  let builderContent: string;

  if (versionType === "copy") {
    // Copy existing builder and modify it
    try {
      const existingContent = await fs.readFile(currentBuilderFile, "utf-8");
      builderContent = existingContent
        .replace(
          new RegExp(`class ${className}Builder`, "g"),
          `class ${newBuilderClass}`
        )
        .replace(
          new RegExp(`readonly graphType = '[^']*'`, "g"),
          `readonly graphType = '${newGraphType}'`
        )
        .replace(
          /\/\/ TODO: Implement .* logic/g,
          `// TODO: Implement v${versionAnswers.newVersion} logic\n    // ${versionAnswers.description}`
        );
    } catch {
      builderContent = generateNewBuilderContent(
        newGraphType,
        newBuilderClass,
        className,
        versionAnswers
      );
    }
  } else if (versionType === "extend") {
    builderContent = generateExtendedBuilderContent(
      newGraphType,
      newBuilderClass,
      className,
      versionAnswers
    );
  } else {
    builderContent = generateNewBuilderContent(
      newGraphType,
      newBuilderClass,
      className,
      versionAnswers
    );
  }

  // Check if file exists
  try {
    await fs.access(newBuilderFile);
    if (!force) {
      const { overwrite } = await inquirer.prompt([
        {
          type: "confirm",
          name: "overwrite",
          message: `Builder file already exists. Overwrite?`,
          default: false,
        },
      ]);
      if (!overwrite) {
        throw new Error("Builder file already exists");
      }
    }
  } catch {
    // File doesn't exist, which is fine
  }

  await fs.writeFile(newBuilderFile, builderContent);
}

function generateNewBuilderContent(
  graphType: string,
  builderClass: string,
  baseClassName: string,
  versionAnswers: any
): string {
  return `import { Injectable } from '@nestjs/common';
import { AbstractGraphBuilder } from '@amelie/graph-services';
import { StateGraph, START, END } from 'langgraph';
import { BaseMessage } from '@langchain/core/messages';

export interface ${baseClassName}State {
  messages: BaseMessage[];
  // Add your custom state properties here
}

@Injectable()
export class ${builderClass} extends AbstractGraphBuilder<string> {
  readonly graphType = '${graphType}' as const;

  async buildGraph(payload: any): Promise<any> {
    // TODO: Implement v${versionAnswers.newVersion} logic
    // ${versionAnswers.description}
    
    const workflow = new StateGraph<${baseClassName}State>({
      channels: {
        messages: {
          reducer: (prev: BaseMessage[], next: BaseMessage[]) => [...prev, ...next],
          default: () => [],
        },
      },
    });

    // Add your nodes here
    workflow.addNode('start', async (state: ${baseClassName}State) => {
      console.log('Starting ${graphType}');
      return state;
    });

    // Set up the flow
    workflow.addEdge(START, 'start');
    workflow.addEdge('start', END);

    return workflow.compile();
  }
}
`;
}

function generateExtendedBuilderContent(
  graphType: string,
  builderClass: string,
  baseClassName: string,
  versionAnswers: any
): string {
  return `import { Injectable } from '@nestjs/common';
import { ${baseClassName}Builder } from './${kebabCase(baseClassName)}.builder';

@Injectable()
export class ${builderClass} extends ${baseClassName}Builder {
  readonly graphType = '${graphType}' as const;

  async buildGraph(payload: any): Promise<any> {
    // TODO: Implement v${versionAnswers.newVersion} logic
    // ${versionAnswers.description}
    
    // Call parent implementation and extend it
    const baseGraph = await super.buildGraph(payload);
    
    // Add your modifications here
    
    return baseGraph;
  }
}
`;
}

async function updateMainModule(
  currentManifest: GraphManifest,
  versionAnswers: any,
  newBuilderClass: string
): Promise<void> {
  const mainModulePath = "src/main.module.ts";

  try {
    const content = await fs.readFile(mainModulePath, "utf-8");

    // Add import for new builder
    const newImportLine = `import { ${newBuilderClass} } from './${kebabCase(currentManifest.name)}-${kebabCase(versionAnswers.newVersion.replace(/\./g, ""))}.builder';`;
    const updatedImports = content.replace(
      /(import { .* } from '.*)';/,
      `$1';\n${newImportLine}`
    );

    // Add new version to versioning array
    const newVersionConfig = `            {
              version: '${versionAnswers.newVersion}',
              builderClass: ${newBuilderClass},
              isDefault: true,
            },`;

    const updatedContent = updatedImports.replace(
      /(versions: \[[\s\S]*?)(\s+\],)/,
      (match, before, after) => {
        // Set previous versions to not default
        const updatedBefore = before.replace(
          /isDefault: true/g,
          "isDefault: false"
        );
        return `${updatedBefore}${newVersionConfig}${after}`;
      }
    );

    // Add new builder to providers
    const updatedProviders = updatedContent.replace(
      /(providers: \[[^\]]*)/,
      `$1, ${newBuilderClass}`
    );

    await fs.writeFile(mainModulePath, updatedProviders);
  } catch (error) {
    console.warn(
      chalk.yellow(
        "⚠ Could not update main.module.ts automatically. Please update it manually."
      )
    );
  }
}

async function createNewManifest(
  currentManifest: GraphManifest,
  versionAnswers: any,
  newGraphType: string,
  originalPath: string
): Promise<void> {
  // Create changelog entry
  const changelogEntries = [];

  if (versionAnswers.changes.includes("features"))
    changelogEntries.push("Added new features");
  if (versionAnswers.changes.includes("bugfixes"))
    changelogEntries.push("Fixed bugs");
  if (versionAnswers.changes.includes("performance"))
    changelogEntries.push("Performance improvements");
  if (versionAnswers.changes.includes("breaking"))
    changelogEntries.push("Breaking changes");
  if (versionAnswers.changes.includes("docs"))
    changelogEntries.push("Documentation updates");
  if (versionAnswers.changes.includes("deps"))
    changelogEntries.push("Dependency updates");

  if (versionAnswers.customChanges) {
    const customEntries = versionAnswers.customChanges
      .split(",")
      .map((entry: string) => entry.trim());
    changelogEntries.push(...customEntries);
  }

  const newManifest: GraphManifest = {
    ...currentManifest,
    graphType: newGraphType,
    graphVersion: versionAnswers.newVersion,
    title: versionAnswers.title,
    description: versionAnswers.description,
    status: "development",
    releaseDate: new Date().toISOString(),
    changelog: [
      {
        version: versionAnswers.newVersion,
        date: new Date().toISOString().split("T")[0],
        changes: changelogEntries,
      },
      ...(currentManifest.changelog || []),
    ],
  };

  await fs.writeFile(originalPath, JSON.stringify(newManifest, null, 2));
}

async function updatePackageVersion(newVersion: string): Promise<void> {
  try {
    const packagePath = "package.json";
    const packageContent = await fs.readFile(packagePath, "utf-8");
    const packageJson = JSON.parse(packageContent);

    packageJson.version = newVersion;

    await fs.writeFile(packagePath, JSON.stringify(packageJson, null, 2));
  } catch (error) {
    console.warn(
      chalk.yellow(
        "⚠ Could not update package.json version. Please update it manually."
      )
    );
  }
}

// Helper functions
function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

function kebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}
