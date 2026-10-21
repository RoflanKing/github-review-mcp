# github-review-mcp

An MCP server for GitHub code review: the PRs waiting for your review, a guided review backed by coding practices,
and an interactive review panel in Claude Desktop where you choose which comments to post.

The model never writes to GitHub on its own. Comments are posted only when you confirm them in the panel.

The server runs over stdio: the client (Claude Code or Claude Desktop) starts it as a local process.

## Setup

```bash
npm install
npm run build
cp .env.example .env   # then put your token in .env
```

Token permissions:

- **Fine-grained token** (`github_pat_...`): Settings → Developer settings → Personal access tokens → Fine-grained tokens.
  Metadata and Contents: read. Pull requests: **read** to review, **read and write** to post comments from the panel.
- **Classic token** (`ghp_...`) with the `repo` scope. For organisation repositories with SSO, click **Configure SSO** on the token page.

A `GITHUB_TOKEN` already set in the environment wins over `.env`.

## Connect

Claude Code:

```bash
claude mcp add -s user github-review -- node /absolute/path/to/github-review-mcp/dist/index.js
```

Claude Desktop, in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "github-review": {
      "command": "node",
      "args": ["/absolute/path/to/github-review-mcp/dist/index.js"]
    }
  }
}
```

After code changes run `npm run build`, then reconnect: `/mcp` in Claude Code, quit with Cmd+Q and reopen in Desktop.

## How a review works

1. Ask "review owner/repo#123", or run the `review_pr` prompt.
2. `review_pull_request` returns the PR, risk flags, existing comments, the review rules and the practice rule index.
3. The model reads the whole diff (`get_pr_diff`), the surrounding code (`get_file`) and practice details (`get_practice`).
4. `show_review` opens the **review panel** in Claude Desktop:
   - verdict and summary, findings grouped by severity with filters;
   - the code lines of each finding, a link to the exact lines on GitHub;
   - the practice rule or documentation behind each finding;
   - a ready GitHub comment per finding, including a one-click `suggestion` when there is a fix. Tick **Comment**, edit the text if needed;
   - **Post to GitHub**: choose Comment, Request changes or Approve, then confirm.

Clients without MCP Apps (Claude Code in the terminal) get the review as text in the chat; posting is available only from the panel.

## Tools

`pr` is `owner/repo#123` or a pull request URL. Inside a project with a GitHub `origin` remote, `pr` can be just `123`.

| Tool | Arguments | Returns |
|---|---|---|
| `my_review_queue` | none | Open PRs by others where your review is requested, or you reviewed or commented |
| `review_pull_request` | `pr` | Starts a review: PR details, risk flags, comments, review rules, practice index, steps |
| `get_pr_diff` | `pr`, `path` (optional), `offset` (0) | Diff as plain text, 30,000 characters per page |
| `get_file` | `pr`, `path`, `start_line`, `end_line` | File from the PR branch with line numbers, 400 lines per call |
| `get_practice` | `topic` | A coding practice topic with documentation links |
| `show_review` | `pr`, `verdict`, `summary`, `findings`, `not_reviewed` | Opens the review panel |

The panel also uses `post_review_comments`, which is hidden from the model: only a click in the panel can call it.

## Prompts

Slash commands in Claude Code, the **+** menu in Claude Desktop:

```
/mcp__github-review__review_pr 123
/mcp__github-review__plan_my_reviews
```

## Resources

Attach with `@` in Claude Code or the **+** menu in Claude Desktop:

- `github://owner/repo/pull/123`: a PR from your review queue with metadata, risk flags, comments and the first diff page.
- `practices://security`, `practices://typescript`, …: coding practices.
- `review://rules`: the review rules.

## Customising

- `review-rules.md`: severity levels, checklist, references, comment style and the review language.
- `practices/*.md`: coding practices. Each rule is a `## ID Title` heading with an optional `Docs: <url>` line.
  Add a file to add a topic; findings cite rules by ID and the panel links to their docs.

Both are read on every call, no rebuild needed.

## Development

```bash
npm run build     # server (tsc) and review panel (ui/ bundled with esbuild)
npm run inspect   # MCP Inspector: call the tools by hand in the browser
```

## Limits

- `my_review_queue` reads up to 100 PRs per condition. Its `comments` count covers the conversation, not inline review comments.
- GitHub omits the diff for binary and very large files; such files are listed in the risk flags.
- Inline comments can only be placed on lines inside the diff. Others are added to the review summary.
- Inline comments come from the REST API, so their resolved state is not visible.
