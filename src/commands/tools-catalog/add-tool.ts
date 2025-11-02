import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { ApiClient, FlutchConfig } from "../../api/client";
import { ConfigManager } from "../../config/config";
import inquirer from "inquirer";

interface AddToolOptions {
  environment?: string;
  apiKey?: string;
  interactive?: boolean;
}

interface ToolData {
  toolName: string;
  title: string;
  description: string;
  category: string;
  isActive: boolean;
  configSchema?: any[];
}

export const addToolCommand = new Command("add-tool")
  .description("Add a new tool to the catalog")
  .option("-e, --environment <env>", "Environment to use (dev, staging, prod)")
  .option("-k, --api-key <key>", "API key for authentication")
  .option(
    "-i, --interactive",
    "Interactive mode for entering tool details",
    true
  )
  .option(
    "--tool-name <name>",
    "Tool name (e.g., kb.search, logistics.create_alert)"
  )
  .option("--title <title>", "Tool display title")
  .option("--description <desc>", "Tool description")
  .option(
    "--category <category>",
    "Tool category (knowledge, web, code, communication, data, logistics, custom)"
  )
  .option("--active", "Tool is active", true)
  .option("--inactive", "Tool is inactive")
  .addHelpText(
    "after",
    `
Examples:
  # Interactive mode (default)
  flutch tools-catalog add-tool

  # Add tool with command line options
  flutch tools-catalog add-tool \\
    --tool-name logistics.create_alert \\
    --title "Create Logistics Alert" \\
    --description "Create alert for logistician when driver has issues" \\
    --category logistics \\
    --active

  # Add inactive tool
  flutch tools-catalog add-tool \\
    --tool-name test.tool \\
    --title "Test Tool" \\
    --description "Tool for testing" \\
    --category custom \\
    --inactive
`
  )
  .action(async (options: AddToolOptions) => {
    try {
      await addTool(options);
    } catch (error) {
      console.error(chalk.red("✗ Failed to add tool:"), error);
      process.exit(1);
    }
  });

async function addTool(options: any): Promise<void> {
  // Load configuration first
  const configManager = new ConfigManager();
  const config = configManager.getEnvironmentConfig(options.environment);

  // Override API key if provided
  if (options.apiKey) {
    config.apiKey = options.apiKey;
  }

  let toolData: ToolData;

  // Interactive mode is default unless all required options are provided
  const hasAllOptions =
    options.toolName &&
    options.title &&
    options.description &&
    options.category;

  if (options.interactive || !hasAllOptions) {
    toolData = await getToolDataInteractive();
  } else {
    toolData = getToolDataFromOptions(options);
    validateToolData(toolData);
  }

  const spinner = ora("Adding tool to catalog...").start();

  try {
    const apiClient = new ApiClient(config);

    // Add tool to catalog
    const result = await apiClient.addToolToCatalog(toolData);

    spinner.succeed("Tool added successfully");

    console.log(chalk.green("✓ Tool added to catalog"));
    console.log(chalk.dim("  Tool ID:"), result.id);
    console.log(chalk.dim("  Tool Name:"), result.toolName);
    console.log(chalk.dim("  Title:"), result.title);
    console.log(chalk.dim("  Category:"), result.category);
    console.log(chalk.dim("  Active:"), result.isActive);
    console.log(chalk.dim("  Environment:"), config.environment);
  } catch (error) {
    spinner.fail("Failed to add tool");
    throw error;
  }
}

async function getToolDataInteractive(): Promise<ToolData> {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "toolName",
      message: "Enter tool name (e.g., kb.search, logistics.create_alert):",
      validate: input => {
        if (input.length === 0) return "Tool name is required";
        if (!input.match(/^[a-z0-9._-]+$/i)) {
          return "Tool name can only contain alphanumeric characters, dots, hyphens, and underscores";
        }
        return true;
      },
    },
    {
      type: "input",
      name: "title",
      message: "Enter tool display title:",
      validate: input => input.length > 0 || "Title is required",
    },
    {
      type: "input",
      name: "description",
      message: "Enter tool description:",
      validate: input => input.length > 0 || "Description is required",
    },
    {
      type: "list",
      name: "category",
      message: "Select tool category:",
      choices: [
        {
          name: "Knowledge - KB search, document retrieval",
          value: "knowledge",
        },
        { name: "Web - Web browsing, fetching", value: "web" },
        { name: "Code - Code execution, analysis", value: "code" },
        { name: "Communication - Email, messaging", value: "communication" },
        { name: "Data - Data processing, analysis", value: "data" },
        { name: "Logistics - Driver assistance, tracking", value: "logistics" },
        { name: "Custom - Other category", value: "custom" },
      ],
    },
    {
      type: "confirm",
      name: "isActive",
      message: "Is this tool active?",
      default: true,
    },
  ]);

  return {
    toolName: answers.toolName,
    title: answers.title,
    description: answers.description,
    category: answers.category,
    isActive: answers.isActive,
    configSchema: [],
  };
}

function getToolDataFromOptions(options: any): ToolData {
  return {
    toolName: options.toolName,
    title: options.title,
    description: options.description,
    category: options.category || "custom",
    isActive: options.inactive ? false : options.active !== false,
    configSchema: [],
  };
}

function validateToolData(data: ToolData): void {
  const required = ["toolName", "title", "description", "category"];
  const missing = required.filter(field => !data[field as keyof ToolData]);

  if (missing.length > 0) {
    console.error(chalk.red("✗ Missing required fields:"));
    missing.forEach(field => {
      console.error(
        chalk.red(`  --${field.replace(/([A-Z])/g, "-$1").toLowerCase()}`)
      );
    });
    process.exit(1);
  }

  // Validate tool name format
  if (!data.toolName.match(/^[a-z0-9._-]+$/i)) {
    console.error(
      chalk.red(
        `✗ Invalid tool name "${data.toolName}". Use alphanumeric characters, dots, hyphens, and underscores only.`
      )
    );
    process.exit(1);
  }

  // Validate category
  const validCategories = [
    "knowledge",
    "web",
    "code",
    "communication",
    "data",
    "logistics",
    "custom",
  ];
  if (!validCategories.includes(data.category)) {
    console.warn(
      chalk.yellow(
        `⚠️  Uncommon category "${data.category}". Valid categories: ${validCategories.join(", ")}`
      )
    );
  }
}
