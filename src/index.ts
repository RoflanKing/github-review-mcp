import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Octokit } from "@octokit/rest";
import { readToken } from "./config.js";
import { detectRepo } from "./github.js";
import { createServer } from "./server.js";

async function main() {
  const octokit = new Octokit({ auth: readToken(), userAgent: "github-review-mcp" });
  const currentRepo = detectRepo();
  await createServer(octokit, currentRepo).connect(new StdioServerTransport());
  const repo = currentRepo ? `${currentRepo.owner}/${currentRepo.repo}` : "none";
  console.error(`github-review-mcp running on stdio, current repository: ${repo}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
