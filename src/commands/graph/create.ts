import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { ConfigManager } from "../../config/config";
import { promises as fs } from "fs";
import path from "path";

interface NodeDefinition {
  name: string;
  description: string;
  inputs: string[];
  outputs: string[];
}

interface CreateOptions {
  output?: string;
  force?: boolean;
}

export const createGraphCommand = new Command("create")
  .description("Create a new versioned graph with base structure")
  .option(
    "-o, --output <path>",
    "Output directory for the graph project",
    "packages/graphs"
  )
  .option("-f, --force", "Overwrite existing files")
  .action(async (options: CreateOptions) => {
    try {
      await createGraph(options);
    } catch (error) {
      console.error(chalk.red("✗ Failed to create graph:"), error);
      process.exit(1);
    }
  });

async function createGraph(options: CreateOptions): Promise<void> {
  console.log(chalk.bold("🚀 Creating new versioned graph...\n"));

  // Load companySlug from CLI config
  const cfgManager = new ConfigManager();
  const cfg = cfgManager.getEnvironmentConfig();
  const companySlug = (cfg as any).companySlug as string | undefined;
  if (!companySlug) {
    console.error(
      chalk.red(
        "✗ companySlug is not set in CLI config. Run 'flutch config -i' to set it."
      )
    );
    process.exit(1);
  }

  // Collect basic graph information
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "graphName",
      message: 'Graph name (kebab-case, e.g., "simple-chat", "support-rag"):',
      validate: (input: string) => {
        if (!/^[a-z][a-z0-9-]*$/.test(input)) {
          return "Graph name must be kebab-case (lowercase letters, numbers, hyphens). Examples: support, support-rag, custom-chat";
        }
        if (input.length < 2) {
          return "Graph name must be at least 2 characters long";
        }
        return true;
      },
    },
    {
      type: "input",
      name: "title",
      message: "Graph title (human-readable):",
      validate: (input: string) =>
        input.length >= 3 || "Title must be at least 3 characters",
    },
    {
      type: "input",
      name: "description",
      message: "Graph description:",
      validate: (input: string) =>
        input.length >= 10 || "Description must be at least 10 characters",
    },
    {
      type: "input",
      name: "version",
      message: "Initial version:",
      default: "1.0.0",
      validate: (input: string) => {
        const semverRegex = /^(\d+)\.(\d+)\.(\d+)$/;
        if (!semverRegex.test(input)) {
          return 'Version must follow semantic versioning (e.g., "1.0.0")';
        }
        return true;
      },
    },
    {
      type: "input",
      name: "author",
      message: "Author name:",
      default: "Amelie Team",
    },
    {
      type: "confirm",
      name: "useKnowledgeBase",
      message: "Does this graph need knowledge base search?",
      default: false,
    },
  ]);

  // Generate derived values
  const baseType = `${companySlug}.${answers.graphName}`;
  const graphType = `${baseType}::${answers.version}`;
  const className = toPascalCase(answers.graphName);
  const outputDir = path.resolve(options.output!, answers.graphName);

  // Check if directory exists
  try {
    await fs.access(outputDir);
    if (!options.force) {
      const { overwrite } = await inquirer.prompt([
        {
          type: "confirm",
          name: "overwrite",
          message: `Directory "${outputDir}" already exists. Overwrite?`,
          default: false,
        },
      ]);
      if (!overwrite) {
        console.log(chalk.yellow("Operation cancelled"));
        return;
      }
    }
  } catch {
    // Directory doesn't exist, which is fine
  }

  const spinner = ora("Creating graph structure...").start();

  try {
    // Create directory structure
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(path.join(outputDir, "src"), { recursive: true });
    await fs.mkdir(path.join(outputDir, "src", "nodes"), { recursive: true });

    // Generate all files
    await generatePackageJson(outputDir, answers);
    await generateTsConfig(outputDir);
    await generateDockerfile(outputDir);
    await generateManifest(outputDir, answers, graphType, baseType);
    await generateModule(
      outputDir,
      answers,
      className,
      graphType,
      baseType,
      companySlug
    );
    await generateBuilder(
      outputDir,
      answers,
      className,
      graphType,
      baseType,
      companySlug
    );
    await generateMainFile(outputDir, answers, className);
    await generateReadme(outputDir, answers);
    await generateStateFile(outputDir, answers, className);
    await generateTypesFile(outputDir, answers, className);
    await generateTokensFile(outputDir, answers, className);
    await generateExampleNode(outputDir, answers, className);

    spinner.succeed("Graph structure created successfully!");

    // Show summary
    console.log(chalk.green("\n✓ Graph created successfully!"));
    console.log(chalk.bold("\nGenerated files:"));
    console.log(chalk.dim("  📦 package.json"));
    console.log(chalk.dim("  🔧 tsconfig.json"));
    console.log(chalk.dim("  🐳 Dockerfile"));
    console.log(chalk.dim("  📄 graph.manifest.json"));
    console.log(chalk.dim("  📚 README.md"));
    console.log(chalk.dim("  🏗️  src/main.module.ts"));
    console.log(
      chalk.dim(`  🧩 src/${kebabCase(answers.graphName)}.builder.ts`)
    );
    console.log(chalk.dim("  🚀 src/main.ts"));
    console.log(chalk.dim("  🔗 src/state.model.ts"));
    console.log(chalk.dim("  🏷️  src/types.ts"));
    console.log(chalk.dim("  🔑 src/tokens.ts"));
    console.log(chalk.dim("  🌐 src/nodes/example.node.ts"));

    console.log(chalk.bold("\nNext steps:"));
    console.log(chalk.dim(`  1. cd ${answers.graphName}`));
    console.log(chalk.dim("  2. yarn install"));
    console.log(
      chalk.dim("  3. Implement your graph logic in the builder file")
    );
    console.log(chalk.dim("  4. yarn build"));
    console.log(chalk.dim("  5. flutch graph register ./graph.manifest.json"));
  } catch (error) {
    spinner.fail("Failed to create graph structure");
    throw error;
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

// File generation functions
async function generatePackageJson(
  outputDir: string,
  answers: any
): Promise<void> {
  const packageJson = {
    name: `@amelie/graph-${answers.graphName}`,
    version: answers.version,
    description: answers.description,
    main: "dist/main.js",
    scripts: {
      build: "nest build",
      dev: "nest start --watch",
      start: "node dist/main.js",
      clean: "rimraf dist",
      lint: 'eslint "{src,apps,libs,test}/**/*.ts" --fix',
      typecheck: "tsc --noEmit",
    },
    keywords: ["amelie", "graph", "ai", answers.graphName],
    author: answers.author,
    license: "MIT",
    dependencies: {
      "@flutchai/flutch-sdk": "workspace:*",
      "@amelie/graph-utils": "workspace:*",
      "@amelie/shared-types": "workspace:*",
      "@langchain/core": "^0.3.23",
      "@langchain/langgraph": "^0.2.34",
      "@langchain/langgraph-checkpoint-mongodb": "^0.0.3",
      "@langchain/openai": "^0.3.14",
      "@nestjs/axios": "^3.1.2",
      "@nestjs/common": "^10.4.12",
      "@nestjs/core": "^10.4.12",
      "@nestjs/platform-express": "^10.4.12",
      axios: "^1.7.2",
      mongoose: "^8.4.3",
      "reflect-metadata": "^0.2.2",
      rxjs: "^7.8.1",
      zod: "^3.23.8",
    },
    devDependencies: {
      "@nestjs/cli": "^10.4.2",
      "@types/express": "^4.17.21",
      "@types/node": "^20.14.9",
      "@typescript-eslint/eslint-plugin": "^7.14.1",
      "@typescript-eslint/parser": "^7.14.1",
      eslint: "^8.57.0",
      "eslint-config-prettier": "^9.1.0",
      "eslint-plugin-prettier": "^5.1.3",
      prettier: "^3.3.2",
      rimraf: "^5.0.7",
      "ts-loader": "^9.5.1",
      "ts-node": "^10.9.2",
      "tsconfig-paths": "^4.2.0",
      typescript: "^5.5.2",
    },
  };

  await fs.writeFile(
    path.join(outputDir, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );
}

async function generateTsConfig(outputDir: string): Promise<void> {
  const tsConfig = {
    compilerOptions: {
      module: "commonjs",
      declaration: true,
      removeComments: true,
      emitDecoratorMetadata: true,
      experimentalDecorators: true,
      allowSyntheticDefaultImports: true,
      target: "ES2021",
      sourceMap: true,
      outDir: "./dist",
      baseUrl: "./",
      incremental: true,
      skipLibCheck: true,
      strictNullChecks: false,
      noImplicitAny: false,
      strictBindCallApply: false,
      forceConsistentCasingInFileNames: false,
      noFallthroughCasesInSwitch: false,
      resolveJsonModule: true,
      esModuleInterop: true,
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"],
  };

  await fs.writeFile(
    path.join(outputDir, "tsconfig.json"),
    JSON.stringify(tsConfig, null, 2)
  );
}

async function generateDockerfile(outputDir: string): Promise<void> {
  const dockerfile = `FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY dist ./dist

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "dist/main.js"]
`;

  await fs.writeFile(path.join(outputDir, "Dockerfile"), dockerfile);
}

async function generateManifest(
  outputDir: string,
  answers: any,
  graphType: string,
  baseType: string
): Promise<void> {
  const manifest = {
    graphType,
    baseType,
    companyId: answers.companyId,
    name: answers.graphName,
    graphVersion: answers.version,
    title: answers.title,
    description: answers.description,
    author: answers.author,
    status: "development",
    visibility: "private",
    releaseDate: new Date().toISOString().split("T")[0],
    configSchema: {
      type: "object",
      properties: {
        systemPrompt: {
          type: "string",
          title: "System Prompt",
          description: "System prompt for the AI model",
          default: "You are a helpful AI assistant.",
        },
        modelSettings: {
          type: "object",
          title: "Model Settings",
          properties: {
            modelId: {
              type: "string",
              title: "Model ID",
              description: "The AI model to use",
            },
            temperature: {
              type: "number",
              title: "Temperature",
              description: "Controls randomness in responses",
              minimum: 0,
              maximum: 2,
              default: 0.7,
            },
            maxTokens: {
              type: "integer",
              title: "Max Tokens",
              description: "Maximum number of tokens to generate",
              minimum: 1,
              maximum: 8000,
              default: 1000,
            },
          },
          required: ["modelId"],
        },
        ...(answers.useKnowledgeBase
          ? {
              knowledgeBaseIds: {
                type: "array",
                title: "Knowledge Base IDs",
                description: "Array of knowledge base IDs to search in",
                items: {
                  type: "string",
                },
                default: ["default"],
              },
              searchType: {
                type: "string",
                title: "Search Type",
                description: "Type of search algorithm to use",
                enum: ["MMR", "similarity", "hybrid"],
                default: "MMR",
              },
              maxDocuments: {
                type: "integer",
                title: "Max Documents",
                description: "Maximum number of documents to retrieve",
                minimum: 1,
                maximum: 50,
                default: 10,
              },
            }
          : {}),
        recursionLimit: {
          type: "integer",
          title: "Recursion Limit",
          description: "Maximum recursion depth for the graph",
          minimum: 1,
          maximum: 100,
          default: 25,
        },
      },
      required: ["systemPrompt", "modelSettings"],
    },
    tags: ["custom", answers.graphName],
    category: "custom",
  };

  await fs.writeFile(
    path.join(outputDir, "graph.manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
}

async function generateModule(
  outputDir: string,
  answers: any,
  className: string,
  graphType: string,
  baseType: string,
  companySlug: string
): Promise<void> {
  const moduleContent = `import { Module } from '@nestjs/common';
import { UniversalGraphModule, GraphEngineType } from '@amelie/graph-services';
import { HttpModule } from '@nestjs/axios';
import mongoose, { Connection } from 'mongoose';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { ${className}Builder } from './${kebabCase(answers.graphName)}.builder';
import { 
  LLMInitializer${answers.useKnowledgeBase ? ", \n  RetrieverService" : ""} 
} from '@amelie/graph-utils';

@Module({
  imports: [
    HttpModule,
    UniversalGraphModule.forRoot({
      engineType: GraphEngineType.LANGGRAPH,
      versioning: [
        {
          baseGraphType: '${companySlug}.${answers.graphName}',
          defaultVersionStrategy: 'latest',
          versions: [
            {
              version: '${answers.version}',
              builderClass: ${className}Builder,
              isDefault: true,
            },
          ],
        },
      ],
    }),
  ],
  providers: [
    LLMInitializer,
    ${className}Builder,
    {
      provide: 'GRAPH_DB_CONNECTION',
      useFactory: async (): Promise<Connection> => {
        const graphDbUri = process.env.GRAPH_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/${answers.graphName}-graph';
        return mongoose.createConnection(graphDbUri);
      },
    },
    {
      provide: 'MONGO_CLIENT',
      useFactory: async (connection: Connection) => {
        return connection.getClient();
      },
      inject: ['GRAPH_DB_CONNECTION'],
    },
    {
      provide: 'CHECKPOINTER',
      useFactory: (mongoClient: any) =>
        new MongoDBSaver({
          client: mongoClient,
          dbName: '${answers.graphName}-graph',
          checkpointCollectionName: 'checkpoints',
          checkpointWritesCollectionName: 'checkpoint_writes',
        }),
      inject: ['MONGO_CLIENT'],
    },${
      answers.useKnowledgeBase
        ? `
    {
      provide: 'RETRIEVER',
      useFactory: () => new RetrieverService(),
    },`
        : ""
    }
  ],
  exports: [${className}Builder],
})
export class ${className}Module {}
`;

  await fs.writeFile(
    path.join(outputDir, "src", "main.module.ts"),
    moduleContent
  );
}

async function generateBuilder(
  outputDir: string,
  answers: any,
  className: string,
  graphType: string,
  baseType: string,
  companySlug: string
): Promise<void> {
  const builderContent = `import { Injectable, Inject, Logger } from '@nestjs/common';
import { AbstractGraphBuilder } from '@amelie/graph-services';
import { IGraphRequestPayload } from '@flutchai/flutch-sdk';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { StateGraph, START, END } from '@langchain/langgraph';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { LLMInitializer${answers.useKnowledgeBase ? ", RetrieverService" : ""} } from '@amelie/graph-utils';
import { ${className}State } from './state.model';
import { 
  ${className}StateValues, 
  ${className}ConfigValues, 
  ${className}InputValues 
} from './types';

@Injectable()
export class ${className}Builder extends AbstractGraphBuilder<'${answers.version}'> {
  private readonly logger = new Logger(${className}Builder.name);
  readonly version = '${answers.version}' as const;

  constructor(
    @Inject('CHECKPOINTER')
    private readonly checkpointer: MongoDBSaver,
    @Inject(LLMInitializer)
    private readonly llmInitializer: LLMInitializer${answers.useKnowledgeBase ? ",\n    @Inject('RETRIEVER')\n    private readonly retrieverService: RetrieverService" : ""}
  ) {
    super();
  }

  async buildGraph(_payload?: any): Promise<any> {
    this.logger.debug('Building ${className} graph v${answers.version}');

    // TODO: Implement your graph structure here
    const workflow = new StateGraph<
      ${className}InputValues,
      ${className}StateValues,
      ${className}ConfigValues
    >(${className}State)
      // TODO: Add your nodes here
      // Example:
      // .addNode('exampleNode', this.exampleNodeFunction.bind(this))
      ;

    ${answers.useKnowledgeBase ? "// RetrieverService is available as this.retrieverService" : "// Knowledge base search is disabled for this graph"}

    // TODO: Define your graph flow here
    // Example:
    // .addEdge(START, 'exampleNode')
    // .addEdge('exampleNode', END);

    return workflow.compile({
      checkpointer: this.checkpointer,
    });
  }

  async prepareConfig(payload: IGraphRequestPayload): Promise<{
    input: any;
    configurable: any;
  }> {
    const settings = payload.graphSettings;

    if (!settings) {
      throw new Error('Settings not found');
    }

    const input = { messages: [payload.message] };

    return {
      input,
      configurable: {
        thread_id: payload.threadId,
        metadata: {
          userId: payload.userId,
          agentId: payload.agentId,
          workflowType: '${companySlug}.${answers.graphName}::${answers.version}',
          version: '${answers.version}',
        },
        graphSettings: settings,
      },
    };
  }

  // TODO: Add your node functions here
  // Example:
  // private async yourNodeFunction(state: any): Promise<any> {
  //   // Implement your node logic here
  //   return {
  //     // Return state updates
  //   };
  // }
}
`;

  await fs.writeFile(
    path.join(outputDir, "src", `${kebabCase(answers.graphName)}.builder.ts`),
    builderContent
  );
}

async function generateMainFile(
  outputDir: string,
  answers: any,
  className: string
): Promise<void> {
  const mainContent = `import { bootstrap } from '@flutchai/flutch-sdk';
import { ${className}Module } from './main.module';

async function startGraphService() {
  const app = await bootstrap(${className}Module, {
    // Полностью автоматическое назначение порта
    // В production Kubernetes назначит порт сам  
    // В локальной разработке система найдет свободный порт
  });

  return app;
}

if (require.main === module) {
  startGraphService().catch(console.error);
}
`;

  await fs.writeFile(path.join(outputDir, "src", "main.ts"), mainContent);
}

async function generateReadme(outputDir: string, answers: any): Promise<void> {
  const readmeContent = `# ${answers.title}

${answers.description}

## Installation

\`\`\`bash
npm install
\`\`\`

## Development

\`\`\`bash
npm run dev
\`\`\`

## Build

\`\`\`bash
npm run build
\`\`\`

## Configuration

The graph accepts the following configuration parameters:

- \`systemPrompt\`: The system prompt for the LLM
- \`modelSettings\`: Model configuration (modelId, temperature, maxTokens)
- \`recursionLimit\`: Maximum recursion depth for the graph

## Implementation

To implement your graph:

1. Open \`src/${kebabCase(answers.graphName)}.builder.ts\`
2. Define your state schema in the \`buildGraph\` method
3. Add your nodes using \`workflow.addNode()\`
4. Define the graph flow using \`workflow.addEdge()\`
5. Implement your node functions

## Author

${answers.author}
`;

  await fs.writeFile(path.join(outputDir, "README.md"), readmeContent);
}

async function generateStateFile(
  outputDir: string,
  answers: any,
  className: string
): Promise<void> {
  const stateContent = `import { Annotation } from "@langchain/langgraph";
import { BaseMessage, AIMessage } from "@langchain/core/messages";
import { messagesStateReducer } from "@langchain/langgraph";
import { UsageRecorder } from "@amelie/graph-utils";

import {
  ${className}Definition,
  ${className}Command,
} from "./types";

/**
 * Определение состояния для ${answers.title}
 */
export const ${className}State = Annotation.Root<${className}Definition>({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  usageRecorder: Annotation<UsageRecorder>({
    reducer: (prev, next) => next ?? prev,
    default: () => new UsageRecorder(),
  }),
  generation: Annotation<AIMessage>(),
  
  // TODO: Add your specific state fields here
  // Example:
  // currentStep: Annotation<string>({
  //   reducer: (prev, next) => next ?? prev,
  //   default: () => "init",
  // }),
  
  next: Annotation<${className}Command>({
    reducer: (_, next) => next,
    default: () => ${className}Command.COMPLETE,
  }),
});
`;

  await fs.writeFile(
    path.join(outputDir, "src", "state.model.ts"),
    stateContent
  );
}

async function generateTypesFile(
  outputDir: string,
  answers: any,
  className: string
): Promise<void> {
  const typesContent = `import { BaseMessage, AIMessage } from "@langchain/core/messages";
import { UsageRecorder } from "@amelie/graph-utils";
import { IGraphParamsBase } from "@amelie/shared-types";
import { 
  BaseChannel, 
  StateDefinition, 
  StateType 
} from "@langchain/langgraph";

type MappedChannels<T> = {
  [K in keyof T]: BaseChannel<T[K], T[K]>;
};

/**
 * Команды для управления потоком графа
 */
export enum ${className}Command {
  COMPLETE = "complete",
  // TODO: Add your specific commands here
  // Example:
  // PROCESS = "process",
  // VALIDATE = "validate",
  // ERROR = "error",
}

/**
 * Входные данные для графа
 */
export interface ${className}Input {
  messages: BaseMessage[];
  
  // TODO: Add your specific input fields here
  // Example:
  // userId: string;
  // sessionId: string;
}

/**
 * Состояние графа
 */
export interface ${className}State {
  messages: BaseMessage[];
  usageRecorder: UsageRecorder;
  generation?: AIMessage;
  
  // TODO: Add your specific state fields here
  // Example:
  // currentStep: string;
  // processingData: any;
  
  next: ${className}Command;
}

/**
 * Конфигурация графа
 */
export interface ${className}Params extends IGraphParamsBase {
  graphType: string; // "${answers.companyId}.${answers.graphName}::${answers.version}"
  
  // TODO: Add your specific configuration fields here
  // Example:
  // systemPrompt: string;
  // processingMode: string;
}

// Типы для LangGraph
export type ${className}ConfigDefinition = StateDefinition & MappedChannels<${className}Params>;
export type ${className}Definition = StateDefinition & MappedChannels<${className}State>;
export type ${className}InputDefinition = StateDefinition & MappedChannels<${className}Input>;

export type ${className}StateValues = StateType<${className}Definition>;
export type ${className}InputValues = StateType<${className}InputDefinition>;
export type ${className}ConfigValues = StateType<${className}ConfigDefinition>;

// Расширение глобального реестра типов
declare global {
  namespace GraphTypes {
    interface Registry {
      "${answers.companyId}.${answers.graphName}": {
        Params: ${className}Params;
        State: ${className}StateValues;
        Config: ${className}ConfigValues;
        Input: ${className}InputValues;
        Definition: ${className}Definition;
        ConfigDefinition: ${className}ConfigDefinition;
        InputDefinition: ${className}InputDefinition;
        StateValues: ${className}StateValues;
        ConfigValues: ${className}ConfigValues;
        InputValues: ${className}InputValues;
        OutputValues: ${className}StateValues;
      };
    }
  }
}

// Делаем файл модулем
export {};
`;

  await fs.writeFile(path.join(outputDir, "src", "types.ts"), typesContent);
}

async function generateTokensFile(
  outputDir: string,
  answers: any,
  className: string
): Promise<void> {
  const tokensContent = `/**
 * Токены для инжекции зависимостей в ${answers.title}
 */
export const ${className}Tokens = {
  // TODO: Add your specific tokens here
  // Example:
  // EXAMPLE_NODE: Symbol('EXAMPLE_NODE'),
  // PROCESSOR_SERVICE: Symbol('PROCESSOR_SERVICE'),
  // VALIDATOR_SERVICE: Symbol('VALIDATOR_SERVICE'),
} as const;
`;

  await fs.writeFile(path.join(outputDir, "src", "tokens.ts"), tokensContent);
}

async function generateExampleNode(
  outputDir: string,
  answers: any,
  className: string
): Promise<void> {
  const nodeContent = `import { Injectable, Logger } from "@nestjs/common";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { 
  LLMInitializer, 
  trackLLMCall, 
  UsageRecorder 
} from "@amelie/graph-utils";

import { 
  ${className}StateValues, 
  ${className}ConfigValues, 
  ${className}Command 
} from "../types";

/**
 * Пример узла для ${answers.title}
 * 
 * ВАЖНО: Если узел должен стриматься в режиме реального времени,
 * его имя должно начинаться с "output_" (например, "output_generate").
 * Проверка: event.metadata.langgraph_node.startsWith("output_")
 */
@Injectable()
export class ExampleNode {
  private readonly logger = new Logger(ExampleNode.name);

  constructor(private readonly llmInitializer: LLMInitializer) {}

  async execute(
    state: ${className}StateValues,
    config: LangGraphRunnableConfig<${className}ConfigValues>
  ): Promise<Partial<${className}StateValues>> {
    this.logger.debug("Executing example node");
    
    // TODO: Implement your node logic here
    
    const lastMessage = state.messages?.[state.messages.length - 1];
    
    if (!lastMessage) {
      return {
        next: ${className}Command.COMPLETE,
      };
    }

    // TODO: Add your processing logic here
    // Example:
    // const result = await this.processMessage(lastMessage, config, state.usageRecorder);
    
    return {
      messages: [
        new AIMessage({
          content: "TODO: Replace with actual response",
        }),
      ],
      next: ${className}Command.COMPLETE,
    };
  }

  // TODO: Add your helper methods here
  // Example:
  // private async processMessage(
  //   message: BaseMessage,
  //   config: LangGraphRunnableConfig<${className}ConfigValues>,
  //   usageRecorder: UsageRecorder
  // ): Promise<string> {
  //   const modelSettings = config.configurable?.graphSettings?.models?.default;
  //   const model = this.llmInitializer.initializeModel(modelSettings);
  //   
  //   const promptTemplate = ChatPromptTemplate.fromTemplate(\`
  //     TODO: Add your prompt template here
  //     
  //     User message: {message}
  //   \`);
  //   
  //   const result = await trackLLMCall(
  //     usageRecorder,
  //     "processMessage",
  //     modelSettings.modelName,
  //     modelSettings.provider,
  //     async () => {
  //       const prompt = await promptTemplate.formatMessages({
  //         message: message.content,
  //       });
  //       const response = await model.invoke(prompt);
  //       return response.content.toString();
  //     }
  //   );
  //   
  //   return result;
  // }
}
`;

  await fs.writeFile(
    path.join(outputDir, "src", "nodes", "example.node.ts"),
    nodeContent
  );
}
