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

  if (response.statusCode !== 200 && response.statusCode !== 202) {
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

async function streamOutput(baseUrl, pathPrefix, appId, executionId, token, timeout, verbose) {
  return new Promise((resolve, reject) => {
    const streamUrl = `${baseUrl}${pathPrefix}/deploy/${appId}/stream/${executionId}`;
    log(`Connecting to stream: ${streamUrl}`, verbose);

    const parsedUrl = new URL(streamUrl);
    const protocol = parsedUrl.protocol === "https:" ? https : http;

    const startTime = Date.now();
    let outputLines = [];
    let lastActivity = Date.now();

    const req = protocol.request(streamUrl, {
      method: "GET",
      headers: {
        "Accept": "text/event-stream",
        "X-Deploy-Token": token,
      },
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Stream failed with HTTP ${res.statusCode}`));
        return;
      }

      let buffer = "";

      res.on("data", (chunk) => {
        lastActivity = Date.now();
        buffer += chunk.toString();

        // Process complete SSE messages
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || ""; // Keep incomplete message in buffer

        for (const message of lines) {
          if (!message.trim()) continue;

          const eventMatch = message.match(/event: (\w+)\ndata: (.+)/s);
          if (!eventMatch) continue;

          const [, event, data] = eventMatch;

          if (event === "output") {
            console.log(data);
            outputLines.push(data);
          } else if (event === "complete") {
            try {
              const result = JSON.parse(data);
              resolve({
                status: result.status,
                exit_code: result.exit_code,
                output: outputLines.join("\n"),
              });
            } catch (e) {
              reject(new Error(`Invalid complete event: ${data}`));
            }
            return;
          }
        }
      });

      res.on("end", () => {
        // Stream ended without complete event, check final status
        checkStatus(baseUrl, pathPrefix, "", executionId, token, verbose)
          .then((status) => {
            resolve({
              status: status.status,
              exit_code: status.exit_code,
              output: status.output || outputLines.join("\n"),
            });
          })
          .catch(reject);
      });

      res.on("error", reject);
    });

    req.on("error", reject);
    req.end();

    // Timeout check
    const timeoutCheck = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const idle = (Date.now() - lastActivity) / 1000;

      if (elapsed >= timeout) {
        clearInterval(timeoutCheck);
        req.destroy();
        resolve({
          status: "timeout",
          exit_code: -1,
          output: outputLines.join("\n"),
        });
      } else if (idle > 30) {
        // If no activity for 30s, reconnect might be needed
        log(`No activity for ${Math.round(idle)}s, stream might have disconnected`, verbose);
      }
    }, 5000);

    req.on("close", () => clearInterval(timeoutCheck));
  });
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

    // Stream output in real-time
    console.log("\n⏳ Streaming deployment output...");
    console.log("=".repeat(50));

    let finalStatus;
    try {
      // Try streaming first (real-time output)
      finalStatus = await streamOutput(
        baseUrl,
        pathPrefix,
        appId,
        executionId,
        deployToken,
        timeout,
        verbose
      );
    } catch (streamError) {
      // Fall back to polling if streaming fails
      log(`Streaming failed: ${streamError.message}, falling back to polling`, verbose);
      console.log("\n⏳ Waiting for deployment to complete...");
      finalStatus = await waitForCompletion(
        baseUrl,
        pathPrefix,
        appId,
        executionId,
        deployToken,
        timeout,
        verbose
      );
    }

    console.log("=".repeat(50));

    // Set outputs
    core.setOutput("status", finalStatus.status);
    core.setOutput("exit-code", finalStatus.exit_code?.toString() || "");

    // Truncate output if too long
    let output = finalStatus.output || "";
    if (output.length > MAX_OUTPUT_LENGTH) {
      output = output.substring(0, MAX_OUTPUT_LENGTH) + "\n... (truncated)";
    }
    core.setOutput("output", output);

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
