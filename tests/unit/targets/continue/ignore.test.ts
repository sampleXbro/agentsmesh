/**
 * Tests for continue ignore: generateIgnore (generator), import round-trip
 * (project + global), and lintIgnore removal verification.
 */

import { AB_IGNORE } from '../../../../src/core/canonical-paths.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import { generateIgnore } from '../../../../src/targets/continue/generator.js';
import {
  CONTINUE_IGNORE,
  CONTINUE_GLOBAL_IGNORE,
} from '../../../../src/targets/continue/constants.js';
import { importFromContinue } from '../../../../src/targets/continue/importer.js';

function makeCanonical(overrides: Partial<CanonicalFiles> = {}): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
    ...overrides,
  };
}

const TEST_DIR = join(tmpdir(), 'am-continue-ignore-test');

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

// ---------------------------------------------------------------------------
// Generator tests
// ---------------------------------------------------------------------------

describe('generateIgnore (continue)', () => {
  it('returns [] when ignore array is empty', () => {
    const results = generateIgnore(makeCanonical({ ignore: [] }));
    expect(results).toEqual([]);
  });

  it('emits .continueignore at the project root with one pattern per line', () => {
    const results = generateIgnore(makeCanonical({ ignore: ['.env', 'node_modules/', 'dist/'] }));
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe(CONTINUE_IGNORE);
    expect(results[0]!.content).toBe('.env\nnode_modules/\ndist/');
  });

  it('emits exactly one output file for a single pattern', () => {
    const results = generateIgnore(makeCanonical({ ignore: ['secrets/'] }));
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe(CONTINUE_IGNORE);
  });

  it('emits the global ignore path when scope is global', () => {
    const results = generateIgnore(makeCanonical({ ignore: ['dist/'] }), { scope: 'global' });
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe(CONTINUE_GLOBAL_IGNORE);
  });

  it('emits the project ignore path when scope is project (explicit)', () => {
    const results = generateIgnore(makeCanonical({ ignore: ['dist/'] }), { scope: 'project' });
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe(CONTINUE_IGNORE);
  });

  it('returns [] for global scope when ignore array is empty', () => {
    const results = generateIgnore(makeCanonical({ ignore: [] }), { scope: 'global' });
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Import round-trip tests — project scope
// ---------------------------------------------------------------------------

describe('importFromContinue — ignore (project scope)', () => {
  it('imports .continueignore into canonical ignore file', async () => {
    writeFileSync(join(TEST_DIR, CONTINUE_IGNORE), '.env\nnode_modules/\ndist/');

    const results = await importFromContinue(TEST_DIR);
    const ignoreResult = results.find((r) => r.feature === 'ignore');
    expect(ignoreResult).toBeDefined();
    expect(ignoreResult!.fromTool).toBe('continue');
    expect(ignoreResult!.toPath).toBe(AB_IGNORE);
    const content = readFileSync(join(TEST_DIR, AB_IGNORE), 'utf-8');
    expect(content).toContain('.env');
    expect(content).toContain('node_modules/');
    expect(content).toContain('dist/');
  });

  it('does not emit an ignore result when .continueignore is absent', async () => {
    const results = await importFromContinue(TEST_DIR);
    const ignoreResult = results.find((r) => r.feature === 'ignore');
    expect(ignoreResult).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Import round-trip tests — global scope
// ---------------------------------------------------------------------------

describe('importFromContinue — ignore (global scope)', () => {
  it('imports .continue/.continueignore into canonical ignore file', async () => {
    mkdirSync(join(TEST_DIR, '.continue'), { recursive: true });
    writeFileSync(join(TEST_DIR, CONTINUE_GLOBAL_IGNORE), 'dist/\n*.log');

    const results = await importFromContinue(TEST_DIR, { scope: 'global' });
    const ignoreResult = results.find((r) => r.feature === 'ignore');
    expect(ignoreResult).toBeDefined();
    expect(ignoreResult!.fromTool).toBe('continue');
    expect(ignoreResult!.toPath).toBe(AB_IGNORE);
    const content = readFileSync(join(TEST_DIR, AB_IGNORE), 'utf-8');
    expect(content).toContain('dist/');
    expect(content).toContain('*.log');
  });

  it('does not emit an ignore result when global .continueignore is absent', async () => {
    const results = await importFromContinue(TEST_DIR, { scope: 'global' });
    const ignoreResult = results.find((r) => r.feature === 'ignore');
    expect(ignoreResult).toBeUndefined();
  });
});
