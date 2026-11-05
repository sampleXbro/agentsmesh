/**
 * Canonical permissions <-> the `agent.tool_permissions` object in
 * `~/.config/zed/settings.json`. The merge half lives in permissions-merge.test.ts.
 */

import { describe, it, expect } from 'vitest';
import type { Permissions } from '../../../../src/core/types.js';
import {
  buildZedToolEntries,
  parseZedPermissions,
  unmappedPermissionEntries,
} from '../../../../src/targets/zed/permissions-settings.js';

function permissions(overrides: Partial<Permissions> = {}): Permissions {
  return { allow: [], deny: [], ask: [], ...overrides };
}

describe('buildZedToolEntries', () => {
  it('maps allow/deny/ask onto always_allow/always_deny/always_confirm', () => {
    const entries = buildZedToolEntries(
      permissions({
        allow: ['Bash(git status:*)'],
        deny: ['Edit(./.env)'],
        ask: ['Bash(git push:*)'],
      }),
    );
    expect(entries).toEqual({
      terminal: {
        always_allow: [{ pattern: '^git status(\\s.*)?$', case_sensitive: true }],
        always_confirm: [{ pattern: '^git push(\\s.*)?$', case_sensitive: true }],
      },
      edit_file: {
        always_deny: [{ pattern: '^\\./\\.env$', case_sensitive: true }],
      },
    });
  });

  it('maps a bare tool name to that tool default', () => {
    expect(
      buildZedToolEntries(permissions({ allow: ['Bash'], ask: ['Edit'], deny: ['Write'] })),
    ).toEqual({
      terminal: { default: 'allow' },
      edit_file: { default: 'confirm' },
      write_file: { default: 'deny' },
    });
  });

  it('never writes tool_permissions.default, which belongs to the user', () => {
    const entries = buildZedToolEntries(permissions({ allow: ['Bash'] }));
    expect(entries).not.toHaveProperty('default');
  });

  it('returns {} for null or empty canonical permissions, so revocation clears', () => {
    expect(buildZedToolEntries(null)).toEqual({});
    expect(buildZedToolEntries(permissions())).toEqual({});
  });

  it('skips entries Zed has no tool for', () => {
    expect(buildZedToolEntries(permissions({ allow: ['Read(./src/**)', 'Read'] }))).toEqual({});
  });

  it('de-duplicates repeated patterns inside one list', () => {
    const entries = buildZedToolEntries(permissions({ allow: ['Bash(ls)', 'Bash(ls)'] }));
    expect(entries.terminal!.always_allow).toHaveLength(1);
  });
});

describe('parseZedPermissions', () => {
  it('reads every list back into canonical lists', () => {
    const parsed = parseZedPermissions({
      agent: {
        tool_permissions: {
          default: 'allow',
          tools: {
            terminal: {
              default: 'deny',
              always_allow: [{ pattern: '^ls$' }],
              always_confirm: [{ pattern: '^git push(\\s.*)?$' }],
            },
            edit_file: { always_deny: [{ pattern: '^\\./\\.env$', case_sensitive: true }] },
          },
        },
      },
    });
    expect(parsed).toEqual({
      allow: ['Bash(ls)'],
      deny: ['Bash', 'Edit(./.env)'],
      ask: ['Bash(git push:*)'],
    });
  });

  it('skips tools and regexes it cannot express and returns null when nothing survives', () => {
    expect(
      parseZedPermissions({
        agent: {
          tool_permissions: {
            tools: {
              delete_path: { always_deny: [{ pattern: '^/etc$' }] },
              terminal: { always_allow: [{ pattern: 'sudo\\s' }, 'not-an-object'] },
            },
          },
        },
      }),
    ).toBeNull();
  });

  it('returns only the lists Zed sets', () => {
    const parsed = parseZedPermissions({
      agent: {
        tool_permissions: { tools: { terminal: { always_allow: [{ pattern: '^ls$' }] } } },
      },
    });
    expect(parsed).toEqual({ allow: ['Bash(ls)'] });
  });

  it('returns null when the agent key is missing or malformed', () => {
    expect(parseZedPermissions({})).toBeNull();
    expect(parseZedPermissions({ agent: 'nope' })).toBeNull();
    expect(parseZedPermissions({ agent: { tool_permissions: { tools: [] } } })).toBeNull();
  });
});

describe('unmappedPermissionEntries', () => {
  it('names the entries Zed has no permission tool for', () => {
    expect(
      unmappedPermissionEntries(
        permissions({ allow: ['Bash(ls)', 'Read(./src/**)'], deny: ['mcp__github__create_issue'] }),
      ),
    ).toEqual(['Read(./src/**)', 'mcp__github__create_issue']);
  });

  it('returns [] when everything maps', () => {
    expect(unmappedPermissionEntries(permissions({ allow: ['Bash(ls)'] }))).toEqual([]);
    expect(unmappedPermissionEntries(null)).toEqual([]);
  });
});
