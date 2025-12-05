const core = require("@actions/core");
const https = require("https");
const http = require("http");

const MAX_OUTPUT_LENGTH = 50000;

function log(message, verbose = false) {
  if (verbose || !core.getInput("verbose") || core.getInput("verbose") === "true") {
    console.log(message);
  }
}

function makeRequest(url, options, body = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === "https:" ? https : http;

    const req = protocol.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          body: data,
        });
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function triggerDeploy(baseUrl, pathPrefix, appId, token, commandId, verbose) {
  const url = `${baseUrl}${pathPrefix}/deploy/${appId}`;
  log(`Triggering deployment at: ${url}`, verbose);

  const body = commandId ? JSON.stringify({ command_id: commandId }) : "{}";

  const response = await makeRequest(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Deploy-Token": token,
      },
    },
    body
  );

  if (response.statusCode !== 200) {
    throw new Error(`Deployment trigger failed with HTTP ${response.statusCode}: ${response.body}`);
  }

  const data = JSON.parse(response.body);
  if (!data.execution_id) {
    throw new Error(`Invalid response: missing execution_id`);
  }

  return data;
}

async function checkStatus(baseUrl, pathPrefix, appId, executionId, token, verbose) {
  const url = `${baseUrl}${pathPrefix}/deploy/${appId}/status/${executionId}`;
  log(`Checking status at: ${url}`, verbose);

  const response = await makeRequest(url, {
    method: "GET",
    headers: {
      "X-Deploy-Token": token,
    },
  });

  if (response.statusCode !== 200) {
    throw new Error(`Status check failed with HTTP ${response.statusCode}: ${response.body}`);
  }

  return JSON.parse(response.body);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCompletion(baseUrl, pathPrefix, appId, executionId, token, timeout, verbose) {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds

  log(`Waiting for deployment to complete (timeout: ${timeout}s)...`, verbose);

  while (true) {
    const elapsed = (Date.now() - startTime) / 1000;

    if (elapsed >= timeout) {
      return { status: "timeout", exit_code: -1, output: "" };
    }

    try {
      const status = await checkStatus(baseUrl, pathPrefix, appId, executionId, token, verbose);

      if (status.status === "success" || status.status === "failed") {
        return status;
      }

      log(`Status: ${status.status}, elapsed: ${Math.round(elapsed)}s`, verbose);
    } catch (error) {
      log(`Status check error: ${error.message}, retrying...`, verbose);
    }

    await sleep(pollInterval);
  }
}

async function run() {
  try {
    // Get inputs
    const remoteUrl = core.getInput("remote-url", { required: true });
    const appId = core.getInput("app-id", { required: true });
    const deployToken = core.getInput("deploy-token", { required: true });
    const commandId = core.getInput("command-id") || "";
    const pathPrefix = core.getInput("path-prefix") || "/devops";
    const wait = core.getInput("wait") !== "false";
    const timeout = parseInt(core.getInput("timeout") || "600", 10);
    const verbose = core.getInput("verbose") === "true";

    // Remove trailing slash from URL
    const baseUrl = remoteUrl.replace(/\/$/, "");

    log("=".repeat(50));
    log("HTTP Remote Deploy Action");
    log("=".repeat(50));
    log(`Remote URL: ${baseUrl}`);
    log(`App ID: ${appId}`);
    log(`Path Prefix: ${pathPrefix}`);
    log(`Command ID: ${commandId || "(default)"}`);
    log(`Wait for completion: ${wait}`);
    log(`Timeout: ${timeout}s`);
    log("=".repeat(50));

    // Trigger deployment
    console.log("\n📦 Triggering deployment...");
    const deployResult = await triggerDeploy(baseUrl, pathPrefix, appId, deployToken, commandId, verbose);

    const executionId = deployResult.execution_id;
    console.log(`✅ Deployment started!`);
    console.log(`   Execution ID: ${executionId}`);
    console.log(`   App: ${deployResult.app_name || appId}`);

    core.setOutput("execution-id", executionId);

    if (!wait) {
      console.log("\n⏭️  Not waiting for completion (wait=false)");
      core.setOutput("status", "pending");
      return;
    }

    // Wait for completion
    console.log("\n⏳ Waiting for deployment to complete...");
    const finalStatus = await waitForCompletion(
      baseUrl,
      pathPrefix,
      appId,
      executionId,
      deployToken,
      timeout,
      verbose
    );

    // Set outputs
    core.setOutput("status", finalStatus.status);
    core.setOutput("exit-code", finalStatus.exit_code?.toString() || "");

    // Truncate output if too long
    let output = finalStatus.output || "";
    if (output.length > MAX_OUTPUT_LENGTH) {
      output = output.substring(0, MAX_OUTPUT_LENGTH) + "\n... (truncated)";
    }
    core.setOutput("output", output);

    // Print output
    console.log("\n" + "=".repeat(50));
    console.log("📋 Deployment Output:");
    console.log("=".repeat(50));
    if (finalStatus.output) {
      console.log(finalStatus.output);
    } else {
      console.log("(no output)");
    }
    console.log("=".repeat(50));

    // Handle result
    if (finalStatus.status === "success") {
      console.log(`\n✅ Deployment completed successfully! (exit code: ${finalStatus.exit_code})`);
    } else if (finalStatus.status === "timeout") {
      core.setFailed(`❌ Deployment timed out after ${timeout}s`);
    } else {
      core.setFailed(`❌ Deployment failed with exit code: ${finalStatus.exit_code}`);
    }
  } catch (error) {
    core.setFailed(`❌ Action failed: ${error.message}`);
  }
}

run();
