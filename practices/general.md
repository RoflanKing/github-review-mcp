# General code quality

Language-agnostic rules for readable, maintainable changes.
Reference: [Google Engineering Practices: What to look for in a code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html)

## GEN-1 One change, one purpose
A PR does one thing. Unrelated refactoring, reformatting or dependency bumps go into separate PRs.
Docs: https://google.github.io/eng-practices/review/developer/small-cls.html

## GEN-2 Names say what, not how
Names describe the meaning of a value or the effect of a function (`unpaidInvoices`, `sendReminder`), not its type or implementation (`list2`, `doStuff`). Booleans read as questions: `isActive`, `hasAccess`.

## GEN-3 Small functions with one level of abstraction
A function that needs comments to separate its sections should be split. Prefer early returns over deep nesting.
Docs: https://refactoring.com/catalog/extractFunction.html

## GEN-4 No duplicated logic
The same rule implemented in two places will drift apart. Extract it once a third copy appears, or as soon as the copies must stay in sync.

## GEN-5 No magic values
Numbers and strings with meaning get a named constant: `MAX_RETRIES = 3`, not `3` in a loop condition.
Docs: https://refactoring.com/catalog/replaceMagicLiteral.html

## GEN-6 Comments explain why
Code shows what happens; comments explain intent, constraints and non-obvious decisions. Commented-out code is deleted, git keeps history.

## GEN-7 Keep the change consistent with the codebase
Follow the existing style, structure and libraries of the project, even when another approach is also fine.

## GEN-8 Dead code and leftovers
No unused imports, variables, debug logging, TODOs without a ticket, or temporary files in the PR.
