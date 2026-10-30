import { describe, it, expect } from 'vitest';
import { parse as parseToml } from 'smol-toml';
import {
  serializeWarpSettings,
  parseWarpPermissions,
} from '../../../../src/targets/warp/permissions-toml.js';
import type { Permissions } from '../../../../src/core/types.js';

interface WarpProfiles {
  agent_mode_command_execution_allowlist?: string[];
  agent_mode_command_execution_denylist?: string[];
  agent_mode_coding_file_read_allowlist?: string[];
  agent_mode_coding_permissions?: string;
  [key: string]: unknown;
}

interface WarpSettings {
  agents?: { profiles?: WarpProfiles; [key: string]: unknown };
  [key: string]: unknown;
}

function profilesOf(content: string): WarpProfiles {
  return (parseToml(content) as WarpSettings).agents!.profiles!;
}

describe('serializeWarpSettings', () => {
  const permissions: Permissions = { allow: ['Bash(git status:*)'], deny: [] };

  it('writes the profile under [agents.profiles] in a fresh file', () => {
    const content = serializeWarpSettings(permissions, null)!;
    expect(Object.keys(parseToml(content) as WarpSettings)).toEqual(['agents']);
    expect(profilesOf(content)).toEqual({
      agent_mode_command_execution_allowlist: ['^git status(\\s.*)?$'],
    });
  });

  it('preserves unrelated top-level, [agents] and [agents.profiles] keys', () => {
    const existing = [
      'theme = "Dracula"',
      '[agents]',
      'cloud_conversation_storage_enabled = false',
      '[agents.profiles]',
      'agent_mode_execute_readonly_commands = true',
      'agent_mode_command_execution_allowlist = ["stale"]',
    ].join('\n');

    const content = serializeWarpSettings(permissions, existing)!;
    const parsed = parseToml(content) as WarpSettings;

    expect(parsed.theme).toBe('Dracula');
    expect(parsed.agents!.cloud_conversation_storage_enabled).toBe(false);
    expect(parsed.agents!.profiles!.agent_mode_execute_readonly_commands).toBe(true);
    expect(parsed.agents!.profiles!.agent_mode_command_execution_allowlist).toEqual([
      '^git status(\\s.*)?$',
    ]);
  });

  it('clears a revoked entry instead of re-emitting it (W1: grant then revoke)', () => {
    const granted = serializeWarpSettings({ allow: ['Bash(curl:*)'], deny: [] }, null)!;
    expect(profilesOf(granted).agent_mode_command_execution_allowlist).toEqual(['^curl(\\s.*)?$']);

    const revoked = serializeWarpSettings({ allow: ['Read(./src/**)'], deny: [] }, granted)!;
    expect(profilesOf(revoked).agent_mode_command_execution_allowlist).toEqual([]);
  });

  it('rewrites the owned keys when everything is revoked (W1: revoke everything)', () => {
    const granted = serializeWarpSettings(
      { allow: ['Bash(curl:*)', 'Read(./src/**)'], deny: ['Bash(rm:*)'] },
      'theme = "Dracula"',
    )!;

    const cleared = serializeWarpSettings({ allow: [], deny: [], ask: [] }, granted)!;
    const parsed = parseToml(cleared) as WarpSettings;

    expect(parsed.theme).toBe('Dracula');
    expect(parsed.agents!.profiles).toEqual({ agent_mode_command_execution_allowlist: [] });
  });

  it('starts a fresh document when the existing file is unparsable', () => {
    const parsed = parseToml(serializeWarpSettings(permissions, 'not = = toml')!) as WarpSettings;
    expect(Object.keys(parsed)).toEqual(['agents']);
  });

  it('returns null when there are no canonical permissions at all', () => {
    expect(serializeWarpSettings(null, 'theme = "Dracula"')).toBeNull();
  });

  it('leaves settings.toml alone when canonical is empty and owns no key there', () => {
    const empty: Permissions = { allow: [], deny: [], ask: [] };
    expect(serializeWarpSettings(empty, null)).toBeNull();
    expect(
      serializeWarpSettings(
        empty,
        '[agents.profiles]\nagent_mode_execute_readonly_commands = true\n',
      ),
    ).toBeNull();
  });
});

describe('serializeWarpSettings unmanaged lists', () => {
  const existing = [
    '[agents.profiles]',
    'agent_mode_command_execution_allowlist = ["^mine$"]',
    'agent_mode_command_execution_denylist = ["^rm$"]',
    'agent_mode_coding_file_read_allowlist = ["docs"]',
    'agent_mode_coding_permissions = "AlwaysAskBeforeReading"',
  ].join('\n');

  it('keeps the user deny list when permissions.yaml manages only allow', () => {
    const content = serializeWarpSettings({ allow: ['Bash(git status:*)'] }, existing)!;
    expect(profilesOf(content)).toEqual({
      agent_mode_command_execution_allowlist: ['^git status(\\s.*)?$'],
      agent_mode_command_execution_denylist: ['^rm$'],
    });
  });

  it('keeps the user allow keys when permissions.yaml manages only deny', () => {
    const content = serializeWarpSettings({ deny: ['Bash(curl:*)'] }, existing)!;
    expect(profilesOf(content)).toEqual({
      agent_mode_command_execution_allowlist: ['^mine$'],
      agent_mode_coding_file_read_allowlist: ['docs'],
      agent_mode_coding_permissions: 'AlwaysAskBeforeReading',
      agent_mode_command_execution_denylist: ['curl(\\s.*)?'],
    });
  });

  it('returns null when only ask is managed, since Warp reads no ask list', () => {
    expect(serializeWarpSettings({ ask: ['Write'] }, existing)).toBeNull();
  });
});

describe('parseWarpPermissions', () => {
  it('reads command lists, the read allowlist and always_allow_reading', () => {
    const content = [
      '[agents.profiles]',
      'agent_mode_coding_permissions = "always_allow_reading"',
      'agent_mode_coding_file_read_allowlist = ["./src/**"]',
      'agent_mode_command_execution_allowlist = ["^git status(\\\\s.*)?$", "^ls$"]',
      'agent_mode_command_execution_denylist = ["rm -rf(\\\\s.*)?"]',
    ].join('\n');

    expect(parseWarpPermissions(content)).toEqual({
      allow: ['Bash(git status:*)', 'Bash(ls)', 'Read', 'Read(./src/**)'],
      deny: ['Bash(rm -rf:*)'],
    });
  });

  it('round-trips a hand-written user regex byte for byte (W2)', () => {
    const settings = '[agents.profiles]\nagent_mode_command_execution_denylist = ["rm -rf .*"]\n';

    const imported = parseWarpPermissions(settings)!;
    expect(imported.deny).toEqual(['Bash(rm -rf .*)']);

    const regenerated = profilesOf(serializeWarpSettings(imported, settings)!);
    expect(regenerated.agent_mode_command_execution_denylist).toEqual(['rm -rf .*']);
    expect(
      new RegExp(regenerated.agent_mode_command_execution_denylist![0]!).test('rm -rf /'),
    ).toBe(true);
  });

  it('skips regexes with no command body', () => {
    const content = '[agents.profiles]\nagent_mode_command_execution_allowlist = ["^$", "^ls$"]';
    expect(parseWarpPermissions(content)).toEqual({ allow: ['Bash(ls)'], deny: [] });
  });

  it('returns null when there is no [agents.profiles] table or no entries', () => {
    expect(parseWarpPermissions('theme = "Dracula"')).toBeNull();
    expect(parseWarpPermissions('[agents]\nprofiles = 3')).toBeNull();
    expect(
      parseWarpPermissions('[agents.profiles]\nagent_mode_execute_readonly_commands = true'),
    ).toBeNull();
  });
});
