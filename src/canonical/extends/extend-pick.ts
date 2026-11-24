/**
 * Apply extends.pick filtering after feature filtering.
 */

import { basename } from 'node:path';
import type { ExtendPick } from '../../config/core/schema.js';
import type { CanonicalFiles } from '../../core/types.js';
import { logger } from '../../utils/output/logger.js';
import { applyFilesPick } from '../features/files/pick.js';

export function applyExtendPick(
  canonical: CanonicalFiles,
  features: string[],
  pick: ExtendPick | undefined,
  extendName: string,
): CanonicalFiles {
  if (!pick) return canonical;
  let next = { ...canonical };

  if (pick.skills?.length && features.includes('skills')) {
    const wanted = new Set(pick.skills);
    const prev = next.skills;
    next = { ...next, skills: prev.filter((s) => wanted.has(s.name)) };
    for (const n of pick.skills) {
      if (!prev.some((s) => s.name === n)) {
        logger.warn(
          `[agentsmesh] pick name "${n}" not found in skills from extend "${extendName}".`,
        );
      }
    }
  }

  if (pick.commands?.length && features.includes('commands')) {
    const wanted = new Set(pick.commands);
    const prev = next.commands;
    next = { ...next, commands: prev.filter((c) => wanted.has(c.name)) };
    for (const n of pick.commands) {
      if (!prev.some((c) => c.name === n)) {
        logger.warn(
          `[agentsmesh] pick name "${n}" not found in commands from extend "${extendName}".`,
        );
      }
    }
  }

  if (pick.agents?.length && features.includes('agents')) {
    const wanted = new Set(pick.agents);
    const prev = next.agents;
    next = { ...next, agents: prev.filter((a) => wanted.has(a.name)) };
    for (const n of pick.agents) {
      if (!prev.some((a) => a.name === n)) {
        logger.warn(
          `[agentsmesh] pick name "${n}" not found in agents from extend "${extendName}".`,
        );
      }
    }
  }

  if (pick.rules?.length && features.includes('rules')) {
    const wanted = new Set(pick.rules);
    const prev = next.rules;
    const stem = (src: string): string => basename(src).replace(/\.md$/i, '');
    next = {
      ...next,
      rules: prev.filter((r) => wanted.has(stem(r.source))),
    };
    for (const n of pick.rules) {
      if (!prev.some((r) => stem(r.source) === n)) {
        logger.warn(
          `[agentsmesh] pick name "${n}" not found in rules from extend "${extendName}".`,
        );
      }
    }
  }

  if (pick.files?.length && features.includes('files')) {
    next = {
      ...next,
      files: applyFilesPick(next.files ?? [], pick.files, extendName),
    };
  }

  return next;
}
