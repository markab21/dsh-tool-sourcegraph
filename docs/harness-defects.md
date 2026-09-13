# Harness defects found while auditing the DSH client

Four defects were found in the installed DeepSeek Harness client while auditing
the interface for stalls. Each one was verified by reading the shipped
`lib/client.js`, not inferred. Line numbers are from
`@deepseek-ai/dsh@0.1.5-rc.1`.

The paths below are abbreviated: `$D` is
`/Users/markberry/.dsh/profiles/node_modules/@deepseek-ai`, which is a symlink
farm into the dsh installation.

## D1. The composer can stop accepting Enter, with no way out

This is the most likely cause of a stall that looks like the interface stopped
responding.

`$D/dsh-client-ui-commands/lib/client.js:118`

```js
async ensureReady(sessionId, signal) {
    const entry = this.entry(sessionId);
    while (true) {
        if (entry.state === "ready") return entry.commands;
        if (entry.state !== "pending") this.refresh(sessionId);
        await settled(entry, signal);
        if (entry.state === "failed") throw new Error(`command directory warmup failed: ...`);
    }
}
```

The loop is not a spin. It parks on `settled(entry, signal)`. That promise resolves
only from `notifyWaiters(entry)` (`:152`), which runs in the `finally` of `refresh`
(`:106`). The chain is therefore:

- `refresh` awaits `this.fetchCommands(sessionId)` (`:95`).
- That call reaches `ctx.remote.commands.list(sessionId)`
  (`$D/dsh-client-ui-commands/lib/client.js:521`).
- The browser RPC path contains no deadline. `$D/dsh-api-gateway/lib/client.js`
  has **zero** occurrences of `setTimeout` or `AbortSignal.timeout`, and
  `$D/dsh-client-connection/lib/client.js:6195` calls `globalThis.fetch` with no
  timeout unless a test transport is installed.

So a `commands.list` request that never answers leaves `entry.state` at `pending`,
`refresh` never settles, `notifyWaiters` never runs, and `ensureReady` waits
forever.

The user-visible effect is in the conversation surface. `onEnter` returns early
while an attempt is in flight:

`$D/dsh-client-ui-conversation/lib/client.js:11687`

```js
onEnter(mode, draft) {
    if (this.phase === "adjudicating" || this.phase === "submitting") return [];
```

A draft that starts with `/` sets `phase = "adjudicating"` (`:11701`). The attempt
controller is created with no timeout (`:11649`), and the only thing that aborts
it is `onRelease()`, dispatched from shell disposal (`:13055`). Escape does not
abort it.

Result: every later Enter press is dropped silently. No error, no spinner. The
only recovery is a session switch or a page reload.

## D2. A stream that opens but never yields leaves the session loading forever

`$D/dsh-api-gateway/lib/client.js:1009`

```js
const first = await this.takeNext(iterator);
```

No deadline. `open()` sets the session to loading before this returns
(`$D/dsh-api-session-controller/lib/client.js:1985`). A host that accepts the
stream and then sends nothing leaves the view in that state.

The teardown path is also unbounded, which makes it worse:

`$D/dsh-api-gateway/lib/client.js:1059`

```js
dispose() {
    const done = this.done;
    const closing = (async () => {
        await this.stream.dispose();
        await done;
    })();
```

`done` is the background `consume` loop, which also has no deadline. A stuck
consumer makes disposal hang, and the session manager drains disposals in an
unbounded loop (`$D/dsh-api-session-controller/lib/client.js:2347`). A session
switch then never completes.

## D3. The chat transcript is not virtualized, while the trajectory view is

`$D/dsh-client-ui-chat/lib/client.js:2062`

```js
const ChatNodeList = (0, react.memo)(function ChatNodeList({ order, ...seatProps }) {
    return order.map((nodeKey) => (0, react_jsx_runtime.jsx)(ChatNodeSeat, {
        nodeKey, ...seatProps
    }, nodeKey));
});
```

`order` is every visible node in the loaded window (`:5618`), and each seat mounts
a real subtree (`:1613`). There is no virtualization in that package: a search for
`virtual` in `dsh-client-ui-chat/lib/client.js` returns nothing. The window itself
is not capped — `dsh-api-session-controller` pages 50 messages at a time and
`loadThrough` loops back toward sequence 0.

The sibling surface does it correctly, which shows the pattern exists in this
codebase: `$D/dsh-client-ui-trajectory/lib/client.js:5079` gates a real
virtualizer, with a threshold of 100 records and an overscan of 12.

## D4. Every appended node re-sorts the transcript and rebuilds two indexes

`$D/dsh-client-ui-chat/lib/client.js:5617`

```js
if (structural) {
    const next = orderedVisibleChatNodes(this.store.values()).map((node) => node.key);
    this.order = sameReferences$1(this.order, next) ? this.order : next;
    this.locations.rebuild(this.order, this.store);
}
```

A newly appearing node is always structural (`:5606`), so this runs for every tool
call and every assistant step. `orderedVisibleChatNodes` (`:5116`) filters, builds
presentations, and sorts — with a comparator that allocates objects and calls
`localeCompare`. `locations.rebuild` (`:4931`) is another full pass.

The cost is O(N log N) per append, so O(N²) across a long session. Text streaming
takes a cheaper content-only path, so this is per append and not per frame.

## D5. Tool-card models are recomputed on every render, over the whole result

`$D/dsh-client-ui-tool/lib/client.js:1401`

```js
function GenericToolCard({ toolName, block, cwd, home, openFile, inspect, t }) {
    const model = toolRowModel(toolName, block, cwd, home);
    const terminal = terminalCardModel(block, cwd);
    const read = readCardModel(block, cwd, home);
    ...
```

These run in the render body with no memo. `toolRowModel` calls `resultText`, which
flattens the entire tool result into one new string (`:857`), and `readCardModel`
scans that string with a regex (`:168`). A large bash or file result is therefore
copied and rescanned on each render, and a running tool row re-renders as its
output streams.

## Related: expanded terminal output renders every line

`$D/dsh-client-ui-tool/lib/client.js:1296` passes `maxLines: Infinity` to the
terminal block. The primitives implementation caps only when `maxLines` is finite,
so the full line array becomes one DOM element per line, with no
`content-visibility` in the chat or conversation stylesheets.

## What can be fixed from a plugin, and what cannot

D1 through D5 are all in shipped harness packages. Nothing in this plugin can
change how `dsh-client-ui-chat` sorts its nodes or how `dsh-api-gateway` waits for
a stream frame.

There is exactly one lever, and it is a real one. The transport is injectable:

`$D/dsh-client-connection/lib/client.js:6309`

```js
const transport = globalThis.__DSH_TRANSPORT__;
const rpc = fixtureRpc ?? createWebConnectionRpc(transport?.fetch, transport?.openStream);
```

A client plugin can install `globalThis.__DSH_TRANSPORT__.fetch` and wrap the real
`fetch` with a deadline. That turns D1 and D2 from a permanent hang into a failed
request, which the existing failure paths already handle — the composer reports a
warmup failure instead of ignoring Enter, and a stalled stream open rejects rather
than parking forever.

That is a mitigation, not a repair. It adds a bound where the code has none, which
is the correct shape for this class of bug, and it lives in a seam the harness
provides for exactly this purpose. The repair belongs in the harness.

The other four defects need upstream changes. They can also be patched locally, but
only by editing the installed harness outside this repository, which this project
does not do.
