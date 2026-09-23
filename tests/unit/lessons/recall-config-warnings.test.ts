/**
 * `lessons query` warns about a config.json it cannot fully use: a file that is
 * not a JSON object (such as `[]`), and a switch that is not true or false
 * (such as `"outcomeLog": "no"`), which used to fall back without a word.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lessonsConfigWarning } from '../../../src/lessons/recall-config.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-config-warn-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function writeConfig(content: string): void {
  mkdirSync(join(root, '.agentsmesh/lessons'), { recursive: true });
  writeFileSync(join(root, '.agentsmesh/lessons/config.json'), content);
}

describe('lessonsConfigWarning — shapes and switches', () => {
  it('treats a JSON array as a non-object', () => {
    writeConfig('[]');
    expect(lessonsConfigWarning(root)).toBe(
      'lessons config.json is not a JSON object — using built-in recall defaults.',
    );
  });

  it.each(['outcomeLog', 'telemetry', 'autoPrune'])(
    'warns when the switch %s is not true or false',
    (field) => {
      writeConfig(JSON.stringify({ [field]: 'no' }));
      expect(lessonsConfigWarning(root)).toBe(
        `lessons config.json has invalid ${field} (expected true or false) — using the default for it.`,
      );
    },
  );

  it('names every invalid field, numbers and switches alike', () => {
    writeConfig(JSON.stringify({ recallLimit: 'x', telemetry: 1, outcomeLog: 'no' }));
    expect(lessonsConfigWarning(root)).toBe(
      'lessons config.json has invalid recallLimit (expected a positive integer) — using the ' +
        'default for it. lessons config.json has invalid telemetry and outcomeLog (expected true ' +
        'or false) — using the default for them.',
    );
  });
});
