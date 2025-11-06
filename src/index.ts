#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { graphCommands } from "./commands/graph";
import { modelCatalogCommands } from "./commands/model-catalog";
import { toolsCatalogCommand } from "./commands/tools-catalog";
import { configCommand, whoamiCommand } from "./commands/config";
import { loginCommand, logoutCommand } from "./commands/auth";

const program = new Command();

program
  .name("flutch")
  .description("CLI tool for managing Flutch graph versions and deployments")
  .version("0.0.1")
  .option(
    "-c, --config <path>",
    "Path to config file (default: ~/.flutch/config.json)"
  )
  .option(
    "-e, --environment <env>",
    "Environment to use (overrides config file)"
  );

// Add graph management commands
program.addCommand(graphCommands);

// Add model catalog management commands
program.addCommand(modelCatalogCommands);

// Add tools catalog management commands
program.addCommand(toolsCatalogCommand);

// Add configuration commands
program.addCommand(configCommand);
program.addCommand(whoamiCommand);

// Add authentication commands
program.addCommand(loginCommand);
program.addCommand(logoutCommand);

// Parse command line arguments
try {
  program.parse();
} catch (error) {
  // Suppress commander's exitOverride errors for help/version
  if (error instanceof Error && !error.message.includes("outputHelp")) {
    console.error(chalk.red("\n✗ Error:"), error.message);
    process.exit(1);
  }
}
