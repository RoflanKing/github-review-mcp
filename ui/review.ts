import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { PostedReview, ReviewEvent, ReviewFinding, ReviewView, Severity } from "../src/review-view.js";

type Phase = "idle" | "confirm" | "posting" | "done" | "error";

const SEVERITY: Record<Severity, string> = { blocker: "🔴 Blocker", major: "🟠 Major", minor: "🟡 Minor", nit: "🔵 Nit" };
const VERDICT_LABEL = { approve: "✅ Approve", request_changes: "🔄 Request changes", comment: "💬 Comment" };
const EVENT_LABEL: Record<ReviewEvent, string> = { COMMENT: "Comment", REQUEST_CHANGES: "Request changes", APPROVE: "Approve" };
const EVENT_OF_VERDICT: Record<ReviewView["verdict"], ReviewEvent> = {
  approve: "APPROVE",
  request_changes: "REQUEST_CHANGES",
  comment: "COMMENT",
};

const state = {
  view: undefined as ReviewView | undefined,
  filter: "all" as Severity | "all",
  selected: new Set<number>(),
  drafts: new Map<number, string>(),
  message: "",
  event: "COMMENT" as ReviewEvent,
  phase: "idle" as Phase,
  result: undefined as PostedReview | undefined,
  error: "",
  canFullscreen: false,
};

const app = new App({ name: "github-review-panel", version: "0.1.0" }, {});
const root = document.getElementById("root")!;

type Child = Node | string | false | null | undefined;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, unknown>> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith("on")) el.addEventListener(key.slice(2), value as EventListener);
    else if (key in el) (el as unknown as Record<string, unknown>)[key] = value;
    else el.setAttribute(key, String(value));
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

async function open(url: string) {
  const result = await app.openLink({ url }).catch(() => ({ isError: true }));
  if (result.isError) window.open(url, "_blank", "noopener");
}

function linkButton(url: string, className: string, ...content: Child[]) {
  return h("button", { class: className, type: "button", title: url, onclick: () => open(url) }, ...content);
}

function location(f: ReviewFinding) {
  return f.start_line ? `${f.path}:${f.start_line}-${f.line}` : `${f.path}:${f.line}`;
}

function defaultComment(f: ReviewFinding): string {
  const parts = [`**${SEVERITY[f.severity]}: ${f.title}**`, f.body];
  if (f.suggested_code) {
    parts.push(f.in_diff ? "```suggestion\n" + f.suggested_code + "\n```" : "```\n" + f.suggested_code + "\n```");
  }
  const refs: string[] = [];
  if (f.practice) {
    const name = `${f.practice.id}${f.practice.title ? ` ${f.practice.title}` : ""}`;
    refs.push(f.practice.docs ? `[${name}](${f.practice.docs})` : name);
  }
  if (f.docs_url) refs.push(`[documentation](${f.docs_url})`);
  if (refs.length) parts.push(`See: ${refs.join(", ")}`);
  return parts.join("\n\n");
}

const draftOf = (f: ReviewFinding) => state.drafts.get(f.id) ?? defaultComment(f);

function render() {
  const view = state.view;
  if (!view) return;
  const sections = [header(view), filters(view), findingsList(view), notReviewed(view), postPanel(view)];
  root.replaceChildren(...sections.filter((section) => section !== null));
}

function header(view: ReviewView) {
  return h(
    "header",
    { class: "header" },
    h(
      "div",
      { class: "row" },
      h("span", { class: "mono muted" }, view.pr),
      h("span", { class: `verdict ${view.verdict}` }, VERDICT_LABEL[view.verdict]),
      h("span", { class: "spacer" }),
      state.canFullscreen &&
        h("button", { class: "btn", type: "button", onclick: () => app.requestDisplayMode({ mode: "fullscreen" }) }, "⤢ Expand"),
      linkButton(view.url, "btn", "Open on GitHub ↗"),
    ),
    h("h1", {}, view.title),
    h(
      "div",
      { class: "row muted" },
      view.author && h("span", {}, `by ${view.author}`),
      h("span", { class: "mono" }, `${view.head} → ${view.base}`),
    ),
    view.summary && h("p", { class: "summary" }, view.summary),
  );
}

function filters(view: ReviewView) {
  const count = (s: Severity | "all") =>
    s === "all" ? view.findings.length : view.findings.filter((f) => f.severity === s).length;
  const chip = (s: Severity | "all") =>
    h(
      "button",
      {
        class: "chip",
        type: "button",
        "aria-pressed": String(state.filter === s),
        onclick: () => {
          state.filter = s;
          render();
        },
      },
      s === "all" ? "All" : SEVERITY[s],
      h("span", { class: "count" }, String(count(s))),
    );
  const important = view.findings.filter((f) => f.severity === "blocker" || f.severity === "major");

  return h(
    "div",
    { class: "row filters" },
    chip("all"),
    ...(Object.keys(SEVERITY) as Severity[]).filter((s) => count(s) > 0).map(chip),
    h("span", { class: "spacer" }),
    important.length > 0 &&
      h(
        "button",
        {
          class: "link-btn",
          type: "button",
          onclick: () => {
            for (const f of important) state.selected.add(f.id);
            render();
          },
        },
        "Select blockers and majors",
      ),
  );
}

function findingsList(view: ReviewView) {
  if (!view.findings.length) return h("div", { class: "empty" }, "No findings. The code looks good. 🎉");
  const visible = view.findings.filter((f) => state.filter === "all" || f.severity === state.filter);
  return h("div", { class: "findings" }, ...visible.map(card));
}

function card(f: ReviewFinding) {
  const selected = state.selected.has(f.id);
  return h(
    "article",
    { class: `card sev-${f.severity}${selected ? " selected" : ""}` },
    h(
      "div",
      { class: "card-head" },
      h("span", { class: "sev" }, SEVERITY[f.severity]),
      h("h3", { class: "card-title" }, f.title),
      h(
        "label",
        { class: "toggle", title: "Include this comment in the GitHub review" },
        h("input", {
          type: "checkbox",
          checked: selected,
          onchange: (e: Event) => {
            if ((e.target as HTMLInputElement).checked) state.selected.add(f.id);
            else state.selected.delete(f.id);
            render();
          },
        }),
        "Comment",
      ),
    ),
    h(
      "div",
      { class: "card-body" },
      linkButton(f.file_url, "link-btn mono", `${location(f)} ↗`),
      f.snippet.length > 0 && snippet(f),
      h("div", { class: "text" }, f.body),
      f.suggested_code && h("div", {}, h("div", { class: "label" }, "Suggested fix"), h("pre", { class: "fix" }, f.suggested_code)),
      references(f),
      selected && draftEditor(f),
    ),
  );
}

function snippet(f: ReviewFinding) {
  const first = f.start_line ?? f.line;
  const rows = f.snippet.map((line) =>
    h(
      "tr",
      { class: line.line >= first && line.line <= f.line ? "target" : line.added ? "added" : "" },
      h("td", { class: "num" }, String(line.line)),
      h("td", { class: "mark" }, line.added ? "+" : " "),
      h("td", {}, line.text),
    ),
  );
  return h("div", { class: "code" }, h("table", {}, h("tbody", {}, ...rows)));
}

function references(f: ReviewFinding) {
  const { practice, docs_url } = f;
  if (!practice && !docs_url) return null;
  const rule = practice && [h("b", {}, practice.id), practice.title ?? ""];
  return h(
    "div",
    { class: "row" },
    rule && (practice.docs ? linkButton(practice.docs, "ref", ...rule, " ↗") : h("span", { class: "ref" }, ...rule)),
    docs_url && linkButton(docs_url, "ref", "📘 Documentation ↗"),
  );
}

function draftEditor(f: ReviewFinding) {
  return h(
    "div",
    { class: "draft" },
    h("div", { class: "label" }, "GitHub comment"),
    h("textarea", {
      value: draftOf(f),
      spellcheck: true,
      oninput: (e: Event) => state.drafts.set(f.id, (e.target as HTMLTextAreaElement).value),
    }),
    f.in_diff
      ? h("div", { class: "hint" }, `Inline comment on ${location(f)}.`)
      : h("div", { class: "hint warn" }, "This line is outside the diff, so the comment goes to the review summary."),
  );
}

function notReviewed(view: ReviewView) {
  if (!view.not_reviewed.length) return null;
  return h(
    "div",
    { class: "box" },
    h("b", {}, "Not reviewed"),
    h("ul", {}, ...view.not_reviewed.map((file) => h("li", { class: "mono" }, file))),
  );
}

function postPanel(view: ReviewView) {
  const selected = view.findings.filter((f) => state.selected.has(f.id));
  const outside = selected.filter((f) => !f.in_diff).length;
  const empty = selected.length === 0 && !state.message.trim();
  const blocked = empty && state.event !== "APPROVE";

  if (state.phase === "done" && state.result) {
    const r = state.result;
    return h(
      "section",
      { class: "post" },
      h(
        "div",
        { class: "notice ok" },
        `Review posted: ${r.inline} inline comment(s)${r.in_summary ? `, ${r.in_summary} in the summary` : ""}. `,
        linkButton(r.url, "link-btn", "Open on GitHub ↗"),
      ),
    );
  }

  const segmented = h(
    "div",
    { class: "segmented", role: "group", "aria-label": "Review type" },
    ...(Object.keys(EVENT_LABEL) as ReviewEvent[]).map((event) =>
      h(
        "button",
        {
          type: "button",
          "aria-pressed": String(state.event === event),
          disabled: state.phase === "posting",
          onclick: () => {
            state.event = event;
            state.phase = "idle";
            render();
          },
        },
        EVENT_LABEL[event],
      ),
    ),
  );

  const actions =
    state.phase === "confirm"
      ? h(
          "div",
          { class: "notice confirm" },
          h(
            "div",
            {},
            `Publish a "${EVENT_LABEL[state.event]}" review on ${view.pr} with ${selected.length} comment(s)` +
              (outside ? `, ${outside} of them in the summary` : "") +
              "? Everyone with access to the repository will see it.",
          ),
          h(
            "div",
            { class: "row", style: "margin-top:8px" },
            h("button", { class: "btn primary", type: "button", onclick: () => post(view, selected) }, "Confirm and post"),
            h("button", { class: "btn", type: "button", onclick: () => ((state.phase = "idle"), render()) }, "Cancel"),
          ),
        )
      : h(
          "div",
          { class: "row" },
          h(
            "button",
            {
              class: "btn primary",
              type: "button",
              disabled: blocked || state.phase === "posting",
              onclick: () => ((state.phase = "confirm"), render()),
            },
            state.phase === "posting" ? "Posting…" : "Post review",
          ),
          h("span", { class: "muted" }, blocked ? "Select comments or write a message." : `${selected.length} comment(s) selected`),
        );

  return h(
    "section",
    { class: "post" },
    h("h2", {}, "Post to GitHub"),
    h("div", { class: "muted" }, "Nothing is published until you confirm. Select the comments you want with “Comment” on each finding."),
    segmented,
    h("textarea", {
      value: state.message,
      placeholder: "Review message (optional)",
      oninput: (e: Event) => (state.message = (e.target as HTMLTextAreaElement).value),
    }),
    state.phase === "error" && h("div", { class: "notice err" }, state.error),
    actions,
  );
}

async function post(view: ReviewView, selected: ReviewFinding[]) {
  state.phase = "posting";
  render();
  try {
    const result = await app.callServerTool({
      name: "post_review_comments",
      arguments: {
        pr: view.pr,
        head_sha: view.head_sha,
        event: state.event,
        body: state.message,
        comments: selected.map((f) => ({ path: f.path, line: f.line, start_line: f.start_line, body: draftOf(f) })),
      },
    });
    const text = result.content?.find((c) => c.type === "text")?.text ?? "";
    if (result.isError) throw new Error(text || "Posting failed.");

    state.result = result.structuredContent as unknown as PostedReview;
    state.phase = "done";
    await app.updateModelContext({ content: [{ type: "text", text: `The user posted the review to GitHub. ${text}` }] });
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    state.phase = "error";
  }
  render();
}

function applyHostContext(ctx: McpUiHostContext | undefined) {
  if (!ctx) return;
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.availableDisplayModes) state.canFullscreen = ctx.availableDisplayModes.includes("fullscreen");
}

app.ontoolinput = ({ arguments: args }) => {
  const pr = typeof args?.pr === "string" ? args.pr : "the pull request";
  root.replaceChildren(h("div", { class: "loading" }, `Preparing the review of ${pr}…`));
};

app.ontoolresult = (result) => {
  if (result.isError || !result.structuredContent) {
    const text = result.content?.find((c) => c.type === "text")?.text ?? "The review could not be loaded.";
    root.replaceChildren(h("div", { class: "notice err" }, text));
    return;
  }
  const view = result.structuredContent as unknown as ReviewView;
  state.view = view;
  state.event = EVENT_OF_VERDICT[view.verdict];
  render();
};

app.onhostcontextchanged = (ctx) => {
  applyHostContext(ctx);
  render();
};

await app.connect();
applyHostContext(app.getHostContext());
render();
