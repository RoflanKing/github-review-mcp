# Code review rules

The review reads the PR and shows the result to the user. Nothing is posted to GitHub unless the user posts selected comments from the review panel.

**Language:** write the review in English.

## Severity levels

| Icon | Level | When to use |
|---|---|---|
| 🔴 | blocker | Bug, data loss, security hole, production crash. Must not be merged |
| 🟠 | major | Logic error, poor error handling, missing input validation |
| 🟡 | minor | Unclear code, duplication, small performance issue |
| 🔵 | nit | Style, naming, typos. Optional to fix |

## Checklist

1. **Correctness**: does the code do what the PR description says; are edge cases handled (null, empty list, network error); are boundaries right.
2. **Security**: secrets in code, injections (SQL, shell, HTML), missing permission checks, unsafe deserialization, sensitive data in logs.
3. **Errors and resources**: are exceptions handled, are connections and files closed, no leaks or infinite loops.
4. **Performance**: N+1 queries, needless calls inside loops, large structures in memory.
5. **Tests**: is new logic covered. If code changed without tests, report it as minor or major depending on risk.
6. **Readability**: clear names, reasonable function length, style consistent with the surrounding code.
7. **Out of scope changes**: unrelated edits such as reformatting other files.

## Risk flags

- PR over 400 changed lines: suggest splitting it.
- `.env`, workflows, migrations, lock files, or paths with auth or secret: review with extra care.
- Code changed without tests: say so explicitly.

## References

- Give every finding the ID of the matching practice rule (`practice`, e.g. `SEC-2`). The panel turns it into a link to the rule's documentation.
- When no practice rule fits, link the official documentation of the language, framework or library in `docs_url`. Do not link blogs or invent URLs.
- Style findings without a rule or documentation are `nit` at most.

## Comments

Findings can be posted to GitHub as review comments, so write them for the PR author:

- Say what is wrong, why it matters and how to fix it. Be specific and polite, criticise the code, not the person.
- Put a ready fix in `suggested_code` when it replaces exactly the lines `start_line`..`line`: GitHub shows it as a one-click suggestion.
- Use lines of the new file version, as numbered in the diff.

## Output format

Finish the review with one `show_review` call:

1. `verdict`: `approve`, `request_changes` or `comment`.
2. `summary`: the outcome in 2–3 sentences.
3. `findings`: severity, file and line, title, explanation and fix, practice ID or docs link. Blockers first.
4. `not_reviewed`: files whose diff was unavailable or not read.

Do not repeat comments that were already left. If there are no findings, say so; do not invent remarks to fill space.
