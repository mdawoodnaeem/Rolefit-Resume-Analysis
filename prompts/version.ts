/**
 * Bump when a prompt changes in a way that should change output.
 *
 * This string is part of the analysis cache key, so bumping it invalidates
 * every cached result. That is deliberate: a prompt fix that kept serving
 * answers from the previous version would be effectively undebuggable.
 */
export const PROMPT_VERSION = 'v1'
