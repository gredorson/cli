import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { ApiClient, FlutchConfig } from "../../api/client";
import { ConfigManager } from "../../config/config";
import inquirer from "inquirer";

interface AddModelOptions {
  environment?: string;
  apiKey?: string;
  interactive?: boolean;
}

interface ModelData {
  provider: string;
  modelName: string;
  modelType: string;
  companyId: string;
  siteName: string;
  visibility: string;
  requiresApiKey: boolean;
  isActive: boolean;
  pricing: {
    pricingType: string;
    inputTokensCost?: number;
    outputTokensCost?: number;
    requestCost?: number;
    minuteCost?: number;
    imageCost?: number;
    minCost: number;
    baseInput: number;
    baseOutput: number;
  };
  defaultTemperature?: number;
  defaultMaxTokens?: number;
  // Rerank model fields
  maxDocuments?: number;
  supportedLanguages?: string[];
  maxQueryLength?: number;
  // Embedding model fields
  dimensions?: number;
}

export const addModelCommand = new Command("add-model")
  .description("Add a new model to the catalog")
  .option("-e, --environment <env>", "Environment to use (dev, staging, prod)")
  .option("-k, --api-key <key>", "API key for authentication")
  .option("-i, --interactive", "Interactive mode for entering model details")
  .option(
    "--provider <provider>",
    "Model provider (openai, anthropic, cohere, etc.)"
  )
  .option("--model-name <name>", "Model name (e.g., gpt-4-turbo)")
  .option("--model-type <type>", "Model type (chat, rerank, embedding)")
  .option("--company-id <id>", "Company ID that owns this model")
  .option("--site-name <name>", "Site name (flutch, agentech)", "flutch")
  .option(
    "--visibility <level>",
    "Visibility level (public, private, corporate)",
    "public"
  )
  .option("--requires-api-key", "Model requires API key", false)
  .option("--active", "Model is active", true)
  .option(
    "--pricing-type <type>",
    "Pricing model type (token, request, minute, image)",
    "token"
  )
  .option(
    "--input-cost <cost>",
    "Cost per 1000 input tokens (for token-based)",
    parseFloat
  )
  .option(
    "--output-cost <cost>",
    "Cost per 1000 output tokens (for token-based)",
    parseFloat
  )
  .option(
    "--request-cost <cost>",
    "Cost per request (for request-based)",
    parseFloat
  )
  .option(
    "--minute-cost <cost>",
    "Cost per minute (for time-based)",
    parseFloat
  )
  .option(
    "--image-cost <cost>",
    "Cost per image (for image models)",
    parseFloat
  )
  .option("--min-cost <cost>", "Minimum cost per API call", parseFloat, 0.0001)
  .option("--temperature <temp>", "Default temperature (0-2)", parseFloat)
  .option("--max-tokens <tokens>", "Default max tokens", parseInt)
  .option("--dimensions <dims>", "Vector dimensions (for embeddings)", parseInt)
  .option("--max-documents <docs>", "Max documents (for rerank)", parseInt)
  .option(
    "--supported-languages <langs>",
    "Comma-separated languages (for rerank)"
  )
  .addHelpText(
    "after",
    `
Examples:
  # Interactive mode
  flutch model-catalog add-model -i

  # Add OpenAI model
  flutch model-catalog add-model \\
    --provider openai \\
    --model-name gpt-4-turbo \\
    --model-type chat \\
    --company-id 507f1f77bcf86cd799439011 \\
    --input-cost 0.01 \\
    --output-cost 0.03 \\
    --temperature 0.7 \\
    --max-tokens 4096

  # Add Cohere rerank model (request-based pricing)
  flutch model-catalog add-model \\
    --provider cohere \\
    --model-name rerank-multilingual-v3.0 \\
    --model-type rerank \\
    --pricing-type request \\
    --request-cost 0.002 \\
    --max-documents 1000 \\
    --supported-languages en,fr,es,de,ru

  # Add embedding model
  flutch model-catalog add-model \\
    --provider openai \\
    --model-name text-embedding-ada-002 \\
    --model-type embedding \\
    --company-id 507f1f77bcf86cd799439011 \\
    --input-cost 0.0001 \\
    --output-cost 0 \\
    --dimensions 1536
`
  )
  .action(async (options: AddModelOptions) => {
    try {
      await addModel(options);
    } catch (error) {
      console.error(chalk.red("✗ Failed to add model:"), error);
      process.exit(1);
    }
  });

async function addModel(options: AddModelOptions): Promise<void> {
  // Load configuration first to get default company ID
  const configManager = new ConfigManager();
  const config = configManager.getEnvironmentConfig(options.environment);

  // Override API key if provided
  if (options.apiKey) {
    config.apiKey = options.apiKey;
  }

  let modelData: ModelData;

  if (options.interactive) {
    modelData = await getModelDataInteractive(config);
  } else {
    modelData = getModelDataFromOptions(options, config);
    validateModelData(modelData);
  }

  const spinner = ora("Adding model to catalog...").start();

  try {
    const apiClient = new ApiClient(config);

    // Add model to catalog
    const result = await apiClient.addModelToCatalog(modelData);

    spinner.succeed("Model added successfully");

    console.log(chalk.green("✓ Model added to catalog"));
    console.log(chalk.dim("  Model ID:"), result.id);
    console.log(chalk.dim("  Provider:"), result.provider);
    console.log(chalk.dim("  Model Name:"), result.modelName);
    console.log(chalk.dim("  Type:"), result.modelType);
    console.log(chalk.dim("  Company ID:"), result.companyId);
    console.log(chalk.dim("  Visibility:"), result.visibility);
    console.log(chalk.dim("  Active:"), result.isActive);
    console.log(chalk.dim("  Environment:"), config.environment);
  } catch (error) {
    spinner.fail("Failed to add model");
    throw error;
  }
}

async function getModelDataInteractive(
  config: FlutchConfig
): Promise<ModelData> {
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "provider",
      message: "Select model provider:",
      choices: [
        "openai",
        "anthropic",
        "google",
        "cohere",
        "voyage",
        "azure",
        "bedrock",
        "custom",
      ],
    },
    {
      type: "input",
      name: "modelName",
      message: "Enter model name (e.g., gpt-4-turbo):",
      validate: input => input.length > 0 || "Model name is required",
    },
    {
      type: "list",
      name: "modelType",
      message: "Select model type:",
      choices: ["chat", "rerank", "embedding", "image", "speech"],
    },
    {
      type: "input",
      name: "companyId",
      message: "Enter company ID:",
      default: config.companyId,
      validate: input => input.length > 0 || "Company ID is required",
    },
    {
      type: "list",
      name: "siteName",
      message: "Select site name:",
      choices: ["flutch", "agentech"],
      default: "flutch",
    },
    {
      type: "list",
      name: "visibility",
      message: "Select visibility level:",
      choices: ["public", "private", "corporate"],
      default: "public",
    },
    {
      type: "confirm",
      name: "requiresApiKey",
      message: "Does this model require an API key?",
      default: true,
    },
    {
      type: "confirm",
      name: "isActive",
      message: "Is this model active?",
      default: true,
    },
    {
      type: "list",
      name: "pricingType",
      message: "Select pricing model type:",
      choices: [
        {
          name: "Token-based (per 1000 tokens) - for chat, embedding",
          value: "token",
        },
        { name: "Request-based (per request) - for rerank", value: "request" },
        { name: "Time-based (per minute) - for speech", value: "minute" },
        { name: "Image-based (per image) - for image models", value: "image" },
      ],
      default: "token",
    },
    {
      type: "number",
      name: "minCost",
      message: "Minimum cost per API call:",
      default: 0.0001,
      validate: input => input >= 0 || "Cost must be non-negative",
    },
  ]);

  // Additional pricing fields based on pricing type
  if (answers.pricingType === "token") {
    const tokenPricing = await inquirer.prompt([
      {
        type: "number",
        name: "inputCost",
        message: "Cost per 1000 input tokens:",
        default: 0.001,
        validate: input => input >= 0 || "Cost must be non-negative",
      },
      {
        type: "number",
        name: "outputCost",
        message: "Cost per 1000 output tokens:",
        default: 0.002,
        validate: input => input >= 0 || "Cost must be non-negative",
      },
    ]);
    Object.assign(answers, tokenPricing);
  } else if (answers.pricingType === "request") {
    const requestPricing = await inquirer.prompt([
      {
        type: "number",
        name: "requestCost",
        message: "Cost per request/query:",
        default: 0.00005,
        validate: input => input >= 0 || "Cost must be non-negative",
      },
    ]);
    Object.assign(answers, requestPricing);
  } else if (answers.pricingType === "minute") {
    const minutePricing = await inquirer.prompt([
      {
        type: "number",
        name: "minuteCost",
        message: "Cost per minute:",
        default: 0.006,
        validate: input => input >= 0 || "Cost must be non-negative",
      },
    ]);
    Object.assign(answers, minutePricing);
  } else if (answers.pricingType === "image") {
    const imagePricing = await inquirer.prompt([
      {
        type: "number",
        name: "imageCost",
        message: "Cost per image:",
        default: 0.04,
        validate: input => input >= 0 || "Cost must be non-negative",
      },
    ]);
    Object.assign(answers, imagePricing);
  }

  // Additional fields based on model type
  if (answers.modelType === "chat") {
    const chatFields = await inquirer.prompt([
      {
        type: "number",
        name: "defaultTemperature",
        message: "Default temperature (0-2):",
        default: 0.7,
        validate: input =>
          (input >= 0 && input <= 2) || "Temperature must be between 0 and 2",
      },
      {
        type: "number",
        name: "defaultMaxTokens",
        message: "Default max tokens:",
        default: 4096,
        validate: input => input > 0 || "Max tokens must be positive",
      },
    ]);
    Object.assign(answers, chatFields);
  } else if (answers.modelType === "rerank") {
    const rerankFields = await inquirer.prompt([
      {
        type: "number",
        name: "maxDocuments",
        message: "Maximum documents for reranking:",
        default: 1000,
        validate: input => input > 0 || "Max documents must be positive",
      },
      {
        type: "input",
        name: "supportedLanguages",
        message: "Supported languages (comma-separated, e.g., en,fr,es):",
        default: "en",
        filter: input => input.split(",").map((lang: string) => lang.trim()),
      },
    ]);
    Object.assign(answers, rerankFields);
  } else if (answers.modelType === "embedding") {
    const embeddingFields = await inquirer.prompt([
      {
        type: "number",
        name: "dimensions",
        message: "Vector dimensions:",
        default: 1536,
        validate: input => input > 0 || "Dimensions must be positive",
      },
    ]);
    Object.assign(answers, embeddingFields);
  }

  return {
    provider: answers.provider,
    modelName: answers.modelName,
    modelType: answers.modelType,
    companyId: answers.companyId,
    siteName: answers.siteName,
    visibility: answers.visibility,
    requiresApiKey: answers.requiresApiKey,
    isActive: answers.isActive,
    pricing: {
      pricingType: answers.pricingType,
      inputTokensCost: answers.inputCost,
      outputTokensCost: answers.outputCost,
      requestCost: answers.requestCost,
      minuteCost: answers.minuteCost,
      imageCost: answers.imageCost,
      minCost: answers.minCost,
      baseInput:
        answers.inputCost || (answers.pricingType === "token" ? 0 : undefined),
      baseOutput:
        answers.outputCost || (answers.pricingType === "token" ? 0 : undefined),
    },
    defaultTemperature: answers.defaultTemperature,
    defaultMaxTokens: answers.defaultMaxTokens,
    maxDocuments: answers.maxDocuments,
    supportedLanguages: answers.supportedLanguages,
    dimensions: answers.dimensions,
  };
}

function getModelDataFromOptions(
  options: any,
  config: FlutchConfig
): ModelData {
  return {
    provider: options.provider,
    modelName: options.modelName,
    modelType: options.modelType,
    companyId: options.companyId || config.companyId || "default",
    siteName: options.siteName || "flutch",
    visibility: options.visibility || "public",
    requiresApiKey: options.requiresApiKey || false,
    isActive: options.active !== false,
    pricing: {
      pricingType: options.pricingType || "token",
      inputTokensCost: options.inputCost,
      outputTokensCost: options.outputCost,
      requestCost: options.requestCost,
      minuteCost: options.minuteCost,
      imageCost: options.imageCost,
      minCost: options.minCost || 0.0001,
      baseInput:
        options.inputCost ||
        ((options.pricingType || "token") === "token" ? 0 : undefined),
      baseOutput:
        options.outputCost ||
        ((options.pricingType || "token") === "token" ? 0 : undefined),
    },
    defaultTemperature: options.temperature,
    defaultMaxTokens: options.maxTokens,
    maxDocuments: options.maxDocuments,
    supportedLanguages: options.supportedLanguages
      ? options.supportedLanguages.split(",").map((s: string) => s.trim())
      : undefined,
    dimensions: options.dimensions,
  };
}

function validateModelData(data: ModelData): void {
  const required = ["provider", "modelName", "modelType", "companyId"];
  const missing = required.filter(field => !data[field as keyof ModelData]);

  if (missing.length > 0) {
    console.error(chalk.red("✗ Missing required fields:"));
    missing.forEach(field => {
      console.error(
        chalk.red(`  --${field.replace(/([A-Z])/g, "-$1").toLowerCase()}`)
      );
    });
    process.exit(1);
  }

  // Validate model type
  const validTypes = ["chat", "rerank", "embedding", "image", "speech"];
  if (!validTypes.includes(data.modelType)) {
    console.error(
      chalk.red(
        `✗ Invalid model type "${data.modelType}". Must be one of: ${validTypes.join(", ")}`
      )
    );
    process.exit(1);
  }

  // Validate visibility - convert to lowercase for API
  const validVisibility = ["public", "private", "corporate"];
  const visibility = data.visibility.toLowerCase();
  if (!validVisibility.includes(visibility)) {
    console.error(
      chalk.red(
        `✗ Invalid visibility "${data.visibility}". Must be one of: ${validVisibility.join(", ")}`
      )
    );
    process.exit(1);
  }
  data.visibility = visibility;
}
