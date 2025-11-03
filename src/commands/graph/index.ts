import { Command } from "commander";
import { registerGraphCommand } from "./register";
import { registerUnifiedCommand } from "./register-unified";
import { listGraphsCommand } from "./list";
import { publishGraphCommand } from "./publish";
import { validateGraphCommand } from "./validate";
import { validateUnifiedCommand } from "./validate-unified";
import { createGraphCommand } from "./create";
import { addVersionCommand } from "./add-version";
import { deployGraphCommand } from "./deploy";
import { updateGraphCommand } from "./update";
import { infoCommand } from "./info";
import { testCommand } from "./test";

export const graphCommands = new Command("graph")
  .description("Manage graph versions and deployments")
  .addCommand(createGraphCommand)
  .addCommand(addVersionCommand)
  .addCommand(registerUnifiedCommand.name("register").alias("reg"))
  .addCommand(registerGraphCommand.name("register-legacy").alias("reg-legacy"))
  .addCommand(updateGraphCommand)
  .addCommand(listGraphsCommand)
  .addCommand(infoCommand)
  .addCommand(publishGraphCommand)
  .addCommand(validateUnifiedCommand.name("validate").alias("val"))
  .addCommand(validateGraphCommand.name("validate-legacy").alias("val-legacy"))
  .addCommand(deployGraphCommand)
  .addCommand(testCommand);
