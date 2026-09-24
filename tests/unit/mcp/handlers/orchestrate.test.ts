import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpContext } from '../../../../src/mcp/context.js';
import type { GenerateResult, ImportResult } from '../../../../src/core/types.js';
import type { ComputeDiffResult } from '../../../../src/core/differ.js';

// ─── mock public API ───────────────────────────────────────────────────────────

const mockGenerate = vi.fn<[unknown], Promise<GenerateResult[]>>();
const mockLint = vi.fn();
const mockDiff = vi.fn<[unknown], Promise<ComputeDiffResult & { results: GenerateResult[] }>>();
const mockImportFrom = vi.fn<[string, unknown], Promise<ImportResult[]>>();
const mockLoadProjectContext = vi.fn();

vi.mock('../../../../src/public/index.js', () => ({
  generate: mockGenerate,
  lint: mockLint,
  diff: mockDiff,
  importFrom: mockImportFrom,
  loadProjectContext: mockLoadProjectContext,
  TargetNotFoundError: class TargetNotFoundError extends Error {
    code = 'AM_TARGET_NOT_FOUND';
    target: string;
    constructor(target: string, opts?: { supported?: string[] }) {
      const suffix = opts?.supported ? ` Supported: ${opts.supported.join(', ')}.` : '';
      super(`Unknown target "${target}".${suffix}`);
      this.target = target;
      this.name = 'TargetNotFoundError';
    }
  },
}));

// ─── mock convert ─────────────────────────────────────────────────────────────

const mockRunConvert = vi.fn();

vi.mock('../../../../src/cli/commands/convert.js', () => ({
  runConvert: mockRunConvert,
}));

// ─── mock CLI generate (the MCP generate handler delegates to it) ─────────────

const mockRunGenerate = vi.fn();

vi.mock('../../../../src/cli/commands/generate.js', () => ({
  runGenerate: mockRunGenerate,
}));

// ─── import handler after mocks ───────────────────────────────────────────────

const { orchestrateHandlers } = await import('../../../../src/mcp/handlers/orchestrate.js');

// ─── helpers ──────────────────────────────────────────────────────────────────

const ctx: McpContext = {
  projectRoot: '/project',
  loadCanonical: vi.fn(),
};

const baseProjectContext = {
  config: { targets: ['claude-code'], features: ['rules'], pluginTargets: [] },
  canonical: {},
  projectRoot: '/project',
  scope: 'project' as const,
  configDir: '/project',
  canonicalDir: '/project/.agentsmesh',
};

function makeRunResult(
  files: Array<{ path: string; target: string; status: 'created' | 'updated' | 'unchanged' }>,
  summary: { created: number; updated: number; unchanged: number },
  lockWritten = true,
): { exitCode: number; data: unknown; lockWritten: boolean } {
  return { exitCode: 0, data: { scope: 'project', mode: 'generate', files, summary }, lockWritten };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadProjectContext.mockResolvedValue(baseProjectContext);
});

// ─── tests ────────────────────────────────────────────────────────────────────

describe('orchestrateHandlers.generate', () => {
  it('delegates to runGenerate and maps the written-file summary', async () => {
    mockRunGenerate.mockResolvedValue(
      makeRunResult(
        [
          { path: 'a.md', target: 'claude-code', status: 'created' },
          { path: 'b.md', target: 'cursor', status: 'updated' },
          { path: 'c.md', target: 'cursor', status: 'unchanged' },
        ],
        { created: 1, updated: 1, unchanged: 1 },
      ),
    );

    const out = await orchestrateHandlers.generate(ctx, {});

    expect(mockRunGenerate).toHaveBeenCalledWith({ 'dry-run': false }, '/project', {
      printMatrix: false,
    });
    expect(out.filesWritten).toBe(2);
    expect(out.byTarget['claude-code'].filesWritten).toBe(1);
    expect(out.byTarget['cursor'].filesWritten).toBe(1);
    expect(out.lockfileUpdated).toBe(true);
    expect(out.errors).toEqual([]);
    expect(out.warnings).toEqual([]);
    expect('files' in out).toBe(false);
  });

  it('reports lockfileUpdated=false for a dry_run, which writes no lock', async () => {
    mockRunGenerate.mockResolvedValue(
      makeRunResult([], { created: 0, updated: 0, unchanged: 0 }, false),
    );

    const out = await orchestrateHandlers.generate(ctx, { dry_run: true });

    expect(mockRunGenerate).toHaveBeenCalledWith({ 'dry-run': true }, '/project', {
      printMatrix: false,
    });
    expect(out.lockfileUpdated).toBe(false);
    expect(out.filesWritten).toBe(0);
  });

  it('includes the actionable file paths when verbose is true', async () => {
    mockRunGenerate.mockResolvedValue(
      makeRunResult([{ path: 'x.md', target: 'claude-code', status: 'created' }], {
        created: 1,
        updated: 0,
        unchanged: 0,
      }),
    );

    const out = await orchestrateHandlers.generate(ctx, { verbose: true });

    expect(out.files).toEqual(['x.md']);
  });

  it('forwards a non-empty targets filter as a comma list', async () => {
    mockRunGenerate.mockResolvedValue(makeRunResult([], { created: 0, updated: 0, unchanged: 0 }));

    await orchestrateHandlers.generate(ctx, { targets: ['claude-code', 'cursor'], dry_run: true });

    expect(mockRunGenerate).toHaveBeenCalledWith(
      { 'dry-run': true, targets: 'claude-code,cursor' },
      '/project',
      { printMatrix: false },
    );
  });

  it('omits the targets flag when input.targets is empty', async () => {
    mockRunGenerate.mockResolvedValue(makeRunResult([], { created: 0, updated: 0, unchanged: 0 }));

    await orchestrateHandlers.generate(ctx, { targets: [], dry_run: true });

    expect(mockRunGenerate).toHaveBeenCalledWith({ 'dry-run': true }, '/project', {
      printMatrix: false,
    });
  });

  it('throws IO_ERROR when runGenerate throws a generic error', async () => {
    mockRunGenerate.mockRejectedValue(new Error('some io failure'));

    await expect(orchestrateHandlers.generate(ctx, {})).rejects.toMatchObject({
      code: 'IO_ERROR',
    });
  });

  it('throws LOCK_HELD when the error message contains "lock"', async () => {
    mockRunGenerate.mockRejectedValue(new Error('Could not acquire generate lock'));

    await expect(orchestrateHandlers.generate(ctx, {})).rejects.toMatchObject({
      code: 'LOCK_HELD',
    });
  });

  it('throws VALIDATION_FAILED for an unknown target', async () => {
    mockRunGenerate.mockRejectedValue(
      new Error('Unknown target(s) in --targets: nope. Available: claude-code'),
    );

    await expect(orchestrateHandlers.generate(ctx, { targets: ['nope'] })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});

describe('orchestrateHandlers.lint', () => {
  it('returns issues from underlying lint result', async () => {
    mockLint.mockResolvedValue({
      diagnostics: [
        { level: 'error', file: 'rule.md', target: 'claude-code', message: 'missing heading' },
        { level: 'warning', file: 'cmd.md', target: 'cursor', message: 'long line' },
      ],
      hasErrors: true,
    });

    const out = await orchestrateHandlers.lint(ctx, {});

    expect(out.issues).toHaveLength(2);
    expect(out.issues[0]).toMatchObject({
      level: 'error',
      file: 'rule.md',
      target: 'claude-code',
      message: 'missing heading',
    });
  });

  it('filters by severity when input.severity is provided', async () => {
    mockLint.mockResolvedValue({
      diagnostics: [
        { level: 'error', file: 'a.md', target: 'claude-code', message: 'A' },
        { level: 'warning', file: 'b.md', target: 'claude-code', message: 'B' },
        { level: 'warning', file: 'c.md', target: 'cursor', message: 'C' },
      ],
      hasErrors: true,
    });

    const out = await orchestrateHandlers.lint(ctx, { severity: 'warning' });

    expect(out.issues).toHaveLength(2);
    expect(out.issues.every((i) => i.level === 'warning')).toBe(true);
  });

  it('wraps engine error via wrapEngineError', async () => {
    mockLint.mockRejectedValue(new Error('lint engine boom'));
    await expect(orchestrateHandlers.lint(ctx, {})).rejects.toMatchObject({ code: 'IO_ERROR' });
  });
});

describe('orchestrateHandlers.diff', () => {
  it('returns willCreate/willModify/willDelete from computeDiff result', async () => {
    mockDiff.mockResolvedValue({
      diffs: [],
      summary: { new: 3, updated: 1, unchanged: 5, deleted: 0 },
      results: [],
    });

    const out = await orchestrateHandlers.diff(ctx, {});

    expect(out.willCreate).toBe(3);
    expect(out.willModify).toBe(1);
    expect(out.willDelete).toBe(0);
  });

  it('forwards a non-empty targets filter', async () => {
    mockDiff.mockResolvedValue({
      diffs: [],
      summary: { new: 0, updated: 0, unchanged: 0, deleted: 0 },
      results: [],
    });
    await orchestrateHandlers.diff(ctx, { targets: ['cursor'] });
    expect(mockDiff).toHaveBeenCalledWith(expect.objectContaining({ targetFilter: ['cursor'] }));
  });

  it('wraps engine error via wrapEngineError', async () => {
    mockDiff.mockRejectedValue(new Error('diff boom'));
    await expect(orchestrateHandlers.diff(ctx, {})).rejects.toMatchObject({ code: 'IO_ERROR' });
  });
});

describe('orchestrateHandlers.import', () => {
  it('calls importFrom and returns mapped result', async () => {
    const importResults: ImportResult[] = [
      {
        fromTool: 'cursor',
        fromPath: '.cursorrules',
        toPath: '.agentsmesh/rules/root.md',
        feature: 'rules',
      },
    ];
    mockImportFrom.mockResolvedValue(importResults);

    const out = await orchestrateHandlers.import(ctx, { from: 'cursor' });

    expect(mockImportFrom).toHaveBeenCalledWith('cursor', {
      root: '/project',
      scope: 'project',
    });
    expect(out.imported).toBe(1);
    expect(out.files[0]).toMatchObject({
      fromPath: '.cursorrules',
      toPath: '.agentsmesh/rules/root.md',
      feature: 'rules',
    });
    expect(out.errors).toEqual([]);
  });

  it('rejects dry_run with VALIDATION_FAILED', async () => {
    await expect(
      orchestrateHandlers.import(ctx, { from: 'cursor', dry_run: true }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: expect.stringContaining('dry_run is not supported for import'),
    });
    expect(mockImportFrom).not.toHaveBeenCalled();
  });

  it('throws VALIDATION_FAILED for unknown target', async () => {
    const { TargetNotFoundError } = await import('../../../../src/public/index.js');
    mockImportFrom.mockRejectedValue(new TargetNotFoundError('unknown-target'));

    await expect(orchestrateHandlers.import(ctx, { from: 'unknown-target' })).rejects.toMatchObject(
      { code: 'VALIDATION_FAILED' },
    );
  });

  it('translates a regex-matched "unknown target" string error to VALIDATION_FAILED', async () => {
    mockImportFrom.mockRejectedValue(new Error('unknown target "nope"'));
    await expect(orchestrateHandlers.import(ctx, { from: 'nope' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('translates a regex-matched "not found" error to VALIDATION_FAILED', async () => {
    mockImportFrom.mockRejectedValue(new Error('Target descriptor not found for "x"'));
    await expect(orchestrateHandlers.import(ctx, { from: 'x' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('falls through to wrapEngineError for unrelated failures', async () => {
    mockImportFrom.mockRejectedValue(new Error('disk full'));
    await expect(orchestrateHandlers.import(ctx, { from: 'cursor' })).rejects.toMatchObject({
      code: 'IO_ERROR',
    });
  });
});

describe('orchestrateHandlers.convert', () => {
  it('calls runConvert and returns written count', async () => {
    mockRunConvert.mockResolvedValue({
      exitCode: 0,
      data: {
        from: 'cursor',
        to: 'claude-code',
        mode: 'convert',
        files: [],
        summary: { created: 2, updated: 1, unchanged: 0 },
      },
    });

    const out = await orchestrateHandlers.convert(ctx, { from: 'cursor', to: 'claude-code' });

    expect(mockRunConvert).toHaveBeenCalledWith(
      { from: 'cursor', to: 'claude-code', 'dry-run': false },
      '/project',
    );
    expect(out.filesAffected).toBe(3);
    expect(out.dryRun).toBe(false);
    expect(out.errors).toEqual([]);
    expect(out.warnings).toEqual([]);
  });

  it('throws VALIDATION_FAILED when convert error mentions unknown target', async () => {
    mockRunConvert.mockRejectedValue(
      new Error('Unknown --from "nope". Supported: cursor, claude-code.'),
    );

    await expect(
      orchestrateHandlers.convert(ctx, { from: 'nope', to: 'claude-code' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('passes dry_run=true through to runConvert flags', async () => {
    mockRunConvert.mockResolvedValue({
      exitCode: 0,
      data: {
        from: 'cursor',
        to: 'claude-code',
        mode: 'convert',
        files: [],
        summary: { created: 0, updated: 0, unchanged: 0 },
      },
    });

    const out = await orchestrateHandlers.convert(ctx, {
      from: 'cursor',
      to: 'claude-code',
      dry_run: true,
    });

    expect(out.dryRun).toBe(true);
    expect(mockRunConvert).toHaveBeenCalledWith(
      { from: 'cursor', to: 'claude-code', 'dry-run': true },
      '/project',
    );
  });

  it('falls through to wrapEngineError when convert fails for unrelated reason', async () => {
    mockRunConvert.mockRejectedValue(new Error('disk full'));
    await expect(
      orchestrateHandlers.convert(ctx, { from: 'cursor', to: 'claude-code' }),
    ).rejects.toMatchObject({ code: 'IO_ERROR' });
  });
});
