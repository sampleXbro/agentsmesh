/** A config error must say which key is wrong, in both agentsmesh.yaml and agentsmesh.local.yaml. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, loadConfigFromExactDir } from '../../../src/config/core/loader.js';
import { ConfigValidationError } from '../../../src/core/errors.js';
import { logger } from '../../../src/utils/output/logger.js';
import { TARGET_IDS } from '../../../src/targets/catalog/target-ids.js';

const TARGET_HINT =
  `Invalid option: not one of the ${TARGET_IDS.length} supported values, ` +
  `e.g. "${TARGET_IDS[0]}"|"${TARGET_IDS[1]}"|"${TARGET_IDS[2]}"|… ` +
  '(full list: https://samplexbro.github.io/agentsmesh/reference/supported-tools/)';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'am-issues-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('names every wrong key and keeps the message short', async () => {
    const path = join(dir, 'agentsmesh.yaml');
    await writeFile(path, 'version: 1\ntargets: [claude-code, 42]\nfeatures: rules\n', 'utf-8');
    const err = await loadConfig(path).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConfigValidationError);
    const error = err as ConfigValidationError;
    expect(error.issues).toEqual([
      `targets[1]: ${TARGET_HINT}`,
      'features: Invalid input: expected array, received string',
    ]);
    expect(error.message).toBe(
      `Invalid config at ${path}: targets[1]: ${TARGET_HINT}; ` +
        'features: Invalid input: expected array, received string. Fix the YAML and try again.',
    );
  });
});

describe('loadConfigFromExactDir with a bad agentsmesh.local.yaml', () => {
  it('warns with the key path and falls back to the project config', async () => {
    await writeFile(
      join(dir, 'agentsmesh.yaml'),
      'version: 1\ntargets: [cursor]\nfeatures: [rules]\n',
      'utf-8',
    );
    const localPath = join(dir, 'agentsmesh.local.yaml');
    await writeFile(localPath, 'targets: [claude-code, 42]\n', 'utf-8');
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const { config } = await loadConfigFromExactDir(dir);

    expect(config.targets).toEqual(['cursor']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      `Ignoring invalid agentsmesh.local.yaml at ${localPath}: targets[1]: ${TARGET_HINT}. ` +
        'Using project config instead.',
    );
  });
});
