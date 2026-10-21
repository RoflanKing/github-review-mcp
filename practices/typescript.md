# TypeScript and JavaScript

Reference: [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)

## TS-1 No `any`
Use precise types, `unknown` plus narrowing for untrusted data, or generics. `any` silently disables type checking.
Docs: https://www.typescriptlang.org/docs/handbook/2/narrowing.html

## TS-2 Avoid non-null `!` and unchecked `as`
`value!` and `data as User` tell the compiler to trust you. Check the value, or validate data with a schema.
Docs: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-assertions

## TS-3 Keep `strict` on
`strict` mode (null checks, no implicit any) stays enabled; new `@ts-ignore` needs a comment explaining why.
Docs: https://www.typescriptlang.org/tsconfig/#strict

## TS-4 Model states with unions
Use discriminated unions instead of several optional flags that can contradict each other.
Docs: https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions

## TS-5 Run independent async work in parallel
Independent `await`s in a row run one after another. Use `Promise.all`, or `Promise.allSettled` when partial failure is fine.
Docs: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all

## TS-6 Strict equality and explicit checks
Use `===`. Do not use truthiness when `0` or `""` are valid values; check `=== undefined` or use `??`.
Docs: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing

## TS-7 Prefer `const` and immutable updates
`const` by default; do not mutate function arguments or shared objects, return new values instead.
