# Repository Guidelines

## Project Structure & Module Organization

`tshomo` is a framework-independent TypeScript ESM client for Clash-compatible APIs.
`src/index.ts` defines public exports; `src/client.ts` assembles the client.
Keep endpoint methods in `src/resources/`, shared HTTP and streaming behavior in
`src/transport/`, and external-data validation in `src/decode.ts`.
`test/` contains unit tests, local-server integration tests, browser tests, wire
fixtures, and public type checks. `examples/dashboard.ts` demonstrates usage.
`scripts/test-package.mjs` verifies the distributable; `dist/` is generated output.

## Build, Test, and Development Commands

Use Bun 1.4.4 and Node.js 22 or newer. Commit dependency changes with `bun.lock`.

- `bun install --frozen-lockfile`: install locked dependencies.
- `bun run build`: compile JavaScript, declarations, and source maps into `dist/`.
- `bun run typecheck`: check source, tests, and examples without emitting files.
- `bun run lint`: run ESLint and Prettier checks.
- `bun run format`: apply ESLint fixes and Prettier formatting.
- `bun run test`: run Vitest unit and integration tests.
- `bun run test:package`: build, pack, and verify imports, declarations, private
  exports, and browser bundling from a temporary consumer.
- `bun run test:browser`: build and run Playwright tests in Chromium, Firefox,
  and WebKit. Install browsers first with
  `bun run playwright install --with-deps chromium firefox webkit` on supported Linux systems.

## Coding Style & Naming Conventions

Use two-space indentation, single quotes, no semicolons, and trailing commas.
Keep code within 120 columns, use braces for control flow, and write one statement
per line. Separate the import block from the following code with a blank line, and
leave blank lines around function declarations and function-valued variables.
Use camelCase for values, PascalCase for types, and descriptive lowercase
file names such as `json-stream.ts`. Use `.js` extensions in relative ESM imports.
Validate `unknown` inputs; source lint rules reject `any`, type assertions, and
regex literals. Prefer structured parsing and maintainable shared abstractions.

## Type Discipline

- Keep `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `useUnknownInCatchVariables`, and unused-symbol checks enabled. Do not weaken
  compiler or lint settings to make a change pass.
- Do not use explicit or implicit `any`, type assertions, non-null assertions,
  `@ts-ignore`, or `@ts-nocheck`. Tests may use `as const` to preserve literals;
  source code must use inference, annotations, or `satisfies`. Use explained
  `@ts-expect-error` only for intentional negative test cases.
- Treat parsed JSON, socket payloads, errors, and unknown response fields as
  `unknown` until validated. Keep JSON parsing behind `parseJson`; do not let
  standard-library `any` escape into application code. Validate response data in
  `src/decode.ts` and keep unknown wire fields intact for caller-side narrowing.
- A type predicate is a runtime contract: check every required field and every
  present optional field declared by the target type, including nested values.
  Add decoder tests when adding or changing wire fields. Never use a predicate
  merely to convince the compiler.
- Preserve relationships between generic inputs and outputs. Decoder results
  determine response types; extension factories determine extension types. Do not
  replace those relationships with broad unions, `unknown`, or caller-selected
  return types without a decoder. Keep internal JSON request bodies typed as
  `JsonInput` and validate values at runtime where required.
- Specify iterator yield, return, and next types explicitly: client streams use
  `AsyncIterable<T, undefined, undefined>` and `IteratorResult<T, undefined>`.
  Narrow `done` before reading a yielded value. Avoid generic defaults that
  introduce `any` into the public API.
- Keep event names paired with their payload types, including in test doubles;
  use mapped types rather than casts through `never` or `unknown`.
- Add positive and negative checks in `test/types/public.ts` for public type
  changes. Verify published declarations with `bun run test:package`, as well as
  running `bun run typecheck` and `bun run lint`.

## Testing Guidelines

Name Vitest tests `*.test.ts` and browser tests `test/browser/*.spec.ts`.
Use local servers and fixtures for reproducible protocol tests. Cover changed
behavior, error handling, cancellation, and resource cleanup where applicable.
No coverage threshold is configured. Run typecheck, lint, unit, package, and
browser checks before submitting changes.

## Extension Philosophy

Keep the tshomo core independent of fork identities and fork-specific features. Do not add
fork registries, built-in marker detectors, or capability tables inferred from
backend branding. Preserve unknown response fields so callers can inspect their
own markers. Callers own detection, feature policy, custom endpoints, and response
decoders.

Expose custom operations through `client.extend(factory)` and the public
`ExtensionTransport`. Extensions must reuse the client's URL construction,
authentication, timeout, cancellation, error handling, and disposal rather than
accessing internal `HttpContext` or reimplementing HTTP. Keep extension types
inferred from their factories without expanding core capability enums. Extensions
do not mutate the client's built-in resources or automatically change capabilities.

Optional, published example extensions belong in `src/extensions/` and use explicit
package subpath exports. They may implement fork-specific behavior through the
public API, but must not import internal transport/decoder modules. Do not export
them from the core entry point or register them automatically. Document their
verified endpoint scope, source revision, and operation semantics, and test their
published imports and declarations as well as protocol behavior.
