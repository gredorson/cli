import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";

export const testCommand = new Command("test")
  .description("Send test message through platform to local graph")
  .argument("<message>", "Test message to send")
  .option("--thread-id <id>", "Continue existing conversation")
  .option("--endpoint <url>", "Override local graph endpoint (default: http://localhost:3100)")
  .option("--open-console", "Open console UI in browser after test")
  .option("--stream", "Stream response in real-time")
  .action(async (message: string, options: {
    threadId?: string;
    endpoint?: string;
    openConsole?: boolean;
    stream?: boolean;
  }) => {
    const endpoint = options.endpoint || "http://localhost:3100";

    console.log(chalk.dim(`Testing with message: "${message}"`));
    console.log(chalk.dim(`Endpoint: ${endpoint}`));
    if (options.threadId) {
      console.log(chalk.dim(`Thread ID: ${options.threadId}`));
    }
    console.log();

    const spinner1 = ora("Sending to platform...").start();
    await new Promise(resolve => setTimeout(resolve, 500));
    spinner1.succeed("Sent to platform");

    const spinner2 = ora("Calling local graph...").start();
    await new Promise(resolve => setTimeout(resolve, 1000));
    spinner2.succeed("Local graph responded");

    const spinner3 = ora("Uploading trace to platform...").start();
    await new Promise(resolve => setTimeout(resolve, 500));
    spinner3.succeed("Trace uploaded");

    console.log();
    console.log(chalk.bold("Response:"));
    console.log("Hello! I'm doing well, thank you for asking. How can I help you today?");
    console.log();

    console.log(chalk.bold("Metadata:"));
    console.log(`  Thread ID: ${options.threadId || "thread_abc123"}`);
    console.log("  Tokens: 45");
    console.log("  Duration: 1.2s");
    console.log("  Nodes executed: router → tools → generate");
    console.log();

    console.log(chalk.blue("View full trace: https://console.flutch.ai/traces/trace_xyz789"));

    if (options.openConsole) {
      console.log();
      console.log(chalk.dim("Opening console in browser..."));
    }

    console.log();
    console.log(chalk.yellow("ℹ Note: This is a placeholder response. Full implementation coming soon."));
  });
