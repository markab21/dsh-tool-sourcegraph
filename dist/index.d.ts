/**
 * Sourcegraph code search for the DeepSeek Harness.
 *
 * Registers `sourcegraph_search`, which runs a Sourcegraph query against a
 * public or self-hosted instance and returns the matches to the model. The
 * query is passed through untouched, so the full Sourcegraph query language
 * (`repo:`, `lang:`, `file:`, `type:`, boolean operators, `select:`) and every
 * `patternType`, including `structural`, are available.
 *
 * The access token is never a configuration value: configuration carries a
 * *reference* (an environment-variable name) that is resolved per request
 * through the harness credential seam. An unresolved reference means anonymous
 * access, which is what a public instance expects.
 *
 * @module dsh-tool-sourcegraph
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { SourcegraphError } from './client.js';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "tool-sourcegraph";
/** Services this plugin consumes. */
export declare const inject: string[];
/** Default instance when configuration names none. */
export declare const DEFAULT_ENDPOINT = "https://sourcegraph.com";
/** Default reference resolved for the access token. */
export declare const DEFAULT_TOKEN_REF = "SOURCEGRAPH_TOKEN";
/** Default number of matches returned in one call. */
export declare const DEFAULT_MAX_MATCHES = 30;
/** Default cap on characters returned for one match's matched lines. */
export declare const DEFAULT_MAX_CHARS_PER_MATCH = 600;
/** Plugin configuration. */
export interface Config {
    /** Instance base URL, without the `/.api` path. */
    endpoint: string;
    /** Environment-variable name resolved for the access token; empty means anonymous. */
    tokenRef: string;
    /** Upper bound on matches returned in one call. */
    maxMatches: number;
    /** Upper bound on returned characters per match. */
    maxCharsPerMatch: number;
    /** Whether to register the search tool. */
    search: boolean;
}
/** Configuration schema, projected into the profile tree's `config:` block. */
export declare const Config: z<Config>;
/**
 * Register the plugin's tools.
 *
 * @param ctx - the plugin context.
 * @param config - resolved plugin configuration.
 */
export declare function apply(ctx: Context, config: Config): void;
export { SourcegraphError };
