/**
 * Simple Graph Template
 * Basic template for creating a simple conversational graph
 */

export const simpleGraphTemplate = {
  // Main module template
  module: `import { Module } from '@nestjs/common';
import { UniversalGraphModule, GraphEngineType } from '@amelie/graph-services';
import { {{className}}Builder } from './{{builderFile}}';

@Module({
  imports: [
    UniversalGraphModule.forRoot({
      engineType: GraphEngineType.LANGGRAPH,
      versioning: [
        {
          baseGraphType: '{{baseType}}',
          defaultVersionStrategy: 'latest',
          versions: [
            {
              version: '{{version}}',
              builderClass: {{className}}Builder,
              isDefault: true,
            },
          ],
        },
      ],
    }),
  ],
  providers: [{{className}}Builder],
  exports: [{{className}}Builder],
})
export class {{className}}Module {}
`,

  // Graph builder template
  builder: `import { Injectable } from '@nestjs/common';
import { AbstractGraphBuilder } from '@amelie/graph-services';
import { StateGraph, START, END } from 'langgraph';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

export interface {{className}}State {
  messages: BaseMessage[];
  userInput?: string;
  response?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class {{className}}Builder extends AbstractGraphBuilder<string> {
  readonly graphType = '{{graphType}}' as const;

  async buildGraph(payload: any): Promise<any> {
    const workflow = new StateGraph<{{className}}State>({
      channels: {
        messages: {
          reducer: (prev: BaseMessage[], next: BaseMessage[]) => [...prev, ...next],
          default: () => [],
        },
        userInput: {
          reducer: (prev: string | undefined, next: string) => next,
          default: () => undefined,
        },
        response: {
          reducer: (prev: string | undefined, next: string) => next,
          default: () => undefined,
        },
        metadata: {
          reducer: (prev: Record<string, any> = {}, next: Record<string, any>) => ({ ...prev, ...next }),
          default: () => ({}),
        },
      },
    });

    // Add nodes
    workflow.addNode('processInput', this.processInputNode);
    workflow.addNode('generateResponse', this.generateResponseNode);
    workflow.addNode('formatOutput', this.formatOutputNode);

    // Set up edges
    workflow.addEdge(START, 'processInput');
    workflow.addEdge('processInput', 'generateResponse');
    workflow.addEdge('generateResponse', 'formatOutput');
    workflow.addEdge('formatOutput', END);

    return workflow.compile();
  }

  private async processInputNode(state: {{className}}State): Promise<Partial<{{className}}State>> {
    // Extract user input from the last message
    const lastMessage = state.messages[state.messages.length - 1];
    const userInput = lastMessage?.content as string || '';

    return {
      userInput,
      metadata: {
        ...state.metadata,
        processedAt: new Date().toISOString(),
      },
    };
  }

  private async generateResponseNode(state: {{className}}State): Promise<Partial<{{className}}State>> {
    // Simple response generation logic
    // TODO: Replace with actual LLM integration
    const response = \`Hello! You said: "\${state.userInput}". This is a simple response from {{graphType}}.\`;

    return {
      response,
      metadata: {
        ...state.metadata,
        responseGeneratedAt: new Date().toISOString(),
      },
    };
  }

  private async formatOutputNode(state: {{className}}State): Promise<Partial<{{className}}State>> {
    const aiMessage = new AIMessage(state.response || '');

    return {
      messages: [aiMessage],
      metadata: {
        ...state.metadata,
        completedAt: new Date().toISOString(),
      },
    };
  }
}
`,

  // Package.json template
  packageJson: `{
  "name": "@amelie/graph-{{graphName}}",
  "version": "{{version}}",
  "description": "{{description}}",
  "main": "dist/main.module.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/main.module.js",
    "typecheck": "tsc --noEmit"
  },
  "keywords": ["amelie", "graph", "ai", "{{baseType}}"],
  "author": "{{author}}",
  "license": "MIT",
  "dependencies": {
    "@amelie/graph-services": "workspace:*",
    "@amelie/shared-types": "workspace:*",
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@langchain/core": "^0.1.0",
    "langgraph": "^0.0.26",
    "reflect-metadata": "^0.1.13",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}`,

  // TypeScript config template
  tsConfig: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}`,

  // Dockerfile template
  dockerfile: `FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN yarn build

# Expose port
EXPOSE 3000

# Start the service
CMD ["yarn", "start"]
`,

  // README template
  readme: `# {{title}}

{{description}}

## Graph Information

- **Base Type**: \`{{baseType}}\`
- **Graph Type**: \`{{graphType}}\`
- **Version**: {{version}}
- **Status**: Development

## Quick Start

\`\`\`bash
# Install dependencies
yarn install

# Build the project
yarn build

# Start development mode
yarn dev
\`\`\`

## Registration

Register this graph with the Amelie platform:

\`\`\`bash
flutch graph register ./graph.manifest.json
\`\`\`

## Usage

Use this graph in the Amelie platform:

\`\`\`typescript
{
  graphType: "{{graphType}}",
  config: {
    temperature: 0.7,
    maxTokens: 1000
  }
}
\`\`\`

## Configuration

This graph accepts the following configuration options:

- \`temperature\` (number): Controls response randomness (0-2, default: 0.7)
- \`maxTokens\` (number): Maximum tokens to generate (1-4000, default: 1000)

## Graph Flow

1. **Process Input**: Extract and validate user input
2. **Generate Response**: Create AI response based on input
3. **Format Output**: Structure the response for output

## Development

### Adding New Nodes

To add new nodes to the graph:

1. Create a new node method in the builder class
2. Add the node to the workflow in \`buildGraph()\`
3. Connect it with appropriate edges

### Testing

Run tests to ensure your graph works correctly:

\`\`\`bash
yarn test
\`\`\`

### Publishing

When ready to publish:

\`\`\`bash
# Update status to beta
flutch graph publish {{graphType}} --status beta

# When stable
flutch graph publish {{graphType}} --status stable
\`\`\`

## Architecture

This graph follows the Amelie versioned graph architecture:

- Uses LangGraph for workflow orchestration
- Implements AbstractGraphBuilder for consistency
- Supports versioning through UniversalGraphModule
- Includes proper TypeScript typing

## Author

{{author}}
`,

  // Manifest template
  manifest: `{
  "graphType": "{{graphType}}",
  "baseType": "{{baseType}}",
  "companyId": "{{companyId}}",
  "name": "{{graphName}}",
  "graphVersion": "{{version}}",
  "title": "{{title}}",
  "description": "{{description}}",
  "author": "{{author}}",
  "status": "development",
  "visibility": "private",
  "releaseDate": "{{releaseDate}}",
  "configSchema": {
    "type": "object",
    "properties": {
      "temperature": {
        "type": "number",
        "minimum": 0,
        "maximum": 2,
        "default": 0.7,
        "description": "Controls randomness in responses"
      },
      "maxTokens": {
        "type": "integer",
        "minimum": 1,
        "maximum": 4000,
        "default": 1000,
        "description": "Maximum number of tokens to generate"
      }
    },
    "required": ["temperature"]
  },
  "changelog": [
    {
      "version": "{{version}}",
      "date": "{{releaseDate}}",
      "changes": ["Initial version", "Basic graph structure implemented"]
    }
  ]
}`,
};
