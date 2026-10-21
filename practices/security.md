# Security

Reference: [OWASP Top 10](https://owasp.org/www-project-top-ten/) and the [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/).

## SEC-1 No secrets in code
Tokens, passwords and keys come from the environment or a secret manager, never from source, tests or committed config. A leaked secret must be rotated, deleting the commit is not enough.
Docs: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html

## SEC-2 Parameterized queries only
SQL is never built by string concatenation with user input. Use prepared statements or the query builder's parameters.
Docs: https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html

## SEC-3 No shell with user input
Run processes with an argument array (`execFile`, `spawn`) instead of a shell string (`exec`). Never interpolate user input into a command.
Docs: https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html

## SEC-4 Escape output, do not trust HTML
User content is rendered as text. `innerHTML`, `dangerouslySetInnerHTML` and template `|safe` need sanitized input.
Docs: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html

## SEC-5 Validate input at the boundary
Every external input (HTTP body, query, headers, files, env) is validated against an allow-list schema: type, length, range, format.
Docs: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html

## SEC-6 Check authorization on every request
Each endpoint checks that the current user may access this specific object, not only that they are logged in.
Docs: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html

## SEC-7 No sensitive data in logs
Logs never contain passwords, tokens, full card numbers or personal data. Log identifiers instead.
Docs: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

## SEC-8 Safe deserialization
Do not deserialize untrusted data into objects with behaviour (pickle, Java serialization, YAML full load). Parse into plain data and validate.
Docs: https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html
