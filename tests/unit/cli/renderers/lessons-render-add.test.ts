import { describe, expect, it } from 'vitest';
import type { LessonsAddData } from '../../../../src/cli/commands/lessons-types.js';
import { renderLessons } from '../../../../src/cli/renderers/lessons.js';
import { useCapturedOutput } from './renderer-test-helpers.js';

const base: LessonsAddData = {
  id: 'c-seed',
  isNewLesson: false,
  isNewTopic: false,
  newTriggerIds: [],
  changes: [],
  warnings: [],
};

describe('renderLessons — add upsert', () => {
  const output = useCapturedOutput();

  it('says "(no change)" only when nothing changed', () => {
    renderLessons({ subcommand: 'add', exitCode: 0, data: base });
    expect(output.stdout()).toContain('Existing lesson: c-seed (no change)');
  });

  it('lists what an upsert changed', () => {
    renderLessons({
      subcommand: 'add',
      exitCode: 0,
      data: { ...base, changes: ['scope set to always', 'evidence added: commit:abc'] },
    });
    expect(output.stdout()).toContain(
      'Updated lesson: c-seed — scope set to always; evidence added: commit:abc',
    );
    expect(output.stdout()).not.toContain('no change');
  });

  it('prints a dropped dead command trigger as a warning', () => {
    renderLessons({
      subcommand: 'add',
      exitCode: 0,
      data: {
        ...base,
        isNewLesson: true,
        warnings: [{ code: 'DEAD_COMMAND_PATTERN', message: 'dropped "(?<=a)b".' }],
      },
    });
    expect(output.stdout()).toContain('Added lesson: c-seed');
    expect(output.stderr()).toContain('DEAD_COMMAND_PATTERN: dropped "(?<=a)b".');
  });
});
