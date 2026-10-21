import type { DiffLine } from "./review.js";

export type Severity = "blocker" | "major" | "minor" | "nit";
export type Verdict = "approve" | "request_changes" | "comment";
export type ReviewEvent = "COMMENT" | "REQUEST_CHANGES" | "APPROVE";

export interface ReviewFinding {
  id: number;
  severity: Severity;
  path: string;
  line: number;
  start_line?: number;
  title: string;
  body: string;
  suggested_code?: string;
  practice?: { id: string; title?: string; docs?: string };
  docs_url?: string;
  in_diff: boolean;
  snippet: DiffLine[];
  file_url: string;
}

export interface ReviewView {
  pr: string;
  title: string;
  url: string;
  author: string | null;
  base: string;
  head: string;
  head_sha: string;
  verdict: Verdict;
  summary: string;
  findings: ReviewFinding[];
  not_reviewed: string[];
}

export interface PostedReview {
  url: string;
  inline: number;
  in_summary: number;
}
