/**
 * The import direction: `.aider.conf.yml` keys -> canonical hook entries.
 *
 * `auto-lint` defaults to true and `auto-test` to false in aider
 * (aider.chat/docs/config/aider_conf.html), so `lint-cmd` is read back unless
 * linting is switched off, while `test-cmd` is read back only when auto-test is
 * on — importing a command aider never runs would fabricate a hook. A key that
 * yields no entry is a key the config does not speak about, which is what keeps
 * the import merge in `hooks-import.ts` key-scoped.
 */

import { isRecord } from '../../utils/types/guards.js';
import type { HookEntry } from '../../core/hook-types.js';
import { AIDER_HOOK_KEYS, AIDER_LINT_MATCHER, type AiderCommandKey } from './hooks-format.js';

/** One canonical entry read back out of the config, tagged with its source key. */
export interface AiderImportedHook {
  readonly key: AiderCommandKey;
  readonly event: 'PostToolUse' | 'Notification';
  readonly entry: HookEntry;
}

/** Non-empty command strings from a scalar-or-list aider config value. */
function commandValues(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** True when the parsed config carries at least one agentsmesh-owned hook key. */
export function hasAiderHookKeys(conf: unknown): boolean {
  return isRecord(conf) && AIDER_HOOK_KEYS.some((key) => key in conf);
}

export function aiderConfToHookEntries(conf: unknown): AiderImportedHook[] {
  if (!isRecord(conf)) return [];
  const imported: AiderImportedHook[] = [];

  if (conf['auto-lint'] !== false) {
    for (const command of commandValues(conf['lint-cmd'])) {
      imported.push({
        key: 'lint-cmd',
        event: 'PostToolUse',
        entry: { matcher: AIDER_LINT_MATCHER, type: 'command', command },
      });
    }
  }
  if (conf['auto-test'] === true) {
    const [command] = commandValues(conf['test-cmd']);
    if (command !== undefined) {
      imported.push({
        key: 'test-cmd',
        event: 'PostToolUse',
        entry: { matcher: '*', type: 'command', command },
      });
    }
  }
  const [notify] = commandValues(conf['notifications-command']);
  if (notify !== undefined) {
    imported.push({
      key: 'notifications-command',
      event: 'Notification',
      entry: { matcher: '*', type: 'command', command: notify },
    });
  }
  return imported;
}
