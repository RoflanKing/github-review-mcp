export interface PullFile {
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

const LARGE_PR_LINES = 400;

const SENSITIVE_PATTERNS = [
  /(^|\/)\.env/,
  /(^|\/)\.github\/workflows\//,
  /(^|\/)Dockerfile/,
  /(^|\/)migrations?\//,
  /(auth|secret|credential|permission|token)/i,
  /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock)$/,
];

const TEST_PATTERN = /(^|[/._-])(tests?|specs?|__tests__)([/._-]|$)/i;

export function sizeLabel(changedLines: number): "small" | "medium" | "large" {
  if (changedLines <= 100) return "small";
  return changedLines <= LARGE_PR_LINES ? "medium" : "large";
}

export function riskFlags(pr: { additions: number; deletions: number }, files: PullFile[]): string[] {
  const flags: string[] = [];

  const lines = pr.additions + pr.deletions;
  if (lines > LARGE_PR_LINES) flags.push(`Large PR: ${lines} changed lines. Consider splitting it.`);

  const sensitive = files.filter((f) => SENSITIVE_PATTERNS.some((p) => p.test(f.filename)));
  if (sensitive.length) flags.push(`Sensitive files changed: ${sensitive.map((f) => f.filename).join(", ")}`);

  const hasTests = files.some((f) => TEST_PATTERN.test(f.filename));
  const codeLines = files.filter((f) => !TEST_PATTERN.test(f.filename)).reduce((sum, f) => sum + f.additions, 0);
  if (!hasTests && codeLines > 50) flags.push("Code changed without any test changes.");

  const noPatch = files.filter((f) => !f.patch && f.status !== "removed");
  if (noPatch.length) flags.push(`No diff available (binary or too large): ${noPatch.map((f) => f.filename).join(", ")}`);

  return flags;
}

export interface DiffLine {
  line: number;
  text: string;
  added: boolean;
}

export function diffLines(patch: string | undefined): Map<number, DiffLine> {
  const lines = new Map<number, DiffLine>();
  let line = 0;
  for (const raw of patch?.split("\n") ?? []) {
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (raw === "" || raw.startsWith("-") || raw.startsWith("\\")) continue;
    lines.set(line, { line, text: raw.slice(1), added: raw.startsWith("+") });
    line++;
  }
  return lines;
}

export function diffSnippet(lines: Map<number, DiffLine>, start: number, end: number, context = 3): DiffLine[] {
  const snippet: DiffLine[] = [];
  for (let n = start - context; n <= end + context; n++) {
    const entry = lines.get(n);
    if (entry) snippet.push(entry);
  }
  return snippet;
}

export function numberLines(text: string, start: number, end: number) {
  const lines = text.split("\n");
  const last = Math.min(end, lines.length);
  const width = String(last).length;
  const body = lines
    .slice(start - 1, last)
    .map((line, i) => `${String(start + i).padStart(width)}  ${line}`)
    .join("\n");
  return { body, last, total: lines.length };
}

export function formatDiff(files: PullFile[]): string {
  return files
    .map((f) => {
      const renamed = f.previous_filename ? ` from ${f.previous_filename}` : "";
      const header = `### ${f.filename} (${f.status}${renamed}, +${f.additions} -${f.deletions})`;
      return `${header}\n${f.patch ?? "(no diff: binary file or too large for the GitHub API)"}\n`;
    })
    .join("\n");
}
