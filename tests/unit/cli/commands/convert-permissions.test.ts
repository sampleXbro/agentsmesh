import { describe, it, expect, afterEach, vi } from 'vitest';
import { useTempProject } from '../../../helpers/temp-project.js';
import { runConvert } from '../../../../src/cli/commands/convert.js';

// Pi has no deny list. Converting it must not make Claude Code's own deny list
// managed (and so cleared): convert imports through runTargetImport.
const { root, write, read } = useTempProject('am-convert-perms-');

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('convert and permission lists', () => {
  it('keeps the target tool list that the source tool does not have', async () => {
    vi.stubEnv('HOME', root());
    vi.stubEnv('USERPROFILE', root());
    write('.pi/settings.json', JSON.stringify({ defaultTools: ['read'] }));
    write('.claude/settings.json', JSON.stringify({ permissions: { deny: ['Bash(rm:*)'] } }));

    await runConvert({ from: 'pi-agent', to: 'claude-code' }, root());

    const settings = JSON.parse(read('.claude/settings.json'));
    expect(settings.permissions).toEqual({ allow: ['Read'], deny: ['Bash(rm:*)'] });
  });
});
