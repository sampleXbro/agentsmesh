/**
 * Aider target constants.
 *
 * Aider is an open-source AI pair programming tool (aider.chat).
 *
 *   - **Project config**: `CONVENTIONS.md` at project root + `.aider/skills/` + `.aiderignore`
 *   - **Global config**: `~/CONVENTIONS.md`, `~/.aider/skills/`, `~/.aiderignore`
 *
 * Aider reads `CONVENTIONS.md` as its primary instruction file. Non-root rules
 * are embedded in the same file. Skills are stored in `.aider/skills/`. Ignore
 * patterns go in `.aiderignore`.
 */

export const AIDER_TARGET = 'aider';

// Project-level paths
export const AIDER_CONVENTIONS = 'CONVENTIONS.md';
export const AIDER_SKILLS_DIR = '.aider/skills';
export const AIDER_IGNORE = '.aiderignore';
/**
 * Aider's config file. Loaded from the home directory, the git repo root and
 * the current directory (aider.chat/docs/config/aider_conf.html), so the same
 * relative path serves both scopes. It holds two agentsmesh projections: the
 * `read:` wiring for CONVENTIONS.md, which aider does not auto-discover
 * (project scope only — a home-level `read:` resolves against the working
 * directory), and the hook command keys.
 */
export const AIDER_CONF_FILE = '.aider.conf.yml';

// Global-level paths (user home directory)
export const AIDER_GLOBAL_CONVENTIONS = 'CONVENTIONS.md';
export const AIDER_GLOBAL_SKILLS_DIR = '.aider/skills';
export const AIDER_GLOBAL_IGNORE = '.aiderignore';

// Canonical paths
