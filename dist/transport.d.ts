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
/** Default deadline for one request, in milliseconds. */
export declare const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
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
export declare function installRequestDeadline(timeoutMs: number): () => void;
