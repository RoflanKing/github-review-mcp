# Error handling and resources

## ERR-1 Do not swallow errors
An empty `catch`, or a `catch` that only logs and continues, hides failures. Handle the error, or let it propagate with context.

## ERR-2 Add context when rethrowing
Wrap low-level errors with what was being done and keep the original as the cause: `new Error("Loading invoice 42 failed", { cause: err })`.
Docs: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause

## ERR-3 Every promise is awaited or handled
A promise that is neither awaited nor given a `.catch` turns errors into unhandled rejections, which crash Node.js by default.
Docs: https://nodejs.org/api/process.html#event-unhandledrejection

## ERR-4 Handle the empty, missing and failing cases
Check null and undefined, empty collections, timeouts and non-2xx responses explicitly, not only the happy path.

## ERR-5 Release resources on every path
Files, connections, locks and timers are released in `finally` (or `using` / `with` / `defer`), so an error does not leak them.
Docs: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/try...catch

## ERR-6 Timeouts and retries for network calls
Outgoing requests have a timeout. Retries are limited, use backoff, and only repeat idempotent operations.
Docs: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static

## ERR-7 Errors users see are safe and useful
User-facing messages explain what to do next and never expose stack traces, SQL or internal paths.
