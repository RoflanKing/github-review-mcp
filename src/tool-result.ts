export function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  switch ((err as { status?: number }).status) {
    case 401:
      return "GitHub rejected the token (401). Check GITHUB_TOKEN.";
    case 403:
    case 429:
      return `GitHub refused the request: rate limit or missing token permission. ${message}`;
    case 404:
      return "Not found (404). Check the repository and PR number, or the token has no access to it.";
    default:
      return message;
  }
}

export async function runWithData(body: () => Promise<{ text: string; data: object }>) {
  try {
    const { text, data } = await body();
    return { content: [{ type: "text" as const, text }], structuredContent: { ...data } };
  } catch (err) {
    return { content: [{ type: "text" as const, text: describeError(err) }], isError: true };
  }
}

export async function run(body: () => Promise<unknown>) {
  try {
    const data = await body();
    const text = typeof data === "string" ? data : JSON.stringify(data);
    return { content: [{ type: "text" as const, text }] };
  } catch (err) {
    return { content: [{ type: "text" as const, text: describeError(err) }], isError: true };
  }
}
