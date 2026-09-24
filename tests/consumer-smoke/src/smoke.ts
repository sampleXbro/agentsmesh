/**
 * Consumer smoke test — must compile under strict TypeScript after installing
 * agentsmesh from a packed tarball. Exercises every public entrypoint.
 *
 * If any import below resolves to `any` (TS7016), `tsc --noEmit` fails. That is
 * the specific failure mode the behavioral audit missed pre-0.6.
 */

// Root barrel — the original TS7016 offender.
import {
  generate,
  importFrom,
  loadCanonical,
  loadCanonicalFiles,
  loadConfig,
  loadConfigFromDirectory,
  loadProjectContext,
  registerTargetDescriptor,
  getDescriptor,
  getAllDescriptors,
  getTargetCatalog,
  resolveOutputCollisions,
  lint,
  diff,
  check,
  computeDiff,
  formatDiffSummary,
  AgentsMeshError,
  ConfigNotFoundError,
  ConfigValidationError,
  TargetNotFoundError,
  ImportError,
  GenerationError,
  RemoteFetchError,
  LockAcquisitionError,
  FileSystemError,
  loadLessonsGraph,
  queryLessons,
  rankLessons,
  validateLessonsGraph,
  addLesson,
  mutateLessonsGraph,
  DEFAULT_RECALL_LIMIT,
} from 'agentsmesh';

import type {
  GenerateContext,
  GenerateResult,
  ImportResult,
  LoadCanonicalOptions,
  LoadProjectContextOptions,
  ProjectContext,
  AgentsMeshErrorCode,
  ValidatedConfig,
  TargetLayoutScope,
  LintOptions,
  LintResult,
  LintDiagnostic,
  ComputeDiffResult,
  DiffEntry,
  DiffSummary,
  CheckLockSyncOptions,
  LockSyncReport,
  CanonicalFiles,
  CanonicalRule,
  CanonicalCommand,
  CanonicalAgent,
  CanonicalSkill,
  SkillSupportingFile,
  Permissions,
  IgnorePatterns,
  McpServer,
  StdioMcpServer,
  UrlMcpServer,
  McpConfig,
  Hooks,
  HookEntry,
  TargetDescriptor,
  TargetLayout,
  TargetOutputFamily,
  TargetPathResolvers,
  TargetManagedOutputs,
  TargetLintHooks,
  FeatureLinter,
  RuleLinter,
  ScopeExtrasFn,
  ImportPathBuilder,
  GlobalTargetSupport,
  ExtraRuleOutputContext,
  ExtraRuleOutputResolver,
  GeneratedOutputMerger,
  TargetCapabilities,
  TargetGenerators,
  AddLessonInput,
  AddLessonResult,
  LessonsGraph,
  LessonsQuery,
  MatchedLesson,
  RankedLesson,
  ValidationReport,
} from 'agentsmesh';

// Subpath entrypoints — each must resolve to types, not `any`.
import {
  generate as generateFromSub,
  lint as lintFromSub,
  diff as diffFromSub,
  check as checkFromSub,
  loadConfig as loadConfigFromSub,
  loadProjectContext as loadProjectContextFromSub,
} from 'agentsmesh/engine';
import {
  loadCanonical as loadCanonicalFromSub,
  loadCanonicalFiles as loadCanonicalFilesFromSub,
} from 'agentsmesh/canonical';
import { getAllDescriptors as getAllFromSub } from 'agentsmesh/targets';
import {
  recallLessons as recallLessonsFromSub,
  captureLesson as captureLessonFromSub,
  type RecallResult as RecallResultFromSub,
} from 'agentsmesh/lessons';

async function exerciseRuntime(): Promise<void> {
  // loadConfig now returns a typed ValidatedConfig — no unknown cast required.
  const { config, configDir }: { config: ValidatedConfig; configDir: string } =
    await loadConfig('/tmp/noop');
  void configDir;
  const { config: configExact } = await loadConfigFromDirectory('/tmp/noop');
  void configExact;
  const { config: configSub } = await loadConfigFromSub('/tmp/noop');
  void configSub;

  const canonical: CanonicalFiles = await loadCanonical('/tmp/noop');
  const canonicalOptions: LoadCanonicalOptions = { includeExtends: false };
  const canonicalLocal: CanonicalFiles = await loadCanonical('/tmp/noop', canonicalOptions);

  const ctx: GenerateContext = {
    config,
    canonical,
    projectRoot: '/tmp/noop',
    scope: 'project' satisfies TargetLayoutScope,
  };

  const results: GenerateResult[] = await generate(ctx);
  const _resolved: GenerateResult[] = resolveOutputCollisions(results);

  const _fromSub: GenerateResult[] = await generateFromSub(ctx);
  const _canonicalFromSub: CanonicalFiles = await loadCanonicalFromSub('/tmp/noop');
  const _canonicalFilesFromSub: CanonicalFiles = await loadCanonicalFilesFromSub('/tmp/noop');
  const _descriptorsFromSub: readonly TargetDescriptor[] = getAllFromSub();
  const projectOptions: LoadProjectContextOptions = { scope: 'project' };
  const projectContext: ProjectContext = await loadProjectContext('/tmp/noop', projectOptions);
  const projectContextFromSub: ProjectContext = await loadProjectContextFromSub('/tmp/noop');

  const _imported: ImportResult[] = await importFrom('claude-code', {
    root: '/tmp/noop',
  });
  const _canonical2: CanonicalFiles = await loadCanonicalFiles('/tmp/noop');

  const _descriptors: readonly TargetDescriptor[] = getAllDescriptors();
  const _catalog: readonly TargetDescriptor[] = getTargetCatalog();
  const _descriptor: TargetDescriptor | undefined = getDescriptor('claude-code');

  // Lint — pure, returns diagnostics + hasErrors.
  const lintOpts: LintOptions = {
    config,
    canonical,
    projectRoot: '/tmp/noop',
    targetFilter: ['claude-code'],
    scope: 'project',
  };
  const lintResult: LintResult = await lint(lintOpts);
  const _diagnostics: readonly LintDiagnostic[] = lintResult.diagnostics;
  const _lintFromSub: LintResult = await lintFromSub(lintOpts);

  // Diff — runs generate internally, returns diff + results.
  const diffResult = await diff(ctx);
  const _diffEntries: readonly DiffEntry[] = diffResult.diffs;
  const _diffSummary: DiffSummary = diffResult.summary;
  const _diffResultsFromSub = await diffFromSub(ctx);
  void _diffResultsFromSub;

  // computeDiff — pure helper for users who already have results.
  const computed: ComputeDiffResult = computeDiff(results);
  const _summaryStr: string = formatDiffSummary(computed.summary);
  void _summaryStr;

  // Check — pure lock-vs-current report.
  const checkOpts: CheckLockSyncOptions = {
    config,
    configDir: '/tmp/noop',
    canonicalDir: '/tmp/noop/.agentsmesh',
  };
  const checkReport: LockSyncReport = await check(checkOpts);
  const _checkFromSub: LockSyncReport = await checkFromSub(checkOpts);
  const _lockConflict: boolean = checkReport.lockConflict;
  const _staleTargets: readonly string[] = checkReport.staleTargets;

  const lessonsGraph: LessonsGraph = loadLessonsGraph('/tmp/noop');
  const lessonsQuery: LessonsQuery = { file: 'src/x.ts', command: 'pnpm test' };
  const matchedLessons: MatchedLesson[] = queryLessons(lessonsGraph, lessonsQuery);
  const rankedLessons: RankedLesson[] = rankLessons(lessonsGraph, lessonsQuery, matchedLessons, {
    limit: DEFAULT_RECALL_LIMIT,
  });
  const lessonsValidation: ValidationReport = validateLessonsGraph(lessonsGraph);
  const lessonInput: AddLessonInput = {
    rule: 'Check the cause first',
    topic: 'example',
    triggers: { files: ['src/x.ts'], commands: ['pnpm test'] },
  };
  const addedLesson: AddLessonResult = await addLesson('/tmp/noop', lessonInput, {
    allowNewTopic: true,
    topicSummary: 'Example.',
  });
  const lessonCount: number = await mutateLessonsGraph(
    '/tmp/noop',
    (graph) => Object.keys(graph.lessons).length,
  );
  const recalledLessons: RecallResultFromSub = await recallLessonsFromSub('/tmp/noop', {
    keyword: 'shell quoting',
  });
  const capturedLesson: AddLessonResult = await captureLessonFromSub('/tmp/noop', lessonInput, {
    allowNewTopic: true,
    topicSummary: 'Example.',
  });

  void _fromSub;
  void _canonicalFromSub;
  void _canonicalFilesFromSub;
  void _descriptorsFromSub;
  void canonicalLocal;
  void projectContext;
  void projectContextFromSub;
  void _resolved;
  void _imported;
  void _canonical2;
  void _descriptors;
  void _catalog;
  void _descriptor;
  void _diagnostics;
  void _lintFromSub;
  void _diffEntries;
  void _diffSummary;
  void _checkFromSub;
  void _lockConflict;
  void _staleTargets;
  void checkReport;
  void lessonsGraph;
  void matchedLessons;
  void rankedLessons;
  void lessonsValidation;
  void addedLesson;
  void lessonCount;
  void recalledLessons;
  void capturedLesson;
  void lintResult;
  void diffResult;
  void computed;
}

function exerciseErrorTaxonomy(err: unknown): AgentsMeshErrorCode | null {
  if (err instanceof ConfigNotFoundError) return err.code;
  if (err instanceof ConfigValidationError) return err.code;
  if (err instanceof TargetNotFoundError) return err.code;
  if (err instanceof ImportError) return err.code;
  if (err instanceof GenerationError) return err.code;
  if (err instanceof RemoteFetchError) return err.code;
  if (err instanceof LockAcquisitionError) return err.code;
  if (err instanceof FileSystemError) return err.code;
  if (err instanceof AgentsMeshError) return err.code;
  return null;
}

// Exercise canonical type surface so each export is load-bearing.
function exerciseCanonicalTypes(
  _rule: CanonicalRule,
  _command: CanonicalCommand,
  _agent: CanonicalAgent,
  _skill: CanonicalSkill,
  _support: SkillSupportingFile,
  _perms: Permissions,
  _ignore: IgnorePatterns,
  _mcp: McpServer,
  _stdio: StdioMcpServer,
  _url: UrlMcpServer,
  _mcpConfig: McpConfig,
  _hooks: Hooks,
  _hookEntry: HookEntry,
): void {
  void _rule;
  void _command;
  void _agent;
  void _skill;
  void _support;
  void _perms;
  void _ignore;
  void _mcp;
  void _stdio;
  void _url;
  void _mcpConfig;
  void _hooks;
  void _hookEntry;
}

function exerciseTargetTypes(
  _descriptor: TargetDescriptor,
  _layout: TargetLayout,
  _scope: TargetLayoutScope,
  _family: TargetOutputFamily,
  _resolvers: TargetPathResolvers,
  _managed: TargetManagedOutputs,
  _lintHooks: TargetLintHooks,
  _featureLinter: FeatureLinter,
  _ruleLinter: RuleLinter,
  _scopeExtras: ScopeExtrasFn,
  _importPath: ImportPathBuilder,
  _globalSupport: GlobalTargetSupport,
  _extraRuleContext: ExtraRuleOutputContext,
  _extraRuleResolver: ExtraRuleOutputResolver,
  _outputMerger: GeneratedOutputMerger,
  _capabilities: TargetCapabilities,
  _generators: TargetGenerators,
): void {
  void _descriptor.globalSupport;
  // @ts-expect-error Legacy global fields are intentionally not public plugin API.
  void _descriptor.global;
  // @ts-expect-error Legacy global fields are intentionally not public plugin API.
  void _descriptor.globalCapabilities;
  // @ts-expect-error Legacy global fields are intentionally not public plugin API.
  void _descriptor.globalDetectionPaths;
  // @ts-expect-error Legacy global fields are intentionally not public plugin API.
  void _descriptor.generateScopeExtras;
  void _descriptor;
  void _layout;
  void _scope;
  void _family;
  void _resolvers;
  void _managed;
  void _lintHooks;
  void _featureLinter;
  void _ruleLinter;
  void _scopeExtras;
  void _importPath;
  void _globalSupport;
  void _extraRuleContext;
  void _extraRuleResolver;
  void _outputMerger;
  void _capabilities;
  void _generators;
}

// Register a descriptor so we're sure the plugin-side types compile too.
function exerciseRegistration(descriptor: TargetDescriptor): void {
  registerTargetDescriptor(descriptor);
}

export {
  exerciseRuntime,
  exerciseErrorTaxonomy,
  exerciseCanonicalTypes,
  exerciseTargetTypes,
  exerciseRegistration,
};
