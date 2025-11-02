/**
 * Advanced Graph Template
 * Complex template with multiple nodes, conditional logic, and tool integration
 */

export const advancedGraphTemplate = {
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

  // Advanced graph builder template
  builder: `import { Injectable } from '@nestjs/common';
import { AbstractGraphBuilder } from '@amelie/graph-services';
import { StateGraph, START, END } from 'langgraph';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

export interface {{className}}State {
  messages: BaseMessage[];
  userInput?: string;
  intent?: string;
  entities?: Record<string, any>;
  context?: Record<string, any>;
  toolCalls?: Array<{
    name: string;
    args: Record<string, any>;
    result?: any;
  }>;
  response?: string;
  confidence?: number;
  requiresHuman?: boolean;
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
        intent: {
          reducer: (prev: string | undefined, next: string) => next,
          default: () => undefined,
        },
        entities: {
          reducer: (prev: Record<string, any> = {}, next: Record<string, any>) => ({ ...prev, ...next }),
          default: () => ({}),
        },
        context: {
          reducer: (prev: Record<string, any> = {}, next: Record<string, any>) => ({ ...prev, ...next }),
          default: () => ({}),
        },
        toolCalls: {
          reducer: (prev: any[] = [], next: any[]) => [...prev, ...next],
          default: () => [],
        },
        response: {
          reducer: (prev: string | undefined, next: string) => next,
          default: () => undefined,
        },
        confidence: {
          reducer: (prev: number = 0, next: number) => next,
          default: () => 0,
        },
        requiresHuman: {
          reducer: (prev: boolean = false, next: boolean) => next,
          default: () => false,
        },
        metadata: {
          reducer: (prev: Record<string, any> = {}, next: Record<string, any>) => ({ ...prev, ...next }),
          default: () => ({}),
        },
      },
    });

    // Add nodes
    workflow.addNode('analyzeInput', this.analyzeInputNode);
    workflow.addNode('intentClassification', this.intentClassificationNode);
    workflow.addNode('entityExtraction', this.entityExtractionNode);
    workflow.addNode('contextRetrieval', this.contextRetrievalNode);
    workflow.addNode('toolSelection', this.toolSelectionNode);
    workflow.addNode('toolExecution', this.toolExecutionNode);
    workflow.addNode('responseGeneration', this.responseGenerationNode);
    workflow.addNode('confidenceCheck', this.confidenceCheckNode);
    workflow.addNode('humanEscalation', this.humanEscalationNode);
    workflow.addNode('formatOutput', this.formatOutputNode);

    // Set up conditional routing
    workflow.addEdge(START, 'analyzeInput');
    workflow.addEdge('analyzeInput', 'intentClassification');
    workflow.addEdge('intentClassification', 'entityExtraction');
    workflow.addEdge('entityExtraction', 'contextRetrieval');
    workflow.addEdge('contextRetrieval', 'toolSelection');
    
    // Conditional routing based on tool requirements
    workflow.addConditionalEdges(
      'toolSelection',
      this.shouldUseTool,
      {
        useTool: 'toolExecution',
        skipTool: 'responseGeneration',
      }
    );
    
    workflow.addEdge('toolExecution', 'responseGeneration');
    workflow.addEdge('responseGeneration', 'confidenceCheck');
    
    // Conditional routing based on confidence
    workflow.addConditionalEdges(
      'confidenceCheck',
      this.shouldEscalateToHuman,
      {
        escalate: 'humanEscalation',
        proceed: 'formatOutput',
      }
    );
    
    workflow.addEdge('humanEscalation', 'formatOutput');
    workflow.addEdge('formatOutput', END);

    return workflow.compile();
  }

  private async analyzeInputNode(state: {{className}}State): Promise<Partial<{{className}}State>> {
    const lastMessage = state.messages[state.messages.length - 1];
    const userInput = lastMessage?.content as string || '';

    return {
      userInput,
      metadata: {
        ...state.metadata,
        analyzedAt: new Date().toISOString(),
        inputLength: userInput.length,
      },
    };
  }

  private async intentClassificationNode(state: {{className}}State): Promise<Partial<{{className}}State>> {
    // TODO: Implement actual intent classification logic
    const intent = this.classifyIntent(state.userInput || '');
    const confidence = this.calculateIntentConfidence(intent, state.userInput || '');

    return {
      intent,
      confidence,
      metadata: {
        ...state.metadata,
        intentClassifiedAt: new Date().toISOString(),
      },
    };
  }

  private async entityExtractionNode(state: {{className}}State): Promise<Partial<{{className}}State>> {
    // TODO: Implement entity extraction logic
    const entities = this.extractEntities(state.userInput || '');

    return {
      entities,
      metadata: {
        ...state.metadata,
        entitiesExtractedAt: new Date().toISOString(),
        entityCount: Object.keys(entities).length,
      },
    };
  }

  private async contextRetrievalNode(state: {{className}}State): Promise<Partial<{{className}}State>> {
    // TODO: Implement context retrieval from knowledge base
    const context = await this.retrieveContext(state.intent, state.entities);

    return {
      context,
      metadata: {
        ...state.metadata,
        contextRetrievedAt: new Date().toISOString(),
      },
    };
  }

  private async toolSelectionNode(state: {{className}}State): Promise<Partial<{{className}}State>> {
    // TODO: Implement tool selection logic based on intent and entities
    const selectedTools = this.selectTools(state.intent, state.entities);

    return {
      toolCalls: selectedTools.map(tool => ({ name: tool.name, args: tool.args })),
      metadata: {
        ...state.metadata,
        toolsSelectedAt: new Date().toISOString(),
        selectedToolCount: selectedTools.length,
      },
    };
  }

  private async toolExecutionNode(state: {{className}}State): Promise<Partial<{{className}}State>> {
    // TODO: Implement actual tool execution
    const executedCalls = await Promise.all(
      state.toolCalls?.map(async (call) => ({
        ...call,
        result: await this.executeTool(call.name, call.args),
      })) || []
    );

    return {
      toolCalls: executedCalls,
      metadata: {
        ...state.metadata,
        toolsExecutedAt: new Date().toISOString(),
      },
    };
  }

  private async responseGenerationNode(state: {{className}}State): Promise<Partial<{{className}}State>> {
    // TODO: Implement response generation using LLM
    const response = await this.generateResponse(state);
    const confidence = this.calculateResponseConfidence(response, state);

    return {
      response,
      confidence,
      metadata: {
        ...state.metadata,
        responseGeneratedAt: new Date().toISOString(),
      },
    };
  }

  private async confidenceCheckNode(state: {{className}}State): Promise<Partial<{{className}}State>> {
    const requiresHuman = (state.confidence || 0) < 0.7; // Threshold for human escalation

    return {
      requiresHuman,
      metadata: {
        ...state.metadata,
        confidenceCheckedAt: new Date().toISOString(),
      },
    };
  }

  private async humanEscalationNode(state: {{className}}State): Promise<Partial<{{className}}State>> {
    // TODO: Implement human escalation logic
    const escalationResponse = \`I need human assistance to properly answer your question: "\${state.userInput}". A human agent will be with you shortly.\`;

    return {
      response: escalationResponse,
      metadata: {
        ...state.metadata,
        escalatedAt: new Date().toISOString(),
        escalationReason: 'Low confidence score',
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
        finalConfidence: state.confidence,
      },
    };
  }

  // Helper methods for conditional routing
  private shouldUseTool(state: {{className}}State): string {
    return (state.toolCalls?.length || 0) > 0 ? 'useTool' : 'skipTool';
  }

  private shouldEscalateToHuman(state: {{className}}State): string {
    return state.requiresHuman ? 'escalate' : 'proceed';
  }

  // TODO: Implement these helper methods
  private classifyIntent(input: string): string {
    // Simple intent classification - replace with actual ML model
    if (input.toLowerCase().includes('help')) return 'help_request';
    if (input.toLowerCase().includes('book')) return 'booking';
    if (input.toLowerCase().includes('cancel')) return 'cancellation';
    return 'general_inquiry';
  }

  private calculateIntentConfidence(intent: string, input: string): number {
    // Simple confidence calculation - replace with actual ML model
    return Math.random() * 0.4 + 0.6; // Mock confidence between 0.6-1.0
  }

  private extractEntities(input: string): Record<string, any> {
    // Simple entity extraction - replace with actual NER model
    const entities: Record<string, any> = {};
    
    // Extract dates
    const dateMatch = input.match(/\\d{1,2}\/\\d{1,2}\/\\d{4}/);
    if (dateMatch) entities.date = dateMatch[0];
    
    // Extract times
    const timeMatch = input.match(/\\d{1,2}:\\d{2}/);
    if (timeMatch) entities.time = timeMatch[0];
    
    return entities;
  }

  private async retrieveContext(intent?: string, entities?: Record<string, any>): Promise<Record<string, any>> {
    // TODO: Implement context retrieval from knowledge base
    return {
      relevantDocuments: [],
      userHistory: [],
      domainKnowledge: {},
    };
  }

  private selectTools(intent?: string, entities?: Record<string, any>): Array<{ name: string; args: Record<string, any> }> {
    // TODO: Implement tool selection logic
    const tools: Array<{ name: string; args: Record<string, any> }> = [];
    
    if (intent === 'booking') {
      tools.push({ name: 'calendar_check', args: { date: entities?.date, time: entities?.time } });
    }
    
    return tools;
  }

  private async executeTool(toolName: string, args: Record<string, any>): Promise<any> {
    // TODO: Implement actual tool execution
    switch (toolName) {
      case 'calendar_check':
        return { available: true, slots: ['10:00', '14:00', '16:00'] };
      default:
        return { error: \`Unknown tool: \${toolName}\` };
    }
  }

  private async generateResponse(state: {{className}}State): Promise<string> {
    // TODO: Replace with actual LLM integration
    const context = JSON.stringify(state.context);
    const toolResults = state.toolCalls?.map(call => call.result).join(', ') || 'none';
    
    return \`Based on your request ("\${state.userInput}"), intent (\${state.intent}), and available information, here's my response. Tool results: \${toolResults}\`;
  }

  private calculateResponseConfidence(response: string, state: {{className}}State): number {
    // TODO: Implement response confidence calculation
    let confidence = state.confidence || 0.5;
    
    // Boost confidence if tools were used successfully
    if (state.toolCalls?.some(call => call.result && !call.result.error)) {
      confidence += 0.2;
    }
    
    // Reduce confidence for short responses
    if (response.length < 50) {
      confidence -= 0.1;
    }
    
    return Math.min(1.0, Math.max(0.0, confidence));
  }
}
`,

  // Package.json - same as simple template
  packageJson: `{
  "name": "@amelie/graph-{{graphName}}",
  "version": "{{version}}",
  "description": "{{description}}",
  "main": "dist/main.module.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/main.module.js",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "keywords": ["amelie", "graph", "ai", "{{baseType}}", "advanced"],
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
    "@types/jest": "^29.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "typescript": "^5.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}`,

  // Enhanced manifest with more configuration options
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
      },
      "confidenceThreshold": {
        "type": "number",
        "minimum": 0,
        "maximum": 1,
        "default": 0.7,
        "description": "Minimum confidence score before escalating to human"
      },
      "enableTools": {
        "type": "boolean",
        "default": true,
        "description": "Enable tool usage in the graph"
      },
      "maxToolCalls": {
        "type": "integer",
        "minimum": 0,
        "maximum": 10,
        "default": 3,
        "description": "Maximum number of tool calls per conversation"
      },
      "contextSize": {
        "type": "integer",
        "minimum": 100,
        "maximum": 8000,
        "default": 2000,
        "description": "Maximum context size for retrieval"
      }
    },
    "required": ["temperature", "confidenceThreshold"]
  },
  "changelog": [
    {
      "version": "{{version}}",
      "date": "{{releaseDate}}",
      "changes": [
        "Initial advanced graph implementation",
        "Intent classification and entity extraction",
        "Tool integration support",
        "Confidence-based human escalation",
        "Context retrieval system"
      ]
    }
  ]
}`,
};
