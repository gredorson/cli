import { Command } from "commander";
import { addModelCommand } from "./add-model";
import { listModelsCommand } from "./list-models";

export const modelCatalogCommands = new Command("model-catalog")
  .description("Manage AI model catalog")
  .addCommand(addModelCommand)
  .addCommand(listModelsCommand);
