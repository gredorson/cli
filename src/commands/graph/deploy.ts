import { Command } from "commander";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

interface DeployOptions {
  strategy?: string;
  image?: string;
  name?: string;
  namespace?: string;
}

export const deployGraphCommand = new Command("deploy")
  .description("Deploy graph service with selected strategy")
  .argument("<graphType>", "Graph type to deploy")
  .option("-s, --strategy <strategy>", "Deployment strategy", "knative")
  .option("-i, --image <image>", "Container image")
  .option("-n, --name <name>", "Service name")
  .option("--namespace <ns>", "Kubernetes namespace", "default")
  .action(async (graphType: string, options: DeployOptions) => {
    try {
      await deployGraph(graphType, options);
    } catch (err: any) {
      console.error(err.message || err);
      process.exit(1);
    }
  });

async function deployGraph(graphType: string, options: DeployOptions) {
  if (options.strategy === "knative") {
    const templatePath = path.resolve(
      process.cwd(),
      "packages/graph-services/graph-service-registry/templates/graph-service.yaml"
    );
    let manifest = fs.readFileSync(templatePath, "utf8");
    const name = options.name || graphType.replace(/[^a-z0-9-]/gi, "-");
    const image = options.image || `ghcr.io/amelie/${graphType}:latest`;
    manifest = manifest
      .replace(/{{name}}/g, name)
      .replace(/{{namespace}}/g, options.namespace || "default")
      .replace(/{{image}}/g, image)
      .replace(/{{graphType}}/g, graphType);
    const tempFile = path.join(process.cwd(), `${name}-knative.yaml`);
    fs.writeFileSync(tempFile, manifest);
    try {
      execSync(`kubectl apply -f ${tempFile}`, { stdio: "inherit" });
    } finally {
      fs.unlinkSync(tempFile);
    }
    return;
  }
  throw new Error(`Unsupported strategy: ${options.strategy}`);
}
