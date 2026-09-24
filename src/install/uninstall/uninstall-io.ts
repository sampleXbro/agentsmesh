import { readLine } from '../prompts/prompt-io.js';
import type { PromptAdapter } from '../prompts/prompt-types.js';
import { writeOutput } from '../../utils/output/logger.js';

/** Uninstall names from `a,b c` style args; split from run-uninstall.ts for the 200-line limit. */
export function parseUninstallNames(args: readonly string[]): string[] {
  // Preserves duplicates so `planUninstall`'s `detectDuplicates` guard can
  // raise the documented "probably a typo or scripted-loop bug" error
  // instead of being silenced here.
  const out: string[] = [];
  for (const arg of args) {
    for (const part of arg
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      out.push(part);
    }
  }
  return out;
}

export function defaultUninstallAdapter(): PromptAdapter {
  return {
    ask: (prompt: string) => readLine(prompt),
    write: writeOutput,
  };
}
