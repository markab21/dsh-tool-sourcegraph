/**
 * Sourcegraph code search for the DeepSeek Harness.
 *
 * Registers `sourcegraph_search`, which runs a Sourcegraph query against a
 * public or self-hosted instance and returns the matches to the model. The
 * query is passed through untouched, so the full Sourcegraph query language
 * (`repo:`, `lang:`, `file:`, `type:`, boolean operators, `select:`) and every
 * `patternType`, including `structural`, are available.
 *
 * Settings are owned by a registered settings namespace, so the harness
 * configuration surface is the source of truth: a stored value overrides the
 * composition entry, and every read happens per request. Both halves of the
 * connection are editable there — `endpoint` is a plain field, and the secret is
 * offered two ways: `apiToken` is a `role('secret')` field the settings surface
 * redacts, and `tokenRef` names an environment variable resolved through the
 * credential seam. `apiToken` wins when both are set, and neither being
 * configured means anonymous access, which is what a public instance expects.
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
/** Settings namespace owning this plugin's configuration. */
export declare const SETTINGS_NS = "tool-sourcegraph";
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
    /**
     * Access token entered directly in a settings surface.
     *
     * Declared `role('secret')` so the settings provider strips it from every
     * value it hands to a browser and reports the field as a secret position
     * instead. The stored document still holds it, which is what lets the plugin
     * read it back per request.
     */
    apiToken: string;
    /** Environment-variable name resolved for the access token; empty means anonymous. */
    tokenRef: string;
    /** Upper bound on matches returned in one call. */
    maxMatches: number;
    /** Upper bound on returned characters per match. */
    maxCharsPerMatch: number;
    /** Whether to register the search tool. */
    search: boolean;
}
/**
 * Configuration schema, used for both the composition entry and the settings
 * namespace, so a stored value and a composed row validate identically.
 */
export declare const Config: z<Config>;
/**
 * Register the plugin's tools and settings namespace.
 *
 * The namespace is registered against the settings service when it is present,
 * which makes the stored document the source of truth: a saved value overrides
 * the composition entry, and `setSource` keeps the resolver pointed at the
 * resolved configuration. Without the service the composition entry stands
 * alone, so a deployment that does not compose settings still works.
 *
 * @param ctx - the plugin context.
 * @param config - the composition entry for this row.
 */
export declare function apply(ctx: Context, config: Config): void;
export { SourcegraphError };
