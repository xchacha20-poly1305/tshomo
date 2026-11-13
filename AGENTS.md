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
- `bun run format`: apply Prettier formatting.
- `bun run test`: run Vitest unit and integration tests.
- `bun run test:package`: build, pack, and verify imports, declarations, private
  exports, and browser bundling from a temporary consumer.
- `bun run test:browser`: build and run Playwright tests in Chromium, Firefox,
  and WebKit. Install browsers first with
  `bun run playwright install --with-deps chromium firefox webkit` on supported Linux systems.

## Coding Style & Naming Conventions

Use two-space indentation, single quotes, no semicolons, and trailing commas.
Keep code within 120 columns, use braces for control flow, and write one statement
per line. Use camelCase for values, PascalCase for types, and descriptive lowercase
file names such as `json-stream.ts`. Use `.js` extensions in relative ESM imports.
Validate `unknown` inputs; source lint rules reject `any`, type assertions, and
regex literals. Prefer structured parsing and maintainable shared abstractions.

## Testing Guidelines

Name Vitest tests `*.test.ts` and browser tests `test/browser/*.spec.ts`.
Use local servers and fixtures for reproducible protocol tests. Cover changed
behavior, error handling, cancellation, and resource cleanup where applicable.
No coverage threshold is configured. Run typecheck, lint, unit, package, and
browser checks before submitting changes.

