import { execFileSync } from "node:child_process";
import type { Octokit, RestEndpointMethodTypes } from "@octokit/rest";
import type { ReviewEvent } from "./review-view.js";

type PullFile = RestEndpointMethodTypes["pulls"]["listFiles"]["response"]["data"][number];
type SearchItem = RestEndpointMethodTypes["search"]["issuesAndPullRequests"]["response"]["data"]["items"][number];

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface PullRef extends RepoRef {
  number: number;
}

const URL_PATTERN =
  /^(?:https?:\/\/|git@)?(?:www\.)?github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/pull\/(\d+))?(?:[/?#].*)?$/i;
const SHORT_PATTERN = /^([\w.-]+)\/([\w.-]+?)(?:#(\d+))?$/;
const NUMBER_PATTERN = /^#?(\d+)$/;

function parse(input: string) {
  const value = input.trim();
  const match = value.match(URL_PATTERN) ?? value.match(SHORT_PATTERN);
  if (!match) throw new Error(`Cannot parse "${input}". Use owner/repo, owner/repo#123 or a github.com URL.`);
  return { owner: match[1], repo: match[2], number: match[3] ? Number(match[3]) : undefined };
}

export function parsePull(input: string, fallback?: RepoRef): PullRef {
  const bare = input.trim().match(NUMBER_PATTERN);
  if (bare) {
    if (!fallback) throw new Error(`"${input}" needs a repository: use owner/repo#${bare[1]}.`);
    return { ...fallback, number: Number(bare[1]) };
  }

  const { owner, repo, number } = parse(input);
  if (!number) throw new Error(`"${input}" has no pull request number. Use owner/repo#123 or a .../pull/123 URL.`);
  return { owner, repo, number };
}

export function detectRepo(): RepoRef | undefined {
  try {
    const remote = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const { owner, repo } = parse(remote);
    return { owner, repo };
  } catch {
    return undefined;
  }
}

async function searchPulls(octokit: Octokit, query: string): Promise<SearchItem[]> {
  const { data } = await octokit.search.issuesAndPullRequests({ q: query, sort: "created", order: "desc", per_page: 100 });
  return data.items;
}

export const repoOfSearchItem = (item: SearchItem) => item.repository_url.replace("https://api.github.com/repos/", "");

const QUEUE_QUERIES = {
  review_requested: "review-requested:@me",
  reviewed: "reviewed-by:@me -author:@me",
  commented: "commenter:@me -author:@me",
} as const;

export type QueueReason = keyof typeof QUEUE_QUERIES;

export async function getReviewQueue(octokit: Octokit) {
  const reasons = Object.keys(QUEUE_QUERIES) as QueueReason[];
  const results = await Promise.all(
    reasons.map((reason) => searchPulls(octokit, `is:pr is:open archived:false ${QUEUE_QUERIES[reason]}`)),
  );

  const queue = new Map<string, { item: SearchItem; reasons: QueueReason[] }>();
  reasons.forEach((reason, i) => {
    for (const item of results[i]) {
      const entry = queue.get(item.html_url) ?? { item, reasons: [] };
      entry.reasons.push(reason);
      queue.set(item.html_url, entry);
    }
  });
  return [...queue.values()];
}

const FILES_TTL_MS = 120_000;
const filesCache = new Map<string, { expires: number; files: Promise<PullFile[]> }>();

export function getPullFiles(octokit: Octokit, { owner, repo, number }: PullRef): Promise<PullFile[]> {
  const key = `${owner}/${repo}#${number}`;
  const now = Date.now();
  const cached = filesCache.get(key);
  if (cached && cached.expires > now) return cached.files;

  for (const [k, entry] of filesCache) if (entry.expires <= now) filesCache.delete(k);
  const files = octokit.paginate(octokit.pulls.listFiles, { owner, repo, pull_number: number, per_page: 100 });
  filesCache.set(key, { expires: now + FILES_TTL_MS, files });
  files.catch(() => filesCache.delete(key));
  return files;
}

export async function getPullMeta(octokit: Octokit, { owner, repo, number }: PullRef) {
  const { data } = await octokit.pulls.get({ owner, repo, pull_number: number });
  return data;
}

export async function getPull(octokit: Octokit, ref: PullRef) {
  const { owner, repo, number } = ref;
  const params = { owner, repo, per_page: 100 };
  const [pull, files, reviews, reviewComments, comments] = await Promise.all([
    getPullMeta(octokit, ref),
    getPullFiles(octokit, ref),
    octokit.paginate(octokit.pulls.listReviews, { ...params, pull_number: number }),
    octokit.paginate(octokit.pulls.listReviewComments, { ...params, pull_number: number }),
    octokit.paginate(octokit.issues.listComments, { ...params, issue_number: number }),
  ]);
  return { pull, files, reviews, reviewComments, comments };
}

export async function getFile(octokit: Octokit, { owner, repo, number }: PullRef, path: string): Promise<string> {
  const { data } = await octokit.repos
    .getContent({ owner, repo, path, ref: `refs/pull/${number}/head`, mediaType: { format: "raw" } })
    .catch((err) => {
      if (err.status === 404) throw new Error(`"${path}" does not exist in the branch of PR #${number}.`);
      throw err;
    });
  if (typeof data !== "string") throw new Error(`"${path}" is a directory, not a file.`);
  return data;
}

export interface InlineComment {
  path: string;
  line: number;
  start_line?: number;
  body: string;
}

export async function createReview(
  octokit: Octokit,
  { owner, repo, number }: PullRef,
  review: { commitId: string; event: ReviewEvent; body: string; comments: InlineComment[] },
): Promise<string> {
  const { data } = await octokit.pulls.createReview({
    owner,
    repo,
    pull_number: number,
    commit_id: review.commitId,
    event: review.event,
    body: review.body,
    comments: review.comments.map((c) => ({
      ...c,
      side: "RIGHT" as const,
      ...(c.start_line && { start_side: "RIGHT" as const }),
    })),
  });
  return data.html_url;
}
