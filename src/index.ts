#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { graphCommands } from "./commands/graph";
import { modelCatalogCommands } from "./commands/model-catalog";
import { toolsCatalogCommand } from "./commands/tools-catalog";
import { configCommand, whoamiCommand } from "./commands/config";

const program = new Command();

program
  .name("flutch")
  .description("CLI tool for managing Amelie graph versions and deployments")
  .version("1.0.0");

// Add graph management commands
program.addCommand(graphCommands);

// Add model catalog management commands
program.addCommand(modelCatalogCommands);

// Add tools catalog management commands
program.addCommand(toolsCatalogCommand);

// Add configuration commands
program.addCommand(configCommand);
program.addCommand(whoamiCommand);

// Global error handling
program.exitOverride();

process.on("uncaughtException", error => {
  console.error(chalk.red("\n✗ Uncaught Exception:"), error.message);
  process.exit(1);
});

process.on("unhandledRejection", reason => {
  console.error(chalk.red("\n✗ Unhandled Rejection:"), reason);
  process.exit(1);
});

// Parse command line arguments
program.parse();
