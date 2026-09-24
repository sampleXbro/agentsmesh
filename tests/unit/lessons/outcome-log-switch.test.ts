/**
 * The outcome log is what repeat-failure detection reads, so it is ON by
 * default and has its own switch, separate from opt-in recall/capture telemetry.
 * It stays content-light: normalized keys and a normalized error class only.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  outcomeLogPath,
  readOutcomeLog,
  recordDelivered,
  recordFailure,
} from '../../../src/lessons/outcome-log.js';
import {
  isOutcomeLogEnabled,
  isTelemetryEnabled,
  OUTCOME_LOG_ENV,
  TELEMETRY_ENV,
} from '../../../src/lessons/telemetry.js';

const NO_ENV = {} as NodeJS.ProcessEnv;
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-outcome-switch-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function writeConfig(body: string): void {
  mkdirSync(join(root, '.agentsmesh', 'lessons'), { recursive: true });
  writeFileSync(join(root, '.agentsmesh', 'lessons', 'config.json'), body, 'utf8');
}

describe('isOutcomeLogEnabled', () => {
  it('is on by default — no config, no env', () => {
    expect(isOutcomeLogEnabled(NO_ENV, root)).toBe(true);
  });

  it('is independent of the opt-in telemetry switch', () => {
    writeConfig('{ "telemetry": false }');
    expect(isOutcomeLogEnabled(NO_ENV, root)).toBe(true);
    expect(isOutcomeLogEnabled({ [TELEMETRY_ENV]: '0' }, root)).toBe(true);
  });

  it('is off when config.json sets "outcomeLog": false', () => {
    writeConfig('{ "outcomeLog": false }');
    expect(isOutcomeLogEnabled(NO_ENV, root)).toBe(false);
  });

  it('stays on with a broken config file', () => {
    writeConfig('{ not json');
    expect(isOutcomeLogEnabled(NO_ENV, root)).toBe(true);
  });

  it('lets the env var win in both directions', () => {
    writeConfig('{ "outcomeLog": false }');
    expect(isOutcomeLogEnabled({ [OUTCOME_LOG_ENV]: '1' }, root)).toBe(true);
    writeConfig('{ "outcomeLog": true }');
    expect(isOutcomeLogEnabled({ [OUTCOME_LOG_ENV]: '0' }, root)).toBe(false);
  });

  it.each(['0', 'false', 'FALSE', 'no', 'off', ' off '])('env %j turns it off', (value) => {
    writeConfig('{ "outcomeLog": true }');
    expect(isOutcomeLogEnabled({ [OUTCOME_LOG_ENV]: value }, root)).toBe(false);
  });

  it.each(['1', 'true', 'Yes', 'on'])('env %j turns it on', (value) => {
    writeConfig('{ "outcomeLog": false }');
    expect(isOutcomeLogEnabled({ [OUTCOME_LOG_ENV]: value }, root)).toBe(true);
  });

  it.each(['', 'maybe', '2'])('env %j defers to the config', (value) => {
    writeConfig('{ "outcomeLog": false }');
    expect(isOutcomeLogEnabled({ [OUTCOME_LOG_ENV]: value }, root)).toBe(false);
  });
});

describe('isTelemetryEnabled — env words', () => {
  it.each([
    ['false', false],
    ['no', false],
    ['off', false],
    ['true', true],
    ['yes', true],
    ['on', true],
  ])('env %j → %s, whatever the config says', (value, expected) => {
    writeConfig(`{ "telemetry": ${String(!expected)} }`);
    expect(isTelemetryEnabled({ [TELEMETRY_ENV]: value }, root)).toBe(expected);
  });
});

describe('outcome writers follow the outcome-log switch, not telemetry', () => {
  it('records failures and deliveries with telemetry off', () => {
    recordFailure(root, 'cmd:pnpm test', 'error: boom', NO_ENV, 's1');
    recordDelivered(root, ['l1'], 'file:src/x.ts', NO_ENV, 's1');
    expect(readOutcomeLog(root).map((e) => e.kind)).toEqual(['failure', 'delivered']);
  });

  it('writes nothing when switched off in config', () => {
    writeConfig('{ "outcomeLog": false }');
    recordFailure(root, 'cmd:pnpm test', 'error: boom', NO_ENV, 's1');
    recordDelivered(root, ['l1'], 'file:src/x.ts', NO_ENV, 's1');
    expect(existsSync(outcomeLogPath(root))).toBe(false);
  });

  it('writes only the normalized fields, never anything else', () => {
    recordFailure(root, 'cmd:pnpm test', 'error: boom', NO_ENV, 's1');
    recordDelivered(root, ['l1'], 'file:src/x.ts', NO_ENV, 's1');
    const lines = readFileSync(outcomeLogPath(root), 'utf8')
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => Object.keys(JSON.parse(l) as object).sort());
    expect(lines).toEqual([
      ['contextKey', 'errorClass', 'kind', 'session', 'ts'],
      ['contextKey', 'kind', 'lessonId', 'rank', 'session', 'ts'],
    ]);
  });
});
