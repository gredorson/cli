import { Command } from "commander";
import { registerToolsCommand } from "./register-tools";
import { addToolCommand } from "./add-tool";
import { listToolsCommand } from "./list-tools";

export const toolsCatalogCommand = new Command("tools-catalog")
  .description("Manage tools in the catalog")
  .addCommand(registerToolsCommand)
  .addCommand(addToolCommand)
  .addCommand(listToolsCommand);
