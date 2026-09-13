# Settings and the UI

What this plugin's settings are, where they live, what is and is not editable from
the Settings screen, and what it would take to add a form.

## The settings namespace

The plugin registers a Host settings namespace, `tool-sourcegraph`, through
`ctx.settings.installSection()`. Fields:

| Field | Schema role | Meaning |
|---|---|---|
| `endpoint` | plain | Instance base URL, without `/.api` |
| `apiToken` | `role('secret')` | Token entered directly. The settings provider strips it from every value handed to a browser and reports the field position as a secret instead; the stored document still holds it |
| `tokenRef` | `role('credential-ref')` | Name of a credential resolved through the credential seam |
| `maxMatches` | number | Upper bound on returned matches; also caps the tool's `count:` argument |
| `maxCharsPerMatch` | number | Returned-character budget per match |
| `search` | boolean | Whether to register the tool |

Precedence: a **stored** value beats the composition entry for the same field, and
reads happen per request — a change takes effect on the next tool call, with no
plugin reload. Within the token, `apiToken` beats `tokenRef`.

## Where values live

| Layer | File | Notes |
|---|---|---|
| Composition entry | `~/.dsh/profiles/<profile>/cordis.patch.yml` | Part of the profile tree; `installSection`'s `base` layer |
| Stored user values | `~/.dsh/settings.yaml`, under `tool-sourcegraph:` | The document the Settings screen and the settings API write |

`~/.dsh/settings.yaml` is a plain YAML map keyed by namespace, next to sections
like `llm-pi-ai` and `agent-default-model`. Writing the section directly is
supported:

```yaml
tool-sourcegraph:
  endpoint: https://bercastle.sourcegraph.app
  tokenRef: SOURCEGRAPH_TOKEN
```

An absent field inherits the schema default, so a section may set only what it
changes.

## Editing without hand-editing YAML

The browser can read and write any settings namespace over a Remote:

```
ctx.remote.settings.describe()                                  → every served namespace
ctx.remote.settings.update(ns, patch, expectedRevision)         → write one
```

`expectedRevision` refuses a stale write rather than overwriting a newer document,
so a form must send back the revision it read.

Credentials are exposed the same way, which is how the Models page manages API
keys: `ctx.remote.credentials.describe(refs)`, `.set(ref, value)`, `.unset(ref)`.

The **Open configuration file** button in the Settings header opens the
file-backed settings document — a text editor, not a form.

## Why there is no form for these fields yet

DSH's Settings screen has two tabs:

- **Plugin configuration** — editable cards.
- **Plugin list** — read-only inventory of the composed plugins.

This plugin appears on **Plugin list** as `tool-sourcegraph`, Enabled, Running.
It produces **no card** on **Plugin configuration**, so there is nothing to edit.

That is not a bug in the plugin. Cards are contributed by plugins, not generated
from schemas. In `dsh-client-ui-settings-plugins`:

- `Plugin configuration` renders whatever cards are registered into the
  `settings.plugin.item` slot, keyed by the settings namespace the card edits.
- A served namespace with **no card is served but unrendered**
  (`ConfigurablePluginsTabController` intersects the served namespace set with the
  registered card keys and drops the rest).
- The shipped cards are hand-written components for four specific namespaces:
  `bash`, `agent-loop`, `subagent-model-selection`, `web-search-deepseek`.

There is no generic schema-driven form renderer anywhere in the shipped settings
packages — each of the four settings UIs is bespoke.

## Adding a card is a supported extension point

The slot contract says so explicitly:

> Keying on the namespace is what lets a plugin distributed outside this
> repository contribute a card: it registers its own settings namespace on the
> Host and its own card under that key in the browser, and the tab pairs the two
> without ever learning what the namespace means.

The mechanism (`dsh-client-modules`) is a lazy CommonJS factory table. A client
bundle is a single script that does:

```js
window.__ModuleLoader__.load({
  id: 'dsh-tool-sourcegraph',
  factory: (require) => {
    const slots = require('@deepseek-ai/dsh-client-ui-slots')
    const React = require('react')
    // ... register into the 'settings.plugin.item' slot, key: 'tool-sourcegraph'
  },
})
```

Its `require` resolves against a boot manifest, so shared packages are available
without bundling them — the shipped cards pull
`@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-primitives`,
`@deepseek-ai/dsh-client-store`, `react`, and `react/jsx-runtime`.

To contribute one, the package needs:

1. a `dsh.client` manifest block — `{ "client": { "platform": "web", "inject": [...] } }`
   (`dsh-client-ui-settings-plugins` declares
   `["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-settings", "@deepseek-ai/dsh-api-remotes"]`);
2. a `./client` export pointing at the built bundle;
3. a bundle in that factory format.

The cost is not the component — it is the **build target**. DSH's own client
bundles are produced by `tsdown` (its source-map trailer is what
`dsh-client-modules` looks for), and the format is a wrapped factory, not plain
ESM. Hand-authoring one is possible for a small card, but it would be a
maintained exception to a toolchain we do not otherwise depend on.

## Options, with their real cost

| Option | What the user gets | Cost |
|---|---|---|
| Leave it Host-only (today) | Values editable via `settings.yaml` and the settings API; no form | none |
| Hand-authored client bundle | A real card with endpoint + secret fields | We own a bundle format we do not build with a toolchain; must re-verify on every DSH upgrade |
| Add `tsdown` and build the client half | Same, built the way DSH builds its own | A new build step, a second build pipeline in this repo, and a client bundle in `dist/` |
| Wait for a generic form in DSH | Nothing to build | Not available today; would remove the need entirely |

Nothing here blocks the model tool: the tool works with Host-only settings, and
that is the state recorded in `verification.md`.
