# Verification log

Evidence that this plugin works, and how each claim was checked. Kept because
"the row composes" and "the tool ran" are different claims, and only the second
one matters.

## 1. The row composes into a real profile

```sh
dsh --profile web --dump-config | grep -A4 tool-sourcegraph
```

```
# == dsh-tool-sourcegraph, patched by …/profiles/web/cordis.patch.yml
- id: tool-sourcegraph
  name: dsh-tool-sourcegraph
  config:
    endpoint: https://bercastle.sourcegraph.app
```

## 2. The installed artifact executes

Installing from the git URL and driving the registry directly — not `curl`:

```sh
dsh plugin --profile web add github:markab21/dsh-tool-sourcegraph
node .scratch/installed-check.mjs   # mounts the built plugin, dispatches a call
```

Returns `isError: false` with the model-facing content for a real query.

## 3. A real agent loop calls the tool

The claim that matters. A headless profile with the plugin installed, a model
credential, and a task requiring the tool:

```sh
DSH_HOME=/tmp/sg-agent dsh --profile agent --patch ./patch.yml \
  "Use the sourcegraph_search tool to find the function \
   EnforcePhysicalSideRoleIntegrity in repo github.com/bercastle/onscript_asr_service."
```

The agent answered `internal/diarize/final_role_audit.go:194`.

The session transcript is the proof, not the answer — a correct answer could
have come from anywhere. Decompressed (`session.v3.jsonl.zstd`), the log shows:

- the **request header's `tools[]` includes `sourcegraph_search`** — the model was
  offered it, so the plugin registered into the live tool set;
- an `assistant/message` carrying
  `{"type":"tool-call","name":"sourcegraph_search","arguments":"{\"query\":\"repo:github.com/bercastle/onscript_asr_service EnforcePhysicalSideRoleIntegrity\"}"}`;
- a `tool/result` whose envelope carries this plugin's untrusted-data notice and
  names `final_role_audit.go`.

`{"sourcegraph_search": 2}` tool calls in that session.

Inspect a transcript with:

```sh
python3 -c "
import zstandard, sys
print(zstandard.ZstdDecompressor().stream_reader(open(sys.argv[1],'rb')).read().decode())
" "$DSH_HOME"/sessions/*/session-*/session.v3.jsonl.zstd | grep sourcegraph_search
```

## 4. Settings drive the configuration

- Namespace `tool-sourcegraph` registers, and its `validate` hook is wired.
- A configuration source handed to the plugin **overrides the composition
  entry**: with the row set to `https://composed.example` and a source supplying
  `https://bercastle.sourcegraph.app`, the tool called the latter. The failure
  message named it — `cannot reach https://composed.example` when the source was
  wrong, then success once it was right.
- A token supplied through the `apiToken` field (with `tokenRef` empty)
  authenticated against a private instance: `isError: false`.

## Not yet verified

The tool executing **inside the interactive web session**. That requires the web
process to restart so the profile reloads with the plugin, and a fresh agent
session so the tool set is rebuilt. Everything above was checked without a
restart, which is why the headless profile stands in for it.
