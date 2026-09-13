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

## 5. The credential resolves with nothing exported

The profile's earlier `tokenRef: SRC_ACCESS_TOKEN` only existed in the project's
`.env`, so a relaunched dsh resolved nothing and a private instance answered
`401 Invalid access token`. Worse, the tool then *silently used the default
endpoint*, because a bundle's config is only what the owning patch layer says —
so the failure looked like a bad token against `sourcegraph.com`.

The token is now stored under the reference the plugin defaults to, in the file
designed for it:

```yaml
# ~/.dsh/.credentials.yaml  (mode 600)
refs:
  SOURCEGRAPH_TOKEN: <token>
```

and the profile patch names that reference. Verified with a headless agent run
where **neither `SRC_ACCESS_TOKEN` nor `SOURCEGRAPH_TOKEN` was in the
environment**:

```
--- SRC_ACCESS_TOKEN set? NO | SOURCEGRAPH_TOKEN set? NO ---
**Tool call succeeded** — no error message was returned.
- github.com/bercastle/onscript_asr_service — cmd/asr-service/real_runner.go:2131
```

Resolution order for a reference is inherited environment first, then the stored
`refs` map (`dsh-credentials-local`), so an exported variable still wins when one
exists — storing it does not take that away.

## 6. Proven inside the interactive web session

After the web interface restarted, the tool is part of the session's tool set and
runs against the private instance with no environment variable exported.

The session transcript records it three ways:

```
transcript lines            : 2734
sourcegraph_search in tools[]: True
sourcegraph_search calls    : {'sourcegraph_search': 3}
```

Three calls, covering each match class the tool handles:

| Query | Result |
|---|---|
| `repo:…/onscript_asr_service func failClosedDiarizationError count:3` | one content match at `cmd/asr-service/real_runner.go:2131` |
| the same repo with `patternType: structural`, `contextLines: 2` | structural matches in `internal/obs/setup.go` with two context lines |
| `bercastle type:repo count:5` | five repository matches, description-bearing rows rendered as such |

Every call reported the instance as `https://bercastle.sourcegraph.app`, which is
the profile patch's endpoint — so the configuration in force is the one the patch
layer declares, and the credential resolved from `~/.dsh/.credentials.yaml`.

Reproduce the transcript check with:

```sh
python3 - "$DSH_HOME/sessions/"*/session-*/session.v3.jsonl.zstd <<'PY'
import json, sys, zstandard
raw = zstandard.ZstdDecompressor().stream_reader(open(sys.argv[1],'rb')).read().decode()
offered = calls = 0
for line in raw.splitlines():
    try: e = json.loads(line)
    except: continue
    if e.get('type') == 'request/header':
        tools = (e.get('data',{}).get('header',{}) or {}).get('tools') or []
        offered += any(isinstance(x,dict) and x.get('name')=='sourcegraph_search' for x in tools)
    if e.get('type') == 'tool/call' and e.get('data',{}).get('name') == 'sourcegraph_search':
        calls += 1
print('offered in tools[]:', bool(offered), '| calls:', calls)
PY
```
