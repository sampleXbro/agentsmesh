/**
 * Rovo Dev custom commands — "saved prompts".
 *
 * Native format: a `prompts.yml` manifest (`{ prompts: [{ name, description,
 * content_file }] }`) plus one referenced markdown content file per prompt,
 * loaded relative to the `prompts.yml` location. Documented for BOTH scopes:
 *   - project (repo root): `.rovodev/prompts.yml`
 *   - global: `~/.rovodev/prompts.yml` ("global user prompts")
 *
 * https://support.atlassian.com/rovo/docs/save-and-reuse-a-prompt-in-rovo-dev-cli/
 *
 * Content files carry no frontmatter — Rovo Dev sends them to the model
 * verbatim as prompt text — so `description` lives only in the manifest and
 * canonical `allowedTools` has no equivalent slot (lost on generate, and left
 * untouched by re-import via the existing-frontmatter fallback).
 */

import { AB_COMMANDS } from '../../core/canonical-paths.js';
import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import { dirname, join } from 'node:path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import type { CanonicalFiles, ImportResult } from '../../core/types.js';
import { mkdirp, readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { serializeImportedCommandWithFallback } from '../import/import-metadata.js';
import {
  ROVODEV_TARGET,
  ROVODEV_COMMANDS_DIR,
  ROVODEV_COMMANDS_DIRNAME,
  ROVODEV_PROMPTS_FILE,
} from './constants.js';

export type RovodevPromptOutput = FeatureGeneratorOutput;

interface RovodevPromptEntry {
  name: string;
  description: string;
  content_file: string;
}

/** Generates `.rovodev/prompts.yml` + `.rovodev/commands/<name>.md` per canonical command. */
export function generateCommands(canonical: CanonicalFiles): RovodevPromptOutput[] {
  if (canonical.commands.length === 0) return [];

  const prompts: RovodevPromptEntry[] = canonical.commands.map((command) => ({
    name: command.name,
    description: command.description,
    content_file: `${ROVODEV_COMMANDS_DIRNAME}/${command.name}.md`,
  }));

  const outputs: RovodevPromptOutput[] = [
    { path: ROVODEV_PROMPTS_FILE, content: yamlStringify({ prompts }) },
  ];
  for (const command of canonical.commands) {
    const body = command.body.trim();
    outputs.push({
      path: `${ROVODEV_COMMANDS_DIR}/${command.name}.md`,
      content: body ? `${body}\n` : '',
    });
  }
  return outputs;
}

function parsePromptEntries(raw: string): Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = yamlParse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const prompts = (parsed as { prompts?: unknown }).prompts;
  if (!Array.isArray(prompts)) return [];
  return prompts.filter(
    (entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object',
  );
}

/** Imports canonical commands from a `prompts.yml` manifest at `promptsPath`. */
export async function importCommands(
  projectRoot: string,
  promptsPath: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
): Promise<void> {
  const promptsFile = join(projectRoot, promptsPath);
  const raw = await readFileSafe(promptsFile);
  if (raw === null) return;

  const promptsDir = dirname(promptsFile);
  for (const entry of parsePromptEntries(raw)) {
    const name = typeof entry.name === 'string' ? entry.name : null;
    const contentFile = typeof entry.content_file === 'string' ? entry.content_file : null;
    if (!name || !contentFile) continue;

    // `content_file` resolves relative to the `prompts.yml` location (docs: "Relative
    // to the prompts.yml file location" is tried first).
    const sourcePath = join(promptsDir, contentFile);
    const body = await readFileSafe(sourcePath);
    if (body === null) continue;

    const destDir = join(projectRoot, AB_COMMANDS);
    await mkdirp(destDir);
    const destPath = join(destDir, `${name}.md`);
    const hasDescription = Object.prototype.hasOwnProperty.call(entry, 'description');
    const content = await serializeImportedCommandWithFallback(
      destPath,
      {
        hasDescription,
        description: typeof entry.description === 'string' ? entry.description : undefined,
        hasAllowedTools: false,
        allowedTools: [],
      },
      normalize(body, sourcePath, destPath),
    );
    await writeFileAtomic(destPath, content);
    results.push({
      fromTool: ROVODEV_TARGET,
      fromPath: sourcePath,
      toPath: `${AB_COMMANDS}/${name}.md`,
      feature: 'commands',
    });
  }
}
