import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parsePermissions } from '../../../src/canonical/features/permissions.js';

const TEST_DIR = join(tmpdir(), 'agentsmesh-permissions-test');

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe('parsePermissions', () => {
  it('parses allow and deny arrays', async () => {
    const path = join(TEST_DIR, 'permissions.yaml');
    writeFileSync(
      path,
      `
allow:
  - Read
  - Grep
  - Write
deny:
  - Bash
`,
    );
    const result = await parsePermissions(path);
    expect(result).toEqual({
      allow: ['Read', 'Grep', 'Write'],
      deny: ['Bash'],
    });
  });

  it('leaves deny and ask unmanaged when only allow is present', async () => {
    const path = join(TEST_DIR, 'permissions.yaml');
    writeFileSync(
      path,
      `
allow:
  - Read
`,
    );
    const result = await parsePermissions(path);
    expect(result).toEqual({ allow: ['Read'] });
  });

  it('leaves allow and ask unmanaged when only deny is present', async () => {
    const path = join(TEST_DIR, 'permissions.yaml');
    writeFileSync(
      path,
      `
deny:
  - Bash
`,
    );
    const result = await parsePermissions(path);
    expect(result).toEqual({ deny: ['Bash'] });
  });

  it('returns null for an empty file: no list is managed', async () => {
    const path = join(TEST_DIR, 'permissions.yaml');
    writeFileSync(path, '');
    expect(await parsePermissions(path)).toBeNull();
  });

  it('returns null for the commented-out init template', async () => {
    const path = join(TEST_DIR, 'permissions.yaml');
    writeFileSync(path, '# allow:\n#   - Read\n# deny:\n#   - Bash\n');
    expect(await parsePermissions(path)).toBeNull();
  });

  it('returns null for non-existent file', async () => {
    const result = await parsePermissions(join(TEST_DIR, 'nope.yaml'));
    expect(result).toBeNull();
  });

  it('rejects for malformed YAML', async () => {
    const path = join(TEST_DIR, 'permissions.yaml');
    writeFileSync(path, 'allow: [broken: yaml');
    await expect(parsePermissions(path)).rejects.toMatchObject({ code: 'AM_CONFIG_INVALID' });
  });

  it('filters non-string entries in allow/deny', async () => {
    const path = join(TEST_DIR, 'permissions.yaml');
    writeFileSync(
      path,
      `
allow:
  - Read
  - 42
  - null
  - Grep
deny:
  - Bash
  - {}
`,
    );
    const result = await parsePermissions(path);
    expect(result).toEqual({
      allow: ['Read', 'Grep'],
      deny: ['Bash'],
    });
  });

  it('returns null when no key holds a list', async () => {
    const path = join(TEST_DIR, 'permissions.yaml');
    writeFileSync(path, 'allow: Read\ndeny: Bash');
    expect(await parsePermissions(path)).toBeNull();
  });

  it('leaves a key with no list unmanaged, so only real lists are managed', async () => {
    const path = join(TEST_DIR, 'permissions.yaml');
    writeFileSync(path, 'allow:\n#   - Read\ndeny:\n  - Bash\n');
    expect(await parsePermissions(path)).toEqual({ deny: ['Bash'] });
  });

  it('ignores keys other than allow, deny and ask', async () => {
    const path = join(TEST_DIR, 'permissions.yaml');
    writeFileSync(path, 'defaultMode: plan\nallow:\n  - Read\n');
    expect(await parsePermissions(path)).toEqual({ allow: ['Read'] });
    writeFileSync(path, 'defaultMode: plan\n');
    expect(await parsePermissions(path)).toBeNull();
  });

  it('keeps an explicit empty list managed', async () => {
    const path = join(TEST_DIR, 'permissions.yaml');
    writeFileSync(path, 'allow: []\n');
    expect(await parsePermissions(path)).toEqual({ allow: [] });
  });

  it('parses ask array', async () => {
    const path = join(TEST_DIR, 'permissions.yaml');
    writeFileSync(
      path,
      `
allow: []
deny: []
ask:
  - Write(/tmp/**)
`,
    );
    const result = await parsePermissions(path);
    expect(result).toEqual({
      allow: [],
      deny: [],
      ask: ['Write(/tmp/**)'],
    });
  });
});
