import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  defaultLessonsConfig,
  lessonsConfigWarning,
  loadRecallConfig,
} from '../../../src/lessons/recall-config.js';
import { DEFAULT_RECALL_LIMIT, DEFAULT_RECALL_MAX_TOKENS } from '../../../src/lessons/ranking.js';
import { recallLessons } from '../../../src/lessons/recall.js';
import { saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-recall-cfg-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeConfig(content: string): void {
  mkdirSync(join(root, '.agentsmesh/lessons'), { recursive: true });
  writeFileSync(join(root, '.agentsmesh/lessons/config.json'), content);
}

describe('lessonsConfigWarning', () => {
  it('returns null when no config file exists', () => {
    expect(lessonsConfigWarning(root)).toBeNull();
  });

  it('returns null for a valid config', () => {
    writeConfig(JSON.stringify({ recallLimit: 3, recallMaxTokens: 200 }));
    expect(lessonsConfigWarning(root)).toBeNull();
  });

  it('warns on unparseable JSON', () => {
    writeConfig('not json');
    expect(lessonsConfigWarning(root)).toMatch(/not valid JSON/);
  });

  it('warns and names an invalid recall field', () => {
    writeConfig(JSON.stringify({ recallLimit: 0 }));
    const w = lessonsConfigWarning(root);
    expect(w).toMatch(/recallLimit/);
    expect(w).toMatch(/positive integer/);
  });

  it('warns when the JSON is valid but not an object', () => {
    writeConfig('42');
    expect(lessonsConfigWarning(root)).toMatch(/not a JSON object/);
  });

  it('treats JSON null as a non-object', () => {
    writeConfig('null');
    expect(lessonsConfigWarning(root)).toMatch(/not a JSON object/);
  });

  it('names an invalid recallMaxTokens', () => {
    writeConfig(JSON.stringify({ recallMaxTokens: -5 }));
    expect(lessonsConfigWarning(root)).toMatch(/recallMaxTokens/);
  });

  it('names both fields (and pluralizes) when both are invalid', () => {
    writeConfig(JSON.stringify({ recallLimit: 0, recallMaxTokens: 'x' }));
    const w = lessonsConfigWarning(root);
    expect(w).toMatch(/recallLimit and recallMaxTokens/);
    expect(w).toMatch(/them/);
  });

  it('does not change the silent loadRecallConfig fallback on a broken config', () => {
    writeConfig('not json');
    expect(loadRecallConfig(root)).toEqual({
      limit: DEFAULT_RECALL_LIMIT,
      maxTokens: DEFAULT_RECALL_MAX_TOKENS,
    });
  });

  it('loadRecallConfig falls back when the parsed config is valid JSON but not an object', () => {
    writeConfig('42');
    expect(loadRecallConfig(root)).toEqual({
      limit: DEFAULT_RECALL_LIMIT,
      maxTokens: DEFAULT_RECALL_MAX_TOKENS,
    });
  });
});

describe('defaultLessonsConfig', () => {
  it('materializes every tunable at the same default the readers fall back to', () => {
    expect(defaultLessonsConfig()).toEqual({
      recallLimit: DEFAULT_RECALL_LIMIT,
      recallMaxTokens: DEFAULT_RECALL_MAX_TOKENS,
      autoPrune: false,
      telemetry: false,
    });
  });

  it('round-trips: writing it out then loading yields the in-code recall defaults (no drift)', () => {
    writeConfig(JSON.stringify(defaultLessonsConfig()));
    expect(loadRecallConfig(root)).toEqual({
      limit: DEFAULT_RECALL_LIMIT,
      maxTokens: DEFAULT_RECALL_MAX_TOKENS,
    });
  });
});

describe('loadRecallConfig', () => {
  it('returns the built-in defaults when no config file exists', () => {
    expect(loadRecallConfig(root)).toEqual({
      limit: DEFAULT_RECALL_LIMIT,
      maxTokens: DEFAULT_RECALL_MAX_TOKENS,
    });
  });

  it('reads both overrides when present and valid', () => {
    writeConfig(JSON.stringify({ recallLimit: 5, recallMaxTokens: 250 }));
    expect(loadRecallConfig(root)).toEqual({ limit: 5, maxTokens: 250 });
  });

  it('falls back per-field: an absent field keeps its default', () => {
    writeConfig(JSON.stringify({ recallLimit: 3 }));
    expect(loadRecallConfig(root)).toEqual({
      limit: 3,
      maxTokens: DEFAULT_RECALL_MAX_TOKENS,
    });
  });

  it('ignores invalid values (non-positive, non-integer, wrong type) and uses the default', () => {
    writeConfig(JSON.stringify({ recallLimit: 0, recallMaxTokens: 'lots' }));
    expect(loadRecallConfig(root)).toEqual({
      limit: DEFAULT_RECALL_LIMIT,
      maxTokens: DEFAULT_RECALL_MAX_TOKENS,
    });
  });

  it('is resilient to malformed JSON (recall is a blocking hot path — never throw)', () => {
    writeConfig('{ this is not json');
    expect(loadRecallConfig(root)).toEqual({
      limit: DEFAULT_RECALL_LIMIT,
      maxTokens: DEFAULT_RECALL_MAX_TOKENS,
    });
  });

  it('recallLessons honors the per-project recallLimit (end-to-end wiring)', async () => {
    const graph: LessonsGraph = {
      version: 1,
      lessons: Object.fromEntries(
        ['a', 'b', 'c'].map((id) => [
          id,
          {
            rule: `Rule ${id}.`,
            topics: ['t'],
            triggers: ['t-glob'],
            evidence: [],
            status: 'active' as const,
            createdAt: '2026-06-01',
          },
        ]),
      ),
      topics: { t: { summary: 'T.' } },
      triggers: { 't-glob': { kind: 'file_glob', pattern: 'src/**/*.ts' } },
    };
    saveLessonsGraph(root, graph);

    const def = await recallLessons(root, { file: 'src/x.ts' });
    expect(def.lessons).toHaveLength(3); // default limit (10) returns all 3

    writeConfig(JSON.stringify({ recallLimit: 1 }));
    const capped = await recallLessons(root, { file: 'src/x.ts' });
    expect(capped.lessons).toHaveLength(1); // per-project cap applied
  });
});
