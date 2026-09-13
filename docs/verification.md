# Verification log

This file records the evidence that the plugin works, and the method used for each
claim. It exists because two different claims are easy to confuse. The first claim
is that the row composes into a profile. The second claim is that the tool runs
and returns a result. Only the second claim matters, and the checks below separate
them.

## 1. The row composes into a profile

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

## 2. The installed artifact runs

This check installs the package from the git URL and drives the registry directly.
It does not use `curl`.

```sh
dsh plugin --profile web add github:markab21/dsh-tool-sourcegraph
node .scratch/installed-check.mjs   # mounts the built plugin, dispatches a call
```

The call returns `isError: false` and the content that the model receives for a
real query.

## 3. An agent loop calls the tool

This is the claim that matters. The check uses a headless profile with the plugin
installed, a model credential, and a task that needs the tool.

```sh
DSH_HOME=/tmp/sg-agent dsh --profile agent --patch ./patch.yml \
  "Use the sourcegraph_search tool to find the function \
   EnforcePhysicalSideRoleIntegrity in repo github.com/bercastle/onscript_asr_service."
```

The agent answered `internal/diarize/final_role_audit.go:194`.

The answer alone is not proof, because the agent can find the answer in other
ways. The session transcript is the proof. The log is compressed, and it shows
three entries after you decompress `session.v3.jsonl.zstd`:

- The request header contains `sourcegraph_search` in its `tools[]` list. The
  model was offered the tool, so the plugin registered into the live tool set.
- An `assistant/message` entry contains the call:
  `{"type":"tool-call","name":"sourcegraph_search","arguments":"{\"query\":\"repo:github.com/bercastle/onscript_asr_service EnforcePhysicalSideRoleIntegrity\"}"}`.
- A `tool/result` entry carries the untrusted-data notice of this plugin and names
  `final_role_audit.go`.

The session contains `{"sourcegraph_search": 2}`, which means two calls.

To read a transcript, run:

```sh
python3 -c "
import zstandard, sys
print(zstandard.ZstdDecompressor().stream_reader(open(sys.argv[1],'rb')).read().decode())
" "$DSH_HOME"/sessions/*/session-*/session.v3.jsonl.zstd | grep sourcegraph_search
```

## 4. The settings control the configuration

- The namespace `tool-sourcegraph` registers, and the `validate` hook is
  connected.
- A configuration source that you give to the plugin beats the composition entry.
  With the row set to `https://composed.example` and a source that supplies
  `https://bercastle.sourcegraph.app`, the tool called the second address. The
  message named the address: `cannot reach https://composed.example` when the
  source was wrong, and success after the correction.
- A token in the `apiToken` field, with `tokenRef` empty, authenticated against a
  private instance. The call returned `isError: false`.

## 4a. The former gap, now closed

An earlier revision of this file had a section named "Not yet verified". It said
that the tool had not been shown running inside the interactive web session.
Section 6 closes that gap. The web interface was restarted with the plugin
installed, and the session transcript records the tool in the request header's
`tools[]` list with three calls.

The reason for the earlier gap is important, so it stays here. DSH builds the tool
set of a session when it creates that session. An installed plugin therefore does
not add a tool to a session that is already open. The profile must reload, and a
new agent session must start. The command `--dump-config` and the boot log do not
show the tool, which is why the headless profile stood in for the web session.

## 5. The credential resolves with nothing exported

The profile first used `tokenRef: SRC_ACCESS_TOKEN`. That name existed only in the
`.env` file of the project. A restarted dsh therefore resolved nothing, and the
private instance answered `401 Invalid access token`. The tool then used the
default endpoint without a warning, because the configuration of a bundle is only
what the patch layer states. The failure looked like a bad token against
`sourcegraph.com`.

The token is now stored under the reference that the plugin uses by default. The
file below is the file for this purpose:

```yaml
# ~/.dsh/.credentials.yaml  (mode 600)
refs:
  SOURCEGRAPH_TOKEN: <token>
```

The profile patch names that reference. The check was a headless agent run where
neither `SRC_ACCESS_TOKEN` nor `SOURCEGRAPH_TOKEN` was in the environment:

```
--- SRC_ACCESS_TOKEN set? NO | SOURCEGRAPH_TOKEN set? NO ---
**Tool call succeeded** — no error message was returned.
- github.com/bercastle/onscript_asr_service — cmd/asr-service/real_runner.go:2131
```

The order of resolution for a reference is the environment first, then the stored
`refs` map in `dsh-credentials-local`. An exported variable therefore wins when
one exists.

## 6. The tool runs inside the interactive web session

After the web interface restarted, the tool is part of the tool set of the session
and runs against the private instance. No environment variable was exported.

The session transcript records it in three ways:

```
transcript lines            : 2734
sourcegraph_search in tools[]: True
sourcegraph_search calls    : {'sourcegraph_search': 3}
```

The three calls cover each class of match that the tool handles.

| Query | Result |
|---|---|
| `repo:…/onscript_asr_service func failClosedDiarizationError count:3` | One content match at `cmd/asr-service/real_runner.go:2131` |
| The same repository with `patternType: structural` and `contextLines: 2` | Structural matches in `internal/obs/setup.go`, with two lines of context |
| `bercastle type:repo count:5` | Five repository matches, with the description of each repository |

Each call reported the instance as `https://bercastle.sourcegraph.app`, which is
the endpoint in the profile patch. The configuration in force is therefore the one
that the patch layer declares, and the credential came from
`~/.dsh/.credentials.yaml`.

To repeat the transcript check, run:

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
