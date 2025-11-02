# Flutch CLI

Command-line tool for managing Amelie graph versions and deployments.

## Installation

```bash
npm install -g @amelie/flutch-cli
```

## Quick Start

1. **Initialize configuration:**

```bash
flutch config -i
```

2. **Set environment variables:**

```bash
export FLUTCH_DEV_API_KEY=your_dev_api_key
export FLUTCH_PROD_API_KEY=your_prod_api_key
```

3. **Create a new graph (optional):**

```bash
flutch graph create
```

4. **Register a graph:**

```bash
flutch graph register ./graph.manifest.json
```

## Configuration

Flutch uses a `.flutchrc` configuration file. Add `companySlug` to let CLI auto-build `graphType`/`baseType` from manifests without explicit types:

```json
{
  "environments": {
    "development": {
      "apiUrl": "http://localhost:3000",
      "apiKey": "${FLUTCH_DEV_API_KEY}",
      "companySlug": "acme"
    },
    "staging": {
      "apiUrl": "https://api-staging.amelie.ai",
      "apiKey": "${FLUTCH_STAGING_API_KEY}",
      "companySlug": "acme"
    },
    "production": {
      "apiUrl": "https://api.amelie.ai",
      "apiKey": "${FLUTCH_PROD_API_KEY}",
      "companySlug": "acme"
    }
  },
  "defaultEnvironment": "development"
}
```

Notes:

- If your manifest already includes `graphType`, CLI does not require `companySlug`.
- If `graphType` is missing, CLI derives it as `${companySlug}.${name}::${graphVersion}`.

## Commands

### Configuration Management

#### `flutch config [options]`

Manage CLI configuration.

**Options:**

- `-e, --environment <env>` - Environment to configure (dev, staging, prod)
- `--company-id <id>` - Set company ID for the environment
- `--user-email <email>` - Set user email for the environment
- `-i, --interactive` - Interactive configuration mode

**Examples:**

```bash
# Interactive configuration
flutch config -i

# Set company ID for development
flutch config -e development --company-id 67b344a744b9e7a1c9b7175a

# Set user email for production
flutch config -e production --user-email user@company.com
```

#### `flutch whoami [options]`

Show current user and environment information.

**Options:**

- `-e, --environment <env>` - Show info for specific environment

**Examples:**

```bash
# Show current user info for default environment
flutch whoami

# Show info for specific environment
flutch whoami -e production
```

### Graph Management

#### `flutch graph create [options]`

Create a new versioned graph with base structure.

**Options:**

- `-o, --output <path>` - Output directory for the graph project (default: packages/graphs)
- `-f, --force` - Overwrite existing files

**Example:**

```bash
flutch graph create
```

#### `flutch graph register <manifestPath>`

Register graph(s) from manifest file (supports both unified and legacy formats).

**Options:**

- `-e, --environment <env>` - Environment to use (dev, staging, prod)
- `-k, --api-key <key>` - API key for authentication
- `--dry-run` - Validate manifest without registering
- `-v, --manifest-version <version>` - Register specific version (for unified manifests)
- `-s, --status <status>` - Status to set after registration (development, beta, stable, deprecated)
- `--publish` - Publish to stable status (same as --status stable)
- `--force` - Force registration ignoring breaking changes and safety checks
- `--update` - Update existing graph if it already exists

**Examples:**

```bash
# Register with development status (default)
flutch graph register ./my-graph.manifest.json

# Register and publish to stable
flutch graph register ./my-graph.manifest.json --publish

# Register specific version from unified manifest
flutch graph register ./unified-manifest.json -v 1.2.0 --status beta

# Force registration with update
flutch graph register ./my-graph.manifest.json --force --update
```

#### `flutch graph list [baseType]`

List graphs and their versions.

**Options:**

- `-e, --environment <env>` - Environment to use
- `-s, --status <status>` - Filter by status (development, beta, stable, deprecated)
- `-f, --format <format>` - Output format (table, json)

**Examples:**

```bash
# List all graphs
flutch graph list

# List versions of specific base type
flutch graph list global.simple

# List only stable versions
flutch graph list --status stable

# Output as JSON
flutch graph list --format json
```

#### `flutch graph publish <graphType>`

Update graph status (publish/unpublish).

**Options:**

- `-e, --environment <env>` - Environment to use
- `-s, --status <status>` - New status (development, beta, stable, deprecated)
- `-f, --force` - Skip confirmation prompts

**Examples:**

```bash
# Promote to stable (interactive)
flutch graph publish global.simple::1.2.0

# Set specific status
flutch graph publish global.simple::1.2.0 --status stable

# Force without confirmation
flutch graph publish global.simple::1.2.0 --status deprecated --force
```

#### `flutch graph validate <manifestPath>`

Validate a graph manifest file.

**Options:**

- `-e, --environment <env>` - Environment for API validation
- `--offline` - Skip API validation, only check local structure
- `-v, --verbose` - Show detailed validation information

**Examples:**

```bash
# Full validation with API
flutch graph validate ./graph.manifest.json

# Offline validation only
flutch graph validate ./graph.manifest.json --offline

# Verbose output
flutch graph validate ./graph.manifest.json --verbose
```

#### `flutch graph add-version`

Add a new version to an existing graph.

#### `flutch graph update`

Update an existing graph configuration.

#### `flutch graph deploy`

Deploy a graph to the specified environment.

### Model Catalog Management

#### `flutch model-catalog add-model [options]`

Add a new model to the catalog.

**Options:**

- `-e, --environment <env>` - Environment to use (dev, staging, prod)
- `-k, --api-key <key>` - API key for authentication
- `-i, --interactive` - Interactive mode for entering model details
- `--provider <provider>` - AI model provider (openai, anthropic, etc.)
- `--model-name <name>` - Name of the model
- `--model-type <type>` - Type of model (chat, embedding, rerank, etc.)

**Examples:**

```bash
# Interactive mode
flutch model-catalog add-model -i

# Add model with specific parameters
flutch model-catalog add-model --provider openai --model-name gpt-4 --model-type chat
```

#### `flutch model-catalog list-models [options]`

List models in the catalog.

**Options:**

- `-e, --environment <env>` - Environment to use (dev, staging, prod)
- `-k, --api-key <key>` - API key for authentication
- `--provider <provider>` - Filter by provider
- `--model-type <type>` - Filter by model type
- `--format <format>` - Output format (table, json)

**Examples:**

```bash
# List all models
flutch model-catalog list-models

# List models by provider
flutch model-catalog list-models --provider openai

# List in JSON format
flutch model-catalog list-models --format json
```

## Graph Manifest Format

Example `graph.manifest.json`:

````json
{
  "graphType": "acme.simple::1.2.0",
  "baseType": "acme.simple",
  "companyId": "acme",
  "name": "simple",
  "graphVersion": "1.2.0",
  "title": "Simple Agent v1.2.0",
  "description": "Basic agent for simple Q&A interactions",
  "status": "development",
  "visibility": "public",
  "author": "Amelie Core Team",
  "changelog": [
    "Added streaming support",
    "Improved error handling",
    "Fixed memory optimization"
  ],
  "configSchema": {
    "type": "object",
    "properties": {
      "systemPrompt": {
        "type": "string",
        "default": "You are a helpful assistant"
      },
      "temperature": {
        "type": "number",
        "minimum": 0,
        "maximum": 2,
        "default": 0.7
      }
    },
    "required": ["systemPrompt"]
  }
}

Minimal manifest (CLI will derive missing fields using companySlug):

```json
{
  "name": "simple",
  "graphVersion": "1.2.0",
  "title": "Simple Agent v1.2.0",
  "description": "Basic agent for simple Q&A interactions",
  "configSchema": {
    "type": "object",
    "properties": {
      "systemPrompt": {
        "type": "string",
        "default": "You are a helpful assistant"
      }
    },
    "required": ["systemPrompt"]
  }
}
````

````

## Environment Variables

- `FLUTCH_DEV_API_KEY` - API key for development environment
- `FLUTCH_STAGING_API_KEY` - API key for staging environment
- `FLUTCH_PROD_API_KEY` - API key for production environment

## Exit Codes

- `0` - Success
- `1` - General error
- `2` - Invalid arguments
- `3` - Configuration error
- `4` - API error

## Examples

### Complete workflow for new graph creation and deployment:

```bash
# 1. Create a new graph structure
flutch graph create

# 2. Validate manifest locally
flutch graph validate ./my-graph-v2.manifest.json --offline

# 3. Register in development
flutch graph register ./my-graph-v2.manifest.json --environment development

# 4. Test and promote to beta
flutch graph publish my-company.myGraph::2.0.0 --status beta

# 5. Promote to stable after testing
flutch graph publish my-company.myGraph::2.0.0 --status stable --environment production

# 6. List all versions to verify
flutch graph list my-company.myGraph --environment production
```

### Deprecate old version:

```bash
# Mark old version as deprecated
flutch graph publish my-company.myGraph::1.0.0 --status deprecated

# Verify deprecation
flutch graph list my-company.myGraph --status deprecated
```

### Model catalog workflow:

```bash
# Add a new model interactively
flutch model-catalog add-model -i

# List all models
flutch model-catalog list-models

# List models by specific provider
flutch model-catalog list-models --provider openai --format json
```

### Configuration setup:

```bash
# Initial configuration setup
flutch config -i

# Check current configuration
flutch whoami

# Update specific environment
flutch config -e production --company-id your-company-id --user-email you@company.com
```

## Troubleshooting

### Authentication Issues

- Ensure environment variables are set correctly
- Check API key permissions in the Amelie dashboard
- Verify the correct environment is being used

### Configuration Issues

- Run `flutch config -i` to recreate configuration
- Check `.flutchrc` file format
- Ensure environment variables resolve correctly
- Use `flutch whoami` to verify current configuration

### Manifest Validation Issues

- Use `--verbose` flag for detailed error messages
- Validate offline first with `--offline` flag
- Check the manifest format against the documentation

## Support

For issues and feature requests, please visit the [Amelie GitHub repository](https://github.com/amelie-ai/amelie-monorepo).
````
