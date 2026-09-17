/**
 * Link format registry contract.
 *
 * The registry centralizes the three pieces of "extension-shaped" data used by
 * the link rebaser: protected URI schemes, root-relative dotfile prefixes
 * (auto-derived from target descriptors), and canonical mesh-root segments.
 * Adding a new tool dotfile prefix should require zero edits in
 * `src/core/reference/`; adding a new URI scheme is a one-line plugin
 * registration.
 */

import { describe, it, expect } from 'vitest';
import {
  getLinkFormatRegistry,
  DEFAULT_MESH_ROOT_SEGMENTS,
} from '../../../../src/core/reference/link-format-registry.js';
import { BUILTIN_TARGETS } from '../../../../src/targets/catalog/builtin-targets.js';

describe('LinkFormatRegistry defaults', () => {
  it('always includes the canonical .agentsmesh/ prefix', () => {
    expect(getLinkFormatRegistry().rootRelativePrefixes).toContain('.agentsmesh/');
  });

  it('derives every built-in target dotfile prefix from descriptor metadata', () => {
    const prefixes = new Set(getLinkFormatRegistry().rootRelativePrefixes);
    const expected = new Set<string>(['.agentsmesh/']);
    for (const descriptor of BUILTIN_TARGETS) {
      const layouts = [descriptor.project, descriptor.globalSupport?.layout].filter(
        (l) => l !== undefined,
      );
      const candidatePaths = [
        ...descriptor.detectionPaths,
        ...layouts.flatMap((l) => l.managedOutputs?.dirs ?? []),
        ...layouts.flatMap((l) => l.managedOutputs?.files ?? []),
      ];
      for (const candidate of candidatePaths) {
        const top = candidate.split('/')[0];
        if (top && top.startsWith('.') && top.length > 1) expected.add(`${top}/`);
      }
    }
    for (const prefix of expected) {
      expect(prefixes, `missing ${prefix}`).toContain(prefix);
    }
  });

  it('exposes the canonical mesh-root segments verbatim', () => {
    expect(getLinkFormatRegistry().meshRootSegments).toEqual(DEFAULT_MESH_ROOT_SEGMENTS);
  });

  it('protected schemes match http://, ssh://, git@:, and email forms', () => {
    const { protectedSchemes } = getLinkFormatRegistry();
    const samples = [
      'https://example.com/x',
      'ssh://git@host/repo',
      'git@github.com:org/repo.git',
      'user@example.com',
    ];
    for (const sample of samples) {
      expect(
        protectedSchemes.some((re) => new RegExp(re.source, re.flags).test(sample)),
        `no protected-scheme pattern matches ${sample}`,
      ).toBe(true);
    }
  });
});
