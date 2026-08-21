/**
 * Values shared between server and client.
 *
 * These cannot live in the modules that use them server-side: those import
 * `server-only`, and a client component importing one would fail the build.
 */

/** Upload ceiling. A text resume is orders of magnitude smaller; anything
 *  approaching this is an embedded image, which will not have a text layer. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024

/** Below this, an "extraction" almost certainly found no real text layer. */
export const MIN_MEANINGFUL_CHARS = 120
