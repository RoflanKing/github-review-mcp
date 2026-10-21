import {
  getUiCapability,
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Octokit } from "@octokit/rest";
import { z } from "zod";
import { readPracticeRules, readReviewApp } from "./config.js";
import { createReview, getPullFiles, getPullMeta, type InlineComment, type PullRef } from "./github.js";
import { diffLines, diffSnippet } from "./review.js";
import type { PostedReview, ReviewView, Severity } from "./review-view.js";
import { runWithData } from "./tool-result.js";

const REVIEW_UI = "ui://github-review/review.html";
const SEVERITIES = ["blocker", "major", "minor", "nit"] as const satisfies readonly Severity[];

const findingSchema = z.object({
  severity: z.enum(SEVERITIES),
  path: z.string().describe("Changed file path as in the PR"),
  line: z.number().int().min(1).describe("Line in the new version of the file"),
  start_line: z.number().int().min(1).optional().describe("First line, for findings that span several lines"),
  title: z.string().describe("The problem in one line"),
  body: z.string().describe("Why it is a problem and how to fix it"),
  suggested_code: z
    .string()
    .optional()
    .describe("Exact replacement for lines start_line..line; posted as a GitHub suggestion"),
  practice: z.string().optional().describe("ID of the matching practice rule, e.g. SEC-2"),
  docs_url: z.string().url().optional().describe("Official documentation, when no practice rule fits"),
});

export function registerReviewApp(server: McpServer, octokit: Octokit, toPull: (input: string) => PullRef) {
  const prArg = z.string().describe("Pull request: owner/repo#123 or a PR URL");

  registerAppTool(
    server,
    "show_review",
    {
      title: "Show review",
      description:
        "Final step of a pull request review: shows the findings to the user in an interactive panel, where they can read the code, follow practice links and post selected comments to GitHub. Call it once with all findings instead of writing the whole review in the chat.",
      inputSchema: {
        pr: prArg,
        verdict: z.enum(["approve", "request_changes", "comment"]),
        summary: z.string().describe("The review outcome in 2-3 sentences"),
        findings: z.array(findingSchema),
        not_reviewed: z.array(z.string()).default([]).describe("Files whose diff was unavailable or not read"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: { ui: { resourceUri: REVIEW_UI } },
    },
    ({ pr, verdict, summary, findings, not_reviewed }) =>
      runWithData(async () => {
        const ref = toPull(pr);
        const [pull, files] = await Promise.all([getPullMeta(octokit, ref), getPullFiles(octokit, ref)]);
        const linesByPath = new Map(files.map((f) => [f.filename, diffLines(f.patch)]));
        const rules = readPracticeRules();
        const repoUrl = `https://github.com/${ref.owner}/${ref.repo}`;

        const sorted = [...findings].sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
        const view: ReviewView = {
          pr: `${ref.owner}/${ref.repo}#${ref.number}`,
          title: pull.title,
          url: pull.html_url,
          author: pull.user?.login ?? null,
          base: pull.base.ref,
          head: pull.head.ref,
          head_sha: pull.head.sha,
          verdict,
          summary,
          not_reviewed,
          findings: sorted.map((f, id) => {
            const lines = linesByPath.get(f.path) ?? new Map();
            const start = Math.min(f.start_line ?? f.line, f.line);
            const practiceId = f.practice?.toUpperCase();
            const rule = practiceId ? rules.get(practiceId) : undefined;
            const range = start === f.line ? `L${f.line}` : `L${start}-L${f.line}`;
            return {
              ...f,
              id,
              start_line: start === f.line ? undefined : start,
              practice: practiceId ? { id: practiceId, title: rule?.title, docs: rule?.docs } : undefined,
              in_diff: lines.has(start) && lines.has(f.line),
              snippet: diffSnippet(lines, start, f.line),
              file_url: `${repoUrl}/blob/${pull.head.sha}/${f.path}#${range}`,
            };
          }),
        };

        const warnings = [
          ...findings.filter((f) => !linesByPath.has(f.path)).map((f) => `"${f.path}" is not changed in this PR.`),
          ...findings
            .filter((f) => f.practice && !rules.has(f.practice.toUpperCase()))
            .map((f) => `Unknown practice "${f.practice}".`),
        ];
        const counts = SEVERITIES.map((s) => `${view.findings.filter((f) => f.severity === s).length} ${s}`).join(", ");
        const hasUi = getUiCapability(server.server.getClientCapabilities())?.mimeTypes?.includes(RESOURCE_MIME_TYPE);

        const text = [
          hasUi
            ? `The review of ${view.pr} (${counts}) is shown to the user in an interactive panel. Nothing was posted to GitHub: the user picks the comments to post in the panel. Reply in one or two sentences, do not repeat the findings.`
            : `This client cannot show the review panel. Write the review of ${view.pr} (${counts}) in the chat following review_rules. Posting comments to GitHub is only available from the panel in Claude Desktop.`,
          ...warnings,
        ].join("\n");
        return { text, data: view };
      }),
  );

  registerAppTool(
    server,
    "post_review_comments",
    {
      title: "Post review comments",
      description:
        "Posts the comments the user selected in the review panel as one GitHub review. Only the panel calls it.",
      inputSchema: {
        pr: prArg,
        head_sha: z.string().describe("Commit the review was made on"),
        event: z.enum(["COMMENT", "REQUEST_CHANGES", "APPROVE"]).default("COMMENT"),
        body: z.string().default(""),
        comments: z
          .array(
            z.object({
              path: z.string(),
              line: z.number().int().min(1),
              start_line: z.number().int().min(1).optional(),
              body: z.string().min(1),
            }),
          )
          .max(100),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      _meta: { ui: { resourceUri: REVIEW_UI, visibility: ["app"] } },
    },
    ({ pr, head_sha, event, body, comments }) =>
      runWithData(async () => {
        const ref = toPull(pr);
        const linesByPath = new Map((await getPullFiles(octokit, ref)).map((f) => [f.filename, diffLines(f.patch)]));

        const inline: InlineComment[] = [];
        const outside: string[] = [];
        for (const c of comments) {
          const lines = linesByPath.get(c.path);
          if (lines?.has(c.line) && lines.has(c.start_line ?? c.line)) {
            inline.push(c);
          } else {
            outside.push(`**${c.path}:${c.line}**\n\n${c.body}`);
          }
        }

        const summary = [body.trim(), ...outside].filter(Boolean).join("\n\n---\n\n");
        if (event !== "APPROVE" && !inline.length && !summary) throw new Error("Nothing to post: select at least one comment.");

        const url = await createReview(octokit, ref, { commitId: head_sha, event, body: summary, comments: inline });
        const posted: PostedReview = { url, inline: inline.length, in_summary: outside.length };
        return {
          text: `Posted a ${event} review on ${pr}: ${inline.length} inline comments, ${outside.length} in the summary. ${url}`,
          data: posted,
        };
      }),
  );

  registerAppResource(
    server,
    "Review panel",
    REVIEW_UI,
    { description: "Interactive pull request review panel" },
    async () => ({ contents: [{ uri: REVIEW_UI, mimeType: RESOURCE_MIME_TYPE, text: readReviewApp() }] }),
  );
}
