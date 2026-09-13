# dsh-tool-sourcegraph

Sourcegraph code search inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

The plugin exposes Sourcegraph's indexed code search to the agent loop as a
model tool, so the agent can find code across repositories it does not have on
disk — public code on `sourcegraph.com`, or a private/self-hosted instance.

> **Status: pre-implementation.** The repository holds project scaffolding, the
> bundle manifest, and the exploration notes only. No plugin code exists yet.
> See [`docs/kickoff.md`](docs/kickoff.md) for the design and open questions.

## What it will do

- Search Sourcegraph with its query syntax (`repo:`, `lang:`, `type:`, `file:`,
  boolean operators, `select:`), not a simplified subset.
- Return repository, path, line numbers, and surrounding lines so the agent can
  cite and reason about remote code.
- Reach a private instance with an access token, resolved through the Harness
  credential seam rather than read from the environment directly.

## Install (once implemented)

```sh
dsh plugin --profile web add dsh-tool-sourcegraph   # from the registry
dsh plugin --profile web add /path/to/this/checkout # local checkout
```

## Development

```sh
pnpm install
pnpm run build      # tsc -> dist/
pnpm run typecheck
pnpm run test
pnpm run check      # typecheck + test + build + publint + pack dry-run
```

The development loop against a live Harness is described in
[`docs/development.md`](docs/development.md).

## License

MIT
