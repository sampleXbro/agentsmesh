/**
 * The placeholder body `agentsmesh init` scaffolds into a fresh
 * `.agentsmesh/rules/_root.md`.
 *
 * It lives here rather than beside the other CLI templates because two layers
 * need it: `init` writes it, and the root-rule import merge treats it as an
 * empty root so the first real import replaces the placeholder instead of
 * accumulating the user's rules underneath it.
 */
export const ROOT_RULE_PLACEHOLDER_BODY = `# Project Rules

Add your project-wide instructions here.
This file is always included in AI tool context and synced to all configured tools.`;
