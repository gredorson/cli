import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { ApiClient } from "../../api/client";
import { ConfigManager } from "../../config/config";
import Table from "cli-table3";

interface ListModelsOptions {
  environment?: string;
  apiKey?: string;
  provider?: string;
  modelType?: string;
  active?: boolean;
  visibility?: string;
  json?: boolean;
}

export const listModelsCommand = new Command("list-models")
  .description("List models in the catalog")
  .option("-e, --environment <env>", "Environment to use (dev, staging, prod)")
  .option("-k, --api-key <key>", "API key for authentication")
  .option(
    "--provider <provider>",
    "Filter by provider (openai, anthropic, cohere, etc.)"
  )
  .option(
    "--model-type <type>",
    "Filter by model type (chat, rerank, embedding)"
  )
  .option("--active", "Show only active models")
  .option("--visibility <level>", "Filter by visibility (PUBLIC, PRIVATE)")
  .option("--json", "Output as JSON")
  .addHelpText(
    "after",
    `
Examples:
  # List all models
  flutch model-catalog list-models

  # List only active chat models
  flutch model-catalog list-models --model-type chat --active

  # List OpenAI models
  flutch model-catalog list-models --provider openai

  # Output as JSON
  flutch model-catalog list-models --json

  # Filter by multiple criteria
  flutch model-catalog list-models --provider cohere --model-type rerank --active
`
  )
  .action(async (options: ListModelsOptions) => {
    try {
      await listModels(options);
    } catch (error) {
      console.error(chalk.red("✗ Failed to list models:"), error);
      process.exit(1);
    }
  });

async function listModels(options: ListModelsOptions): Promise<void> {
  const spinner = ora("Fetching models from catalog...").start();

  try {
    // Load configuration
    const configManager = new ConfigManager();
    const config = configManager.getEnvironmentConfig(options.environment);

    // Override API key if provided
    if (options.apiKey) {
      config.apiKey = options.apiKey;
    }

    const apiClient = new ApiClient(config);

    // Build query parameters
    const queryParams: any = {};
    if (options.provider) queryParams.provider = options.provider;
    if (options.modelType) queryParams.modelType = options.modelType;
    if (options.active !== undefined) queryParams.isActive = options.active;
    if (options.visibility) queryParams.visibility = options.visibility;

    // Fetch models
    const models = await apiClient.listModels(queryParams);

    spinner.succeed(`Found ${models.length} models`);

    if (models.length === 0) {
      console.log(chalk.yellow("No models found matching the criteria"));
      return;
    }

    if (options.json) {
      // Output as JSON
      console.log(JSON.stringify(models, null, 2));
    } else {
      // Output as table
      displayModelsTable(models);
    }

    // Show summary
    console.log(chalk.dim(`\nTotal: ${models.length} models`));
    console.log(chalk.dim(`Environment: ${config.environment}`));
  } catch (error) {
    spinner.fail("Failed to fetch models");
    throw error;
  }
}

function displayModelsTable(models: any[]): void {
  const table = new Table({
    head: [
      chalk.cyan("Provider"),
      chalk.cyan("Model Name"),
      chalk.cyan("Type"),
      chalk.cyan("Active"),
      chalk.cyan("Visibility"),
      chalk.cyan("Input Cost"),
      chalk.cyan("Output Cost"),
      chalk.cyan("Company ID"),
    ],
    colWidths: [12, 30, 10, 8, 10, 12, 12, 26],
    wordWrap: true,
  });

  models.forEach(model => {
    table.push([
      model.provider,
      model.modelName,
      model.modelType,
      model.isActive ? chalk.green("✓") : chalk.red("✗"),
      model.visibility,
      `$${model.pricing.inputTokensCost.toFixed(4)}`,
      `$${model.pricing.outputTokensCost.toFixed(4)}`,
      model.companyId.substring(0, 24) + "...",
    ]);
  });

  console.log(table.toString());

  // Show type-specific details if filtering by type
  const modelTypes = [...new Set(models.map(m => m.modelType))];
  if (modelTypes.length === 1) {
    const modelType = modelTypes[0];

    if (modelType === "chat") {
      console.log(chalk.dim("\nChat Model Details:"));
      const chatTable = new Table({
        head: [
          chalk.cyan("Model Name"),
          chalk.cyan("Temperature"),
          chalk.cyan("Max Tokens"),
        ],
        colWidths: [30, 15, 15],
      });

      models.forEach(model => {
        if (
          model.defaultTemperature !== undefined ||
          model.defaultMaxTokens !== undefined
        ) {
          chatTable.push([
            model.modelName,
            model.defaultTemperature?.toFixed(2) || "N/A",
            model.defaultMaxTokens?.toString() || "N/A",
          ]);
        }
      });

      if (chatTable.length > 0) {
        console.log(chatTable.toString());
      }
    } else if (modelType === "rerank") {
      console.log(chalk.dim("\nRerank Model Details:"));
      const rerankTable = new Table({
        head: [
          chalk.cyan("Model Name"),
          chalk.cyan("Max Documents"),
          chalk.cyan("Languages"),
        ],
        colWidths: [30, 15, 30],
        wordWrap: true,
      });

      models.forEach(model => {
        if (
          model.maxDocuments !== undefined ||
          model.supportedLanguages !== undefined
        ) {
          rerankTable.push([
            model.modelName,
            model.maxDocuments?.toString() || "N/A",
            model.supportedLanguages?.join(", ") || "N/A",
          ]);
        }
      });

      if (rerankTable.length > 0) {
        console.log(rerankTable.toString());
      }
    } else if (modelType === "embedding") {
      console.log(chalk.dim("\nEmbedding Model Details:"));
      const embeddingTable = new Table({
        head: [
          chalk.cyan("Model Name"),
          chalk.cyan("Dimensions"),
          chalk.cyan("Max Input Length"),
        ],
        colWidths: [30, 15, 20],
      });

      models.forEach(model => {
        if (model.dimensions !== undefined) {
          embeddingTable.push([
            model.modelName,
            model.dimensions?.toString() || "N/A",
            model.maxInputLength?.toString() || "N/A",
          ]);
        }
      });

      if (embeddingTable.length > 0) {
        console.log(embeddingTable.toString());
      }
    }
  }
}
