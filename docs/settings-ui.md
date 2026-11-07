# Settings and the user interface

This document describes the settings of the plugin, where the values are stored,
which parts of the Settings screen are editable, and the work that a form needs.

## The settings fields

The plugin's exported `Config` schema is the settings form. Since dsh 0.2 the
harness builds the form from the schema of each profile entry
(`ctx.settings.describe()`), so the plugin registers nothing itself. The entry
id is `tool-sourcegraph` and it has these fields:

| Field | Schema role | Meaning |
|---|---|---|
| `endpoint` | plain | The base URL of the instance, without `/.api` |
| `apiToken` | `role('secret')` | A token that you type in directly. The settings service removes it from each value that it sends to a browser |
| `tokenRef` | `role('credential-ref')` | The name of a credential that the plugin resolves through the credential seam |
| `maxMatches` | number | The largest number of matches to return. It also limits the `count:` argument of the tool |
| `maxCharsPerMatch` | number | The number of characters to return for each match |
| `search`, `fetch`, `repo` | boolean | Whether the plugin registers each tool |

A saved edit is written to the profile patch and reloads the plugin with the new
config. For the token, `apiToken` beats `tokenRef`.

## Where the values live

The values live in the profile patch, `~/.dsh/profiles/<profile>/cordis.patch.yml`,
under the `tool-sourcegraph` entry:

```yaml
- id: tool-sourcegraph
  config:
    endpoint: https://bercastle.sourcegraph.app
    tokenRef: SOURCEGRAPH_TOKEN
```

A field that is absent uses the default from the schema.

## The services the plugin consumes

| Service | The plugin uses it for |
|---|---|
| `tools` | To register the tools |
| `credentials` | To resolve `tokenRef` for each request |
| `systemPrompt` | To register the `tool:*` sections that tell the agent to try these tools before it scans the filesystem |

The plugin waits for each service in its `inject` list before it loads.
