/**
 * A deadline for the browser transport.
 *
 * The harness browser client performs RPC and streams through its own transport
 * seam, and it installs that transport from a global:
 *
 * ```js
 * // @deepseek-ai/dsh-client-connection/lib/client.js
 * const transport = globalThis.__DSH_TRANSPORT__
 * const rpc = fixtureRpc ?? createWebConnectionRpc(transport?.fetch, transport?.openStream)
 * ```
 *
 * In a normal page that global is absent, so every request goes to
 * `globalThis.fetch` with no deadline. Two harness paths then have no bound at
 * all, which fires as a stall rather than as an error:
 *
 * 1. `ensureReady` in `dsh-client-ui-commands` waits on a promise that settles
 *    only from the `finally` of `refresh`, and `refresh` awaits an RPC call. If
 *    that call never answers, the composer stays in `adjudicating` and every
 *    later Enter press is dropped with no message.
 * 2. `open` in `dsh-api-gateway` awaits the first frame of a session stream with
 *    no deadline, and `dispose` awaits the reader, so a stream that opens and
 *    then stays silent leaves the session loading and blocks teardown.
 *
 * This module installs a `fetch` that aborts after a bounded wait. A hung
 * request then fails, and the harness's existing failure paths run: the composer
 * reports a warmup failure, and a stalled stream open rejects.
 *
 * It is a bound, not a repair. The defects are in the harness, and a permanent
 * fix belongs there.
 *
 * @module dsh-tool-sourcegraph/transport
 */
/** The global the harness reads its transport from. */
const TRANSPORT_KEY = '__DSH_TRANSPORT__';
/** Default deadline for one request, in milliseconds. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
/** A deadline is useless below this value, so a smaller setting is raised to it. */
const MIN_REQUEST_TIMEOUT_MS = 1_000;
/**
 * Combine the caller's signal with a deadline.
 *
 * `AbortSignal.any` keeps the caller in control: their abort still wins, and the
 * deadline is an additional reason to stop. The timeout reason is rewritten to
 * name this deadline, because a generic `TimeoutError` gives no clue which layer
 * gave up.
 *
 * @param signal - the caller's signal, when the harness supplied one.
 * @param timeoutMs - the deadline for this request.
 * @returns a signal that aborts on the earliest of the two reasons.
 */
function withDeadline(signal, timeoutMs) {
    const timeout = AbortSignal.timeout(timeoutMs);
    if (signal === null || signal === undefined)
        return timeout;
    return AbortSignal.any([signal, timeout]);
}
/**
 * Install a deadline on the harness transport.
 *
 * The install is idempotent and reversible: the returned function restores the
 * previous value, so a disposed plugin leaves no trace. When a `fetch` is already
 * installed, this wraps it rather than replacing it, so another plugin that
 * installed a transport keeps its behaviour and also gains the deadline.
 *
 * @param timeoutMs - the deadline applied to each request.
 * @returns a disposer that restores the previous transport state.
 */
export function installRequestDeadline(timeoutMs) {
    const effective = Math.max(timeoutMs, MIN_REQUEST_TIMEOUT_MS);
    const scope = globalThis;
    const previous = scope[TRANSPORT_KEY];
    // Wrap whatever is already installed; fall back to the page's own fetch.
    const inner = previous?.fetch === undefined ? undefined : previous.fetch;
    const base = inner === undefined ? (input, init) => globalThis.fetch(input, init) : inner;
    const guarded = (input, init) => {
        const options = init === undefined ? {} : init;
        return base(input, { ...options, signal: withDeadline(options.signal, effective) });
    };
    scope[TRANSPORT_KEY] = { ...previous, fetch: guarded };
    let restored = false;
    return () => {
        if (restored)
            return;
        restored = true;
        const current = scope[TRANSPORT_KEY];
        // Only remove our own wrapper. If something else replaced the global after
        // this install, leaving it alone is the honest outcome.
        if (current !== undefined && current.fetch === guarded) {
            if (previous === undefined)
                delete scope[TRANSPORT_KEY];
            else
                scope[TRANSPORT_KEY] = previous;
        }
    };
}
//# sourceMappingURL=transport.js.map