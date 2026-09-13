# Settings and the user interface

This document describes the settings of the plugin, where the values are stored,
which parts of the Settings screen are editable, and the work that a form needs.

## The settings namespace

The plugin registers a Host settings namespace with the name `tool-sourcegraph`.
It uses `ctx.settings.installSection()`. The namespace has six fields.

| Field | Schema role | Meaning |
|---|---|---|
| `endpoint` | plain | The base URL of the instance, without `/.api` |
| `apiToken` | `role('secret')` | A token that you type in directly. The settings provider removes it from each value that it sends to a browser and reports the field position as a secret instead. The stored document keeps the value |
| `tokenRef` | `role('credential-ref')` | The name of a credential that the plugin resolves through the credential seam |
| `maxMatches` | number | The largest number of matches to return. It also limits the `count:` argument of the tool |
| `maxCharsPerMatch` | number | The number of characters to return for each match |
| `search` | boolean | Whether the plugin registers the tool |

A stored value beats the composition entry for the same field. The plugin reads
the values for each request, so a change is active on the next tool call. No
reload of the plugin is necessary. For the token, `apiToken` beats `tokenRef`.

## Where the values live

| Layer | File | Notes |
|---|---|---|
| Composition entry | `~/.dsh/profiles/<profile>/cordis.patch.yml` | Part of the profile tree. This is the `base` layer of `installSection` |
| Stored user values | `~/.dsh/settings.yaml`, under `tool-sourcegraph:` | The document that the Settings screen and the settings API write |

`~/.dsh/settings.yaml` is a YAML map with a namespace for each key. Other
sections in the same file are `llm-pi-ai` and `agent-default-model`. You can write
the section directly:

```yaml
tool-sourcegraph:
  endpoint: https://bercastle.sourcegraph.app
  tokenRef: SOURCEGRAPH_TOKEN
```

A field that is absent uses the default from the schema, so a section can set only
the values that it changes.

## Change the values without a text editor

A browser can read and write each settings namespace through a Remote:

```
ctx.remote.settings.describe()                                  → every served namespace
ctx.remote.settings.update(ns, patch, expectedRevision)         → write one
```

The `expectedRevision` argument refuses an old write. It does not overwrite a
newer document. A form must send back the revision that it read.

Credentials use the same method. The Models page manages API keys with
`ctx.remote.credentials.describe(refs)`, `.set(ref, value)`, and `.unset(ref)`.

The button named Open configuration file in the header of the Settings screen
opens the file-backed settings document. It is a text editor, not a form.

## Why no form exists for these fields

The Settings screen of DSH has two tabs. Plugin configuration shows cards that you
can edit. Plugin list shows an inventory of the composed plugins, without controls.

This plugin appears under Plugin list as `tool-sourcegraph`, Enabled and Running.
It gives no card to Plugin configuration, so there is nothing to edit.

That is not a defect in the plugin. A plugin supplies its own cards. DSH does not
make them from schemas. In `dsh-client-ui-settings-plugins`:

- Plugin configuration shows the cards that are registered in the
  `settings.plugin.item` slot. The key of each card is the settings namespace that
  the card edits.
- A namespace that has no card is served but not shown.
  `ConfigurablePluginsTabController` intersects the group of served namespaces with
  the group of registered card keys and drops the rest.
- The cards that DSH ships are hand-written components for four namespaces: `bash`,
  `agent-loop`, `subagent-model-selection`, and `web-search-deepseek`.

No shipped settings package contains a general form builder. Each of the four
settings interfaces is written for its own namespace.

## A card is a supported extension point

The slot contract states this directly:

> Keying on the namespace is what lets a plugin distributed outside this
> repository contribute a card: it registers its own settings namespace on the
> Host and its own card under that key in the browser, and the tab pairs the two
> without ever learning what the namespace means.

The mechanism, `dsh-client-modules`, is a table of CommonJS factories that load
on demand. A client bundle is one script:

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

The `require` call resolves against a boot manifest, so shared packages are
available without a bundle of your own. The cards that DSH ships load
`@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-primitives`,
`@deepseek-ai/dsh-client-store`, `react`, and `react/jsx-runtime`.

The package needs three items to add a card:

1. A `dsh.client` block in the manifest:
   `{ "client": { "platform": "web", "inject": [...] } }`. The package
   `dsh-client-ui-settings-plugins` declares
   `["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-settings", "@deepseek-ai/dsh-api-remotes"]`.
2. A `./client` export that points to the built bundle.
3. A bundle in the factory format above.

The component is not the difficult part. The build target is. DSH makes its client
bundles with `tsdown`, and `dsh-client-modules` looks for the source-map trailer of
that tool. The format is a wrapped factory, not plain ESM. You can write a small
card by hand, but then this repository must maintain a bundle format that it does
not otherwise use.

## Options and their cost

| Option | What the user gets | Cost |
|---|---|---|
| Keep the settings on the Host only (the current state) | Values that you can change in `settings.yaml` and through the settings API. No form | None |
| Write the client bundle by hand | A card with fields for the endpoint and the secret | This repository must maintain a bundle format that it does not build with a toolchain. Each DSH upgrade needs a new test |
| Add `tsdown` and build the browser half | The same card, built in the same way as the DSH cards | A new build step, a second build pipeline in this repository, and a client bundle in `dist/` |
| Wait for a general form in DSH | Nothing to build | Not available today. It removes the need for the work |

None of these options blocks the model tool. The tool works with Host-only
settings, and `verification.md` records that state.

## The services the plugin consumes

The plugin declares four services in its `inject` list, and it waits for each one
before it loads.

| Service | The plugin uses it for |
|---|---|
| `tools` | To register `sourcegraph_search` |
| `credentials` | To resolve `tokenRef` for each request |
| `settings` | To own the namespace described above |
| `systemPrompt` | To register the `tool:sourcegraph_search` section that tells the agent to try this tool before it scans the filesystem |

The last one is not a settings concern, and it appears here because the plugin
fails to load when a service in the list is absent. A deployment that composes a
settings provider but not a system prompt leaves the plugin waiting.
