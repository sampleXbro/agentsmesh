import { readFileSync } from 'node:fs';
import { parse as parseToml } from 'smol-toml';
import { parse as parseYaml } from 'yaml';
import { readText, fileExists } from './assertions.js';

export function readToml(path: string): Record<string, unknown> {
  const parsed = parseToml(readText(path)) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Expected TOML object at ${path}`);
  }
  return parsed;
}

export function markdownFrontmatter(path: string): Record<string, unknown> {
  const content = readText(path);
  const body = /^---\n([\s\S]*?)\n---\n/.exec(content)?.[1];
  if (body === undefined) {
    throw new Error(`Expected YAML frontmatter in ${path}`);
  }
  const parsed = parseYaml(body) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Expected frontmatter object in ${path}`);
  }
  return parsed;
}

export function markdownHasNoFrontmatter(path: string): void {
  const content = readText(path);
  if (/^---\n/.test(content)) {
    throw new Error(`Expected plain markdown without YAML frontmatter in ${path}`);
  }
}

export function validToml(path: string): void {
  fileExists(path);
  try {
    parseToml(readFileSync(path, 'utf-8'));
  } catch (err) {
    throw new Error(
      `Invalid TOML at ${path}: ${err instanceof Error ? err.message : String(err)}`,
      {
        cause: err,
      },
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
