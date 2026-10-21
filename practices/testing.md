# Testing

Reference: [The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)

## TEST-1 New logic comes with tests
New behaviour and bug fixes come with tests in the same PR. A bug fix starts with a test that fails without the fix.

## TEST-2 Test behaviour, not implementation
Tests assert on outputs and observable effects, not on private functions or call order. Refactoring should not break them.

## TEST-3 Cover the edges
Besides the happy path: empty input, boundaries (0, 1, max), invalid input and error responses.

## TEST-4 Tests are deterministic
No real time, randomness, network or shared state without control. Fake the clock, seed randomness, isolate data.

## TEST-5 One reason to fail
Each test checks one behaviour and its name says which: `returns 404 when the invoice does not exist`.

## TEST-6 Do not weaken tests to make them pass
Deleted assertions, `skip`, raised timeouts or updated snapshots without explanation hide regressions.
