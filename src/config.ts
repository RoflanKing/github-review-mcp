import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const practicesDir = path.join(projectRoot, "practices");

export function readToken(): string {
  const envFile = path.join(projectRoot, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set. Put it in .env in the project root.");
  return token;
}

export function readReviewRules(): string {
  return readFileSync(path.join(projectRoot, "review-rules.md"), "utf8");
}

export interface PracticeRule {
  id: string;
  title: string;
  topic: string;
  docs?: string;
}

export function listPracticeTopics(): string[] {
  return readdirSync(practicesDir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.slice(0, -3))
    .sort();
}

export function readPractice(topic: string): string {
  const topics = listPracticeTopics();
  if (!topics.includes(topic)) throw new Error(`Unknown practice topic "${topic}". Topics: ${topics.join(", ")}`);
  return readFileSync(path.join(practicesDir, `${topic}.md`), "utf8");
}

export function readPracticeRules(): Map<string, PracticeRule> {
  const rules = new Map<string, PracticeRule>();
  for (const topic of listPracticeTopics()) {
    for (const section of readPractice(topic).split(/^## /m).slice(1)) {
      const heading = section.match(/^([A-Z]+-\d+)\s+(.+)$/m);
      if (!heading) continue;
      const docs = section.match(/^Docs:\s*(\S+)/m)?.[1];
      rules.set(heading[1], { id: heading[1], title: heading[2].trim(), topic, docs });
    }
  }
  return rules;
}

export function readReviewApp(): string {
  const html = readFileSync(path.join(projectRoot, "ui", "review.html"), "utf8");
  const script = readFileSync(path.join(projectRoot, "dist", "ui", "review.js"), "utf8").replace(/<\/script/gi, "<\\/script");
  return html.replace('<script type="module" src="review.js"></script>', () => `<script type="module">${script}</script>`);
}
