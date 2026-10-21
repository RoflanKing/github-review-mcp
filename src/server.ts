import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Octokit } from "@octokit/rest";
import { z } from "zod";
import { registerReviewApp } from "./app.js";
import { listPracticeTopics, readPractice, readPracticeRules, readReviewRules } from "./config.js";
import {
  getFile,
  getPull,
  getPullFiles,
  getReviewQueue,
  parsePull,
  repoOfSearchItem,
  type PullRef,
  type RepoRef,
} from "./github.js";
import { formatDiff, numberLines, riskFlags, sizeLabel } from "./review.js";
import { describeError, run } from "./tool-result.js";

const DAY_MS = 86_400_000;
const DIFF_PAGE_CHARS = 30_000;
const FILE_PAGE_LINES = 400;

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

function diffPage(diff: string, offset: number): string {
  let end = Math.min(offset + DIFF_PAGE_CHARS, diff.length);
  if (end < diff.length) {
    const lineBreak = diff.lastIndexOf("\n", end);
    if (lineBreak > offset) end = lineBreak + 1;
  }
  const footer =
    end < diff.length
      ? `[chars ${offset}-${end} of ${diff.length}. Call get_pr_diff again with offset=${end}]`
      : `[end of diff, ${diff.length} chars total]`;
  return `${diff.slice(offset, end)}\n${footer}`;
}

const ageDays = (createdAt: string) => Math.floor((Date.now() - Date.parse(createdAt)) / DAY_MS);

const one = (value: string | string[]) => (Array.isArray(value) ? value[0] : value);

const userPrompt = (text: string) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text } }] });

export function createServer(octokit: Octokit, currentRepo?: RepoRef): McpServer {
  const instructions = `Use this server to review GitHub pull requests and to find the ones waiting for my review.
When the user asks to review, check or look at a pull request, call review_pull_request first and follow the steps it returns.
Do not open github.com pages with a browser or web fetch: these tools also work for private repositories and give the full diff.
When the user asks what to review or which PRs wait for them, call my_review_queue.
Back findings with the practice rules (get_practice) or official documentation, and finish a review with show_review.`;
  const server = new McpServer({ name: "github-review-mcp", version: "0.1.0" }, { instructions });
  const here = currentRepo && `${currentRepo.owner}/${currentRepo.repo}`;

  const prArg = z
    .string()
    .describe(`Pull request: owner/repo#123 or a PR URL.${here ? ` A bare 123 means ${here}#123` : ""}`);

  const toPull = (input: string) => parsePull(input, currentRepo);

  async function pullSummary(ref: PullRef) {
    const { pull, files, reviews, reviewComments, comments } = await getPull(octokit, ref);
    const diffChars = files.reduce((sum, f) => sum + (f.patch?.length ?? 0), 0);
    return {
      pr: `${ref.owner}/${ref.repo}#${ref.number}`,
      title: pull.title,
      url: pull.html_url,
      author: pull.user?.login ?? null,
      state: pull.merged_at ? "merged" : pull.state,
      draft: pull.draft ?? false,
      base: pull.base.ref,
      head: pull.head.ref,
      description: pull.body ?? "",
      size: {
        additions: pull.additions,
        deletions: pull.deletions,
        files: pull.changed_files,
        label: sizeLabel(pull.additions + pull.deletions),
      },
      risk_flags: riskFlags(pull, files),
      files: files.map((f) => ({ path: f.filename, status: f.status, additions: f.additions, deletions: f.deletions })),
      diff: { chars: diffChars, pages: Math.ceil(diffChars / DIFF_PAGE_CHARS) },
      reviews: reviews
        .filter((r) => r.state !== "COMMENTED" || r.body)
        .map((r) => ({ author: r.user?.login ?? null, state: r.state, body: r.body })),
      review_comments: reviewComments.map((c) => ({
        author: c.user?.login ?? null,
        path: c.path,
        line: c.line ?? null,
        body: c.body,
      })),
      comments: comments.map((c) => ({ author: c.user?.login ?? null, body: c.body ?? "" })),
    };
  }

  server.registerTool(
    "my_review_queue",
    {
      title: "My review queue",
      description:
        "Open pull requests by other people, across all repositories, that wait for my review: review requested from me, or I already reviewed or commented and the PR is still open. Each PR says why it is in the queue.",
      annotations: READ_ONLY,
    },
    () =>
      run(async () => {
        const queue = await getReviewQueue(octokit);
        const prs = queue.map(({ item, reasons }) => ({
          pr: `${repoOfSearchItem(item)}#${item.number}`,
          title: item.title,
          author: item.user?.login ?? null,
          draft: item.draft ?? false,
          age_days: ageDays(item.created_at),
          updated_at: item.updated_at,
          comments: item.comments,
          reasons,
          url: item.html_url,
        }));
        prs.sort(
          (a, b) =>
            Number(b.reasons.includes("review_requested")) - Number(a.reasons.includes("review_requested")) ||
            b.age_days - a.age_days,
        );
        return { count: prs.length, pull_requests: prs };
      }),
  );

  server.registerTool(
    "review_pull_request",
    {
      title: "Review pull request",
      description:
        "Start here whenever the user asks to review, check or summarize a GitHub pull request. Returns the PR description, size, risk flags, changed files, existing reviews and comments, the review rules and the steps to finish the review.",
      inputSchema: { pr: prArg },
      annotations: READ_ONLY,
    },
    ({ pr }) =>
      run(async () => {
        const summary = await pullSummary(toPull(pr));
        return {
          ...summary,
          review_steps: [
            `Read the whole diff: call get_pr_diff with pr="${summary.pr}" and keep calling it with the offset from the footer until the end.`,
            "When a hunk depends on code you cannot see (a called function, a type, the rest of a changed function), read it with get_file.",
            "Do not repeat points already raised in reviews or review_comments.",
            "Check the code against review_rules and the practice rules below. Make claims only about code you have read.",
            "Give each finding the ID of the matching practice rule; if none fits, link official documentation in docs_url. Read a topic with get_practice when you need the details.",
            `Finish by calling show_review with pr="${summary.pr}" and all findings.`,
          ],
          review_rules: readReviewRules(),
          practice_rules: [...readPracticeRules().values()].map((rule) => `${rule.id} ${rule.title}`),
        };
      }),
  );

  server.registerTool(
    "get_pr_diff",
    {
      title: "Get pull request diff",
      description: `Diff of a pull request as plain text, ${DIFF_PAGE_CHARS} characters per page. Pass path to read one file only. If the footer gives an offset, call again with it until the end of the diff.`,
      inputSchema: {
        pr: prArg,
        path: z.string().optional().describe("Changed file path, e.g. src/index.ts. Omit for the whole PR"),
        offset: z.number().int().min(0).default(0).describe("Character offset from the previous page footer"),
      },
      annotations: READ_ONLY,
    },
    ({ pr, path, offset }) =>
      run(async () => {
        let files = await getPullFiles(octokit, toPull(pr));
        if (path) {
          const match = files.filter((f) => f.filename === path);
          if (!match.length) {
            const known = files.slice(0, 30).map((f) => f.filename).join(", ");
            throw new Error(`"${path}" is not changed in this PR. Changed files: ${known}`);
          }
          files = match;
        }
        return diffPage(formatDiff(files), offset);
      }),
  );

  server.registerTool(
    "get_file",
    {
      title: "Get file at PR head",
      description: `Contents of a file as it is in the pull request branch, with line numbers, up to ${FILE_PAGE_LINES} lines per call. Use it to read the code around a diff hunk: callers, types, the rest of a changed function.`,
      inputSchema: {
        pr: prArg,
        path: z.string().describe("File path in the repository, e.g. src/index.ts"),
        start_line: z.number().int().min(1).default(1),
        end_line: z.number().int().min(1).optional().describe(`Defaults to start_line + ${FILE_PAGE_LINES - 1}`),
      },
      annotations: READ_ONLY,
    },
    ({ pr, path, start_line, end_line }) =>
      run(async () => {
        const text = await getFile(octokit, toPull(pr), path);
        const end = Math.min(end_line ?? Infinity, start_line + FILE_PAGE_LINES - 1);
        const { body, last, total } = numberLines(text, start_line, end);
        if (start_line > total) return `[${path} has only ${total} lines]`;

        const footer =
          last < total
            ? `[lines ${start_line}-${last} of ${total}. Call get_file again with start_line=${last + 1}]`
            : `[end of file, ${total} lines]`;
        return `### ${path}\n${body}\n${footer}`;
      }),
  );

  server.registerTool(
    "get_practice",
    {
      title: "Get coding practice",
      description:
        "Full text of a coding practice topic with its rules, examples and links to official documentation. Use it to back review findings.",
      inputSchema: {
        topic: z.string().describe(`One of: ${listPracticeTopics().join(", ")}`),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ topic }) => run(async () => readPractice(topic)),
  );

  registerReviewApp(server, octokit, toPull);

  server.registerResource(
    "practices",
    new ResourceTemplate("practices://{topic}", {
      list: () => ({
        resources: listPracticeTopics().map((topic) => ({
          uri: `practices://${topic}`,
          name: topic,
          title: readPractice(topic).match(/^# (.+)$/m)?.[1] ?? topic,
          mimeType: "text/markdown",
        })),
      }),
      complete: { topic: (value) => listPracticeTopics().filter((topic) => topic.startsWith(value)) },
    }),
    {
      title: "Coding practices",
      description: "Coding practice rules with links to official documentation.",
      mimeType: "text/markdown",
    },
    (uri, { topic }) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: readPractice(one(topic)) }] }),
  );

  server.registerResource(
    "review-rules",
    "review://rules",
    {
      title: "Review rules",
      description: "Severity levels, checklist and output format for pull request reviews.",
      mimeType: "text/markdown",
    },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: readReviewRules() }] }),
  );

  server.registerResource(
    "pull-request",
    new ResourceTemplate("github://{owner}/{repo}/pull/{number}", {
      list: async () => {
        const resources: { uri: string; name: string; title: string; description: string }[] = [];
        try {
          for (const { item, reasons } of await getReviewQueue(octokit)) {
            const repo = repoOfSearchItem(item);
            resources.push({
              uri: `github://${repo}/pull/${item.number}`,
              name: `${repo}#${item.number}`,
              title: item.title,
              description: `In your review queue: ${reasons.join(", ")}`,
            });
          }
        } catch (err) {
          console.error("Listing PR resources failed:", describeError(err));
        }
        return { resources };
      },
    }),
    {
      title: "Pull request",
      description: "Pull request metadata, risk flags, comments and the first page of the diff.",
      mimeType: "application/json",
    },
    async (uri, { owner, repo, number }) => {
      const ref = { owner: one(owner), repo: one(repo), number: Number(one(number)) };
      const summary = await pullSummary(ref);
      const diff = diffPage(formatDiff(await getPullFiles(octokit, ref)), 0);
      return {
        contents: [
          { uri: uri.href, mimeType: "application/json", text: JSON.stringify(summary) },
          { uri: uri.href, mimeType: "text/x-diff", text: diff },
        ],
      };
    },
  );

  server.registerPrompt(
    "review_pr",
    {
      title: "Review a pull request",
      description: "Code review of a pull request, shown in the review panel.",
      argsSchema: { pr: prArg },
    },
    ({ pr }) =>
      userPrompt(`Review the pull request ${pr}: call review_pull_request with pr="${pr}" and follow its review_steps.`),
  );

  server.registerPrompt(
    "plan_my_reviews",
    {
      title: "Plan my reviews",
      description: "Order the pull requests that wait for my review, across all repositories.",
    },
    () =>
      userPrompt(`Plan my reviews for today. Do not post anything to GitHub.

1. Call my_review_queue.
2. Order the PRs: requested reviews first, then PRs where I reviewed or commented and the discussion moved on (updated_at), drafts last. One line per PR with the reason.
3. Finish with the first three PRs to open, and offer to review them with review_pull_request.`),
  );

  return server;
}
