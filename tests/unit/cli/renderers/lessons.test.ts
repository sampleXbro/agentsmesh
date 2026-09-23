import { describe, expect, it } from 'vitest';
import { renderLessons } from '../../../../src/cli/renderers/lessons.js';
import { useCapturedOutput } from './renderer-test-helpers.js';

describe('renderLessons — query', () => {
  const output = useCapturedOutput();

  it('plain format prints one rule per line', () => {
    renderLessons({
      subcommand: 'query',
      exitCode: 0,
      format: 'plain',
      data: {
        lessons: [
          { id: 'a', rule: 'Rule one.', topics: ['t'], triggers: [], evidence: [] },
          { id: 'b', rule: 'Rule two.', topics: ['t'], triggers: [], evidence: [] },
        ],
        query: {},
        autoMigrated: false,
      },
    });
    const out = output.stdout();
    expect(out).toContain('Rule one.');
    expect(out).toContain('Rule two.');
  });

  it('md format prints a numbered list', () => {
    renderLessons({
      subcommand: 'query',
      exitCode: 0,
      format: 'md',
      data: {
        lessons: [{ id: 'a', rule: 'Rule.', topics: ['t'], triggers: [], evidence: [] }],
        query: {},
        autoMigrated: false,
      },
    });
    expect(output.stdout()).toContain('1. Rule.');
  });

  it('prefixes the lesson id when showIds is set (the --ids diagnosis flag)', () => {
    renderLessons({
      subcommand: 'query',
      exitCode: 0,
      format: 'plain',
      data: {
        lessons: [
          { id: 'topic-x-rule-1', rule: 'Rule one.', topics: ['t'], triggers: [], evidence: [] },
        ],
        query: {},
        autoMigrated: false,
        showIds: true,
      },
    });
    expect(output.stdout()).toContain('[topic-x-rule-1] Rule one.');
  });

  it('json format prints the data block', () => {
    renderLessons({
      subcommand: 'query',
      exitCode: 0,
      format: 'json',
      data: {
        lessons: [{ id: 'a', rule: 'R.', topics: [], triggers: [], evidence: [] }],
        query: {},
        autoMigrated: false,
      },
    });
    const out = output.stdout();
    const parsed = JSON.parse(out) as { lessons: Array<{ id: string }> };
    expect(parsed.lessons[0]?.id).toBe('a');
  });

  it('prints an auto-migration notice on stderr when applicable', () => {
    renderLessons({
      subcommand: 'query',
      exitCode: 0,
      format: 'plain',
      data: { lessons: [], query: {}, autoMigrated: true },
    });
    expect(output.stderr()).toMatch(/auto-migrated/i);
  });

  it('prints "(no matches)" when query result is empty in plain format', () => {
    renderLessons({
      subcommand: 'query',
      exitCode: 0,
      format: 'plain',
      data: { lessons: [], query: { file: 'src/x.ts' }, autoMigrated: false },
    });
    expect(output.stdout()).toMatch(/no matches/i);
  });

  it('notes on stderr how many rules were recalled by wording, keeping stdout paste-clean', () => {
    renderLessons({
      subcommand: 'query',
      exitCode: 0,
      format: 'plain',
      data: {
        lessons: [
          { id: 'a', rule: 'Triggered rule.', topics: [], triggers: [], evidence: [] },
          { id: 'b', rule: 'Wording rule.', topics: [], triggers: [], evidence: [], lexical: true },
        ],
        query: { keyword: 'svg clock' },
        autoMigrated: false,
        totalMatches: 2,
      },
    });
    expect(output.stdout()).toContain('Wording rule.');
    expect(output.stdout()).not.toMatch(/wording rather/);
    expect(output.stderr()).toMatch(/1 recalled by wording rather than a trigger/);
  });

  it('names a fully-deduped recall instead of a bare "(no matches)" (plain + md)', () => {
    for (const format of ['plain', 'md'] as const) {
      renderLessons({
        subcommand: 'query',
        exitCode: 0,
        format,
        data: {
          lessons: [],
          query: { file: 'src/x.ts' },
          autoMigrated: false,
          totalMatches: 3,
          suppressed: 3,
        },
      });
      expect(output.stdout()).toContain('(no new matches: 3 already shown this session)');
      expect(output.stdout()).not.toContain('(no matches)');
      expect(output.stderr()).toMatch(/3 already shown this session — deduped/);
    }
  });
});

describe('renderLessons — add', () => {
  const output = useCapturedOutput();

  it('prints the new lesson id and any new triggers', () => {
    renderLessons({
      subcommand: 'add',
      exitCode: 0,
      data: {
        id: 'topic-x-rule-1',
        isNewLesson: true,
        isNewTopic: false,
        newTriggerIds: ['t-glob-abc'],
        changes: [],
        warnings: [],
      },
    });
    expect(output.stdout()).toContain('topic-x-rule-1');
    expect(output.stdout()).toMatch(/new triggers?/i);
  });

  it('signals a no-change re-capture when the re-add changed nothing', () => {
    renderLessons({
      subcommand: 'add',
      exitCode: 0,
      data: {
        id: 'x',
        isNewLesson: false,
        isNewTopic: false,
        newTriggerIds: [],
        changes: [],
        warnings: [],
      },
    });
    expect(output.stdout()).toMatch(/existing|no change/i);
  });

  it('reports an upsert when re-capture merged new triggers onto an existing lesson', () => {
    renderLessons({
      subcommand: 'add',
      exitCode: 0,
      data: {
        id: 'x',
        isNewLesson: false,
        isNewTopic: false,
        newTriggerIds: ['t-glob-new'],
        changes: ['trigger attached: t-glob-new'],
        warnings: [],
      },
    });
    expect(output.stdout()).toContain('Updated lesson: x — trigger attached: t-glob-new');
  });

  it('routes errors to stderr', () => {
    renderLessons({
      subcommand: 'add',
      exitCode: 1,
      error: 'Unknown topic: nope',
      data: {
        id: '',
        isNewLesson: false,
        isNewTopic: false,
        newTriggerIds: [],
        changes: [],
        warnings: [],
      },
    });
    expect(output.stderr()).toContain('Unknown topic: nope');
  });

  it('does not print a bogus "Existing lesson" line on the error path', () => {
    renderLessons({
      subcommand: 'add',
      exitCode: 2,
      error: 'Missing --rule',
      data: {
        id: '',
        isNewLesson: false,
        isNewTopic: false,
        newTriggerIds: [],
        changes: [],
        warnings: [],
      },
    });
    expect(output.stdout()).not.toMatch(/existing lesson/i);
    expect(output.stderr()).toContain('Missing --rule');
  });

  it('prints guardrail warnings (stderr) after a successful capture', () => {
    renderLessons({
      subcommand: 'add',
      exitCode: 0,
      data: {
        id: 'topic-x-rule-1',
        isNewLesson: true,
        isNewTopic: false,
        newTriggerIds: ['t-glob-abc'],
        changes: [],
        warnings: [{ code: 'BROAD_GLOB_TRIGGER', message: 'broad glob.' }],
      },
    });
    expect(output.stdout()).toContain('topic-x-rule-1');
    expect(output.stderr()).toContain('BROAD_GLOB_TRIGGER');
  });

  it('warns about an unwired subsystem on stderr', () => {
    renderLessons({
      subcommand: 'add',
      exitCode: 0,
      data: {
        id: 'topic-x-rule-1',
        isNewLesson: true,
        isNewTopic: false,
        newTriggerIds: [],
        changes: [],
        warnings: [],
        activationNote: 'recall is not wired into your AI tools yet.',
      },
    });
    expect(output.stderr()).toContain('recall is not wired into your AI tools yet.');
  });
});

describe('renderLessons — prune', () => {
  const output = useCapturedOutput();

  it('dry run reports the plan and flags that nothing was written', () => {
    renderLessons({
      subcommand: 'prune',
      exitCode: 0,
      data: {
        applied: false,
        cap: 8,
        removedTriggerIds: ['t-dead', 't-orphan'],
        removedTopicIds: ['stale-topic'],
        trimmedLessons: [{ id: 'big', removedCount: 2, keptCount: 8 }],
        removedDeadGlobs: [],
        unreachableLessons: [],
      },
    });
    expect(output.stdout()).toMatch(/would prune/i);
    expect(output.stdout()).toMatch(/1 orphan topic/i);
    expect(output.stdout()).toMatch(/big: -2 . 8 kept/i);
    expect(output.stderr()).toMatch(/dry run/i);
  });

  it('apply reports what was pruned', () => {
    renderLessons({
      subcommand: 'prune',
      exitCode: 0,
      data: {
        applied: true,
        cap: 8,
        removedTriggerIds: ['t-dead'],
        removedTopicIds: [],
        trimmedLessons: [],
        removedDeadGlobs: [],
        unreachableLessons: [],
      },
    });
    expect(output.stdout()).toMatch(/pruned:/i);
    expect(output.stderr()).not.toMatch(/dry run/i);
  });

  it('reports detached dead globs and unreachable lessons', () => {
    renderLessons({
      subcommand: 'prune',
      exitCode: 0,
      data: {
        applied: true,
        cap: 8,
        removedTriggerIds: [],
        removedTopicIds: [],
        trimmedLessons: [],
        removedDeadGlobs: [{ id: 'rule-a', removedCount: 1, keptCount: 2 }],
        unreachableLessons: ['rule-b', 'rule-c'],
      },
    });
    expect(output.stdout()).toMatch(/dead-glob rule-a/i);
    expect(output.stderr()).toMatch(/2 lessons unreachable/i);
  });

  it('reports a clean graph as nothing to prune', () => {
    renderLessons({
      subcommand: 'prune',
      exitCode: 0,
      data: {
        applied: false,
        cap: 8,
        removedTriggerIds: [],
        removedTopicIds: [],
        trimmedLessons: [],
        removedDeadGlobs: [],
        unreachableLessons: [],
      },
    });
    expect(output.stdout()).toMatch(/nothing to prune/i);
  });
});

describe('renderLessons — topics / show / journal / validate / import-md / help', () => {
  const output = useCapturedOutput();

  it('topics prints id and summary per row', () => {
    renderLessons({
      subcommand: 'topics',
      exitCode: 0,
      data: { topics: [{ id: 't1', summary: 'Summary 1.' }] },
    });
    expect(output.stdout()).toContain('t1');
    expect(output.stdout()).toContain('Summary 1.');
  });

  it('topics warns with the setup hint when lessons is not activated', () => {
    renderLessons({
      subcommand: 'topics',
      exitCode: 0,
      data: { topics: [], setupHint: 'run agentsmesh init --lessons' },
    });
    expect(output.stdout()).toContain('(no topics)');
    expect(output.stderr()).toContain('run agentsmesh init --lessons');
  });

  it('show prints the rendered markdown to stdout', () => {
    renderLessons({
      subcommand: 'show',
      exitCode: 0,
      data: { topic: 't1', markdown: '# t1\n\nbody\n' },
    });
    expect(output.stdout()).toContain('# t1');
    expect(output.stdout()).toContain('body');
  });

  it('deprecate prints a plain deprecation line', () => {
    renderLessons({
      subcommand: 'deprecate',
      exitCode: 0,
      data: { id: 'rule-a', supersededBy: null },
    });
    expect(output.stdout()).toMatch(/deprecated rule-a/i);
  });

  it('deprecate prints a supersede line when supersededBy is set', () => {
    renderLessons({
      subcommand: 'deprecate',
      exitCode: 0,
      data: { id: 'rule-a', supersededBy: 'rule-b' },
    });
    expect(output.stdout()).toMatch(/superseded rule-a → rule-b/i);
  });

  it('import-md without deletions omits the removed-legacy line', () => {
    renderLessons({
      subcommand: 'import-md',
      exitCode: 0,
      data: {
        topicCount: 1,
        lessonCount: 1,
        triggerCount: 1,
        wroteGraphPath: '/abs/.agentsmesh/lessons/lessons.json',
        deletedPaths: [],
      },
    });
    expect(output.stdout()).not.toMatch(/removed legacy/i);
  });

  it('journal prints chronological entries with createdAt', () => {
    renderLessons({
      subcommand: 'journal',
      exitCode: 0,
      data: {
        entries: [
          { id: 'a', rule: 'A.', createdAt: '2026-06-01', topics: ['t'] },
          { id: 'b', rule: 'B.', createdAt: '2026-06-02', topics: ['t'] },
        ],
      },
    });
    const out = output.stdout();
    expect(out.indexOf('2026-06-01')).toBeGreaterThan(-1);
    expect(out.indexOf('A.')).toBeGreaterThan(-1);
    expect(out.indexOf('2026-06-02')).toBeGreaterThan(out.indexOf('2026-06-01'));
  });

  it('topics prints a placeholder when there are no topics', () => {
    renderLessons({ subcommand: 'topics', exitCode: 0, data: { topics: [] } });
    expect(output.stdout()).toMatch(/no topics/i);
  });

  it('journal warns with the setup hint when lessons is not activated', () => {
    renderLessons({
      subcommand: 'journal',
      exitCode: 0,
      data: { entries: [], setupHint: 'run agentsmesh init --lessons' },
    });
    expect(output.stderr()).toContain('run agentsmesh init --lessons');
  });

  it('validate prints warning-level findings to stderr but still confirms the ok verdict on stdout', () => {
    renderLessons({
      subcommand: 'validate',
      exitCode: 0,
      data: {
        ok: true,
        findings: [{ level: 'warning', code: 'ORPHAN_TRIGGER', message: 'Trigger t-x unused.' }],
      },
    });
    expect(output.stderr()).toMatch(/warning/i);
    expect(output.stderr()).toContain('ORPHAN_TRIGGER');
    // A warning is advisory — `ok` (no errors) is still reported on stdout.
    expect(output.stdout()).toContain('Lessons graph: ok.');
  });

  it('import-md reports a singular removed-legacy line for exactly one deletion', () => {
    renderLessons({
      subcommand: 'import-md',
      exitCode: 0,
      data: {
        topicCount: 1,
        lessonCount: 1,
        triggerCount: 1,
        wroteGraphPath: '/abs/.agentsmesh/lessons/lessons.json',
        deletedPaths: ['/abs/.agentsmesh/lessons/index.yaml'],
      },
    });
    expect(output.stdout()).toMatch(/removed legacy: 1 path(?!s)/);
  });

  it('validate ok prints a success line to stdout', () => {
    renderLessons({
      subcommand: 'validate',
      exitCode: 0,
      data: { ok: true, findings: [] },
    });
    expect(output.stdout()).toMatch(/ok/i);
  });

  it('validate findings print to stderr with level prefix', () => {
    renderLessons({
      subcommand: 'validate',
      exitCode: 1,
      data: {
        ok: false,
        findings: [
          { level: 'error', code: 'DANGLING_TOPIC', message: 'Lesson x → topic y missing.' },
        ],
      },
    });
    expect(output.stderr()).toMatch(/error/i);
    expect(output.stderr()).toContain('DANGLING_TOPIC');
  });

  it('import-md prints migration counts', () => {
    renderLessons({
      subcommand: 'import-md',
      exitCode: 0,
      data: {
        topicCount: 2,
        lessonCount: 5,
        triggerCount: 7,
        wroteGraphPath: '/abs/.agentsmesh/lessons/lessons.json',
        deletedPaths: ['/abs/.agentsmesh/lessons/index.yaml'],
      },
    });
    const out = output.stdout();
    expect(out).toContain('2');
    expect(out).toContain('5');
    expect(out).toContain('7');
  });

  it('help prints usage and known subcommands', () => {
    renderLessons({ subcommand: 'help', exitCode: 0 });
    const out = output.stdout();
    expect(out).toMatch(/usage/i);
    expect(out).toContain('query');
    expect(out).toContain('add');
  });

  it('import-md reports a plural removed-legacy line for more than one deletion', () => {
    renderLessons({
      subcommand: 'import-md',
      exitCode: 0,
      data: {
        topicCount: 1,
        lessonCount: 1,
        triggerCount: 1,
        wroteGraphPath: '/abs/.agentsmesh/lessons/lessons.json',
        deletedPaths: ['/abs/.agentsmesh/lessons/index.yaml', '/abs/.agentsmesh/lessons/topics'],
      },
    });
    expect(output.stdout()).toMatch(/removed legacy: 2 paths/);
  });
});

describe('renderLessons — merge / strip-markers', () => {
  const output = useCapturedOutput();

  it('merge prints a success line on a clean (exit 0) merge', () => {
    renderLessons({
      subcommand: 'merge',
      exitCode: 0,
      data: { loserId: 'b-lose', keeperId: 'a-keep' },
    });
    expect(output.stdout()).toMatch(/merged b-lose → a-keep/i);
  });

  it('merge prints nothing on a non-zero exit (the error was already surfaced)', () => {
    renderLessons({
      subcommand: 'merge',
      exitCode: 1,
      error: 'Unknown lesson: ghost',
      data: { loserId: 'ghost', keeperId: 'a-keep' },
    });
    expect(output.stdout()).not.toMatch(/merged/i);
    expect(output.stderr()).toContain('Unknown lesson: ghost');
  });

  it('strip-markers reports the stripped count (plural) when markers were removed', () => {
    renderLessons({
      subcommand: 'strip-markers',
      exitCode: 0,
      data: { changedIds: ['a', 'b'], changedCount: 2, dryRun: false },
    });
    expect(output.stdout()).toMatch(/stripped legacy markers from 2 lessons/i);
  });

  it('strip-markers --dry-run reports a singular would-strip line for exactly one lesson', () => {
    renderLessons({
      subcommand: 'strip-markers',
      exitCode: 0,
      data: { changedIds: ['a'], changedCount: 1, dryRun: true },
    });
    expect(output.stdout()).toMatch(/would strip legacy markers from 1 lesson(?!s)/i);
  });
});

describe('renderLessons — add / query coverage gaps', () => {
  const output = useCapturedOutput();

  it('add announces a brand-new topic alongside the new lesson', () => {
    renderLessons({
      subcommand: 'add',
      exitCode: 0,
      data: {
        id: 'fresh-topic-rule-1',
        isNewLesson: true,
        isNewTopic: true,
        newTriggerIds: ['t-glob-abc'],
        changes: [],
        warnings: [],
      },
    });
    expect(output.stdout()).toMatch(/created new topic/i);
  });

  it('query warns on stderr when the ranked cap hid matches', () => {
    renderLessons({
      subcommand: 'query',
      exitCode: 0,
      format: 'plain',
      data: {
        lessons: [{ id: 'a', rule: 'Rule.', topics: ['t'], triggers: [], evidence: [] }],
        query: { file: 'src/x.ts' },
        autoMigrated: false,
        totalMatches: 5,
      },
    });
    expect(output.stderr()).toMatch(/showing 1 of 5 matches/i);
  });
});

describe('renderLessons — stats', () => {
  const output = useCapturedOutput();

  const report = {
    totalRecalls: 4,
    noMatchRate: 0.5,
    matchCountHistogram: [
      { bucket: '0', count: 2 },
      { bucket: '1', count: 2 },
    ],
    returnedTokens: { p50: 20, p90: 80, max: 90 },
    cumulativeRecallTokens: 120,
    wholeActiveSetTokens: 300,
    bypassedRecalls: 1,
    preloadBreakEven: {
      sessions: 3,
      preloadTokens: 900,
      mandatoryRecallTokens: 120,
      recallCheaper: true,
      ratio: 7.5,
    },
    redundancy: { rate: 0.4, coverage: 1 },
    reachability: { keywordOnlyRecallRate: 0.25, keywordOnlyUnreachableLessons: 3 },
  };

  const emptyCapture = {
    total: 0,
    blocked: 0,
    newLessons: 0,
    upserts: 0,
    newTopics: 0,
    withWarnings: 0,
    byTriggerKind: { file: 0, command: 0, keyword: 0 },
  };

  it('renders the recall:capture ratio as "—" when no captures were logged', () => {
    renderLessons({
      subcommand: 'stats',
      exitCode: 0,
      format: 'text',
      data: {
        report,
        advice: [],
        captureReport: emptyCapture,
        hasLog: true,
        hasCaptureLog: true,
        telemetryEnabled: true,
      },
    });
    expect(output.stdout()).toContain('—');
  });

  it('prints the human summary including session break-even, redundancy, and reachability', () => {
    renderLessons({
      subcommand: 'stats',
      exitCode: 0,
      format: 'text',
      data: {
        report,
        advice: [],
        captureReport: emptyCapture,
        hasLog: true,
        hasCaptureLog: false,
        telemetryEnabled: true,
      },
    });
    const out = output.stdout();
    expect(out).toContain('recalls: 4');
    expect(out).toContain('no-match: 50.0%');
    expect(out).toContain('sessions: 3');
    expect(out).toContain('bypassed(--all): 1');
    expect(out).toContain('recall cheaper');
    expect(out).toContain('redundancy: 40.0%');
    expect(out).toContain('keyword-only-unreachable lessons 3');
  });

  it('renders the effectiveness (benefit) block with an honest coarse label and a pointer to validate', () => {
    renderLessons({
      subcommand: 'stats',
      exitCode: 0,
      format: 'text',
      data: {
        report,
        advice: [],
        captureReport: emptyCapture,
        effectiveness: {
          deliveries: 10,
          lessonsDelivered: 4,
          failuresObserved: 3,
          heldRate: 0.7,
          ineffectiveLessons: 1,
        },
        hasLog: false,
        hasCaptureLog: false,
        hasOutcomeLog: true,
        telemetryEnabled: true,
      },
    });
    const out = output.stdout();
    expect(out).toContain('effectiveness (coarse)');
    expect(out).toContain('10 deliveries of 4 lessons');
    expect(out).toContain('held 70.0%');
    expect(out).toContain('not proof'); // never overclaims prevention
    expect(out).toContain('1 ineffective');
    expect(out).toContain('lessons validate'); // pointer to the actionable list
  });

  it('hints to enable telemetry and run queries when no log exists and telemetry is off', () => {
    renderLessons({
      subcommand: 'stats',
      exitCode: 0,
      format: 'text',
      data: {
        report,
        advice: [],
        captureReport: emptyCapture,
        hasLog: false,
        hasCaptureLog: false,
        telemetryEnabled: false,
      },
    });
    const out = output.stdout();
    expect(out).toContain('AGENTSMESH_LESSONS_TELEMETRY=1');
    // The hint must steer the user to set it during recalls, not during stats.
    expect(out).toContain('lessons query');
    expect(out).toContain('NOT during `stats`');
  });

  it('explains that recalls must run when telemetry is on but the log is still empty', () => {
    renderLessons({
      subcommand: 'stats',
      exitCode: 0,
      format: 'text',
      data: {
        report,
        advice: [],
        captureReport: emptyCapture,
        hasLog: false,
        hasCaptureLog: false,
        telemetryEnabled: true,
      },
    });
    const out = output.stdout();
    expect(out).toContain('telemetry is ON');
    expect(out).toContain('lessons query');
  });

  it('reports preload as cheaper when mandatory recall exceeds the per-session preload', () => {
    const heavy = {
      ...report,
      preloadBreakEven: {
        sessions: 1,
        preloadTokens: 300,
        mandatoryRecallTokens: 750,
        recallCheaper: false,
        ratio: 0.4,
      },
    };
    renderLessons({
      subcommand: 'stats',
      exitCode: 0,
      format: 'text',
      data: {
        report: heavy,
        advice: [],
        captureReport: emptyCapture,
        hasLog: true,
        hasCaptureLog: false,
        telemetryEnabled: true,
      },
    });
    expect(output.stdout()).toContain('preload cheaper');
  });

  it('json format emits the recall report with the capture aggregate nested under `capture`', () => {
    renderLessons({
      subcommand: 'stats',
      exitCode: 0,
      format: 'json',
      data: {
        report,
        advice: [],
        captureReport: { ...emptyCapture, total: 2, blocked: 1, newLessons: 1 },
        hasLog: true,
        hasCaptureLog: true,
        telemetryEnabled: true,
      },
    });
    const parsed = JSON.parse(output.stdout());
    expect(parsed.totalRecalls).toBe(4);
    expect(parsed.preloadBreakEven.ratio).toBe(7.5);
    expect(parsed.redundancy.rate).toBe(0.4);
    expect(parsed.capture).toMatchObject({ total: 2, blocked: 1, newLessons: 1 });
  });

  it('prints advice lines after the stat blocks (text format, stderr)', () => {
    renderLessons({
      subcommand: 'stats',
      exitCode: 0,
      format: 'text',
      data: {
        report,
        advice: ['advice: session dedup is inert — pass --session auto'],
        captureReport: emptyCapture,
        hasLog: true,
        hasCaptureLog: false,
        telemetryEnabled: true,
      },
    });
    expect(output.stderr()).toContain('session dedup is inert');
  });

  it('json format includes the advice key only when advice is non-empty', () => {
    renderLessons({
      subcommand: 'stats',
      exitCode: 0,
      format: 'json',
      data: {
        report,
        advice: ['advice: x'],
        captureReport: emptyCapture,
        hasLog: true,
        hasCaptureLog: false,
        telemetryEnabled: true,
      },
    });
    expect(JSON.parse(output.stdout()).advice).toEqual(['advice: x']);
  });

  it('json format omits the advice key when advice is empty', () => {
    renderLessons({
      subcommand: 'stats',
      exitCode: 0,
      format: 'json',
      data: {
        report,
        advice: [],
        captureReport: emptyCapture,
        hasLog: true,
        hasCaptureLog: false,
        telemetryEnabled: true,
      },
    });
    expect('advice' in JSON.parse(output.stdout())).toBe(false);
  });

  it('prints a Capture block (totals, blocked, trigger-kind mix, recall:capture ratio) when a capture log exists', () => {
    renderLessons({
      subcommand: 'stats',
      exitCode: 0,
      format: 'text',
      data: {
        report, // totalRecalls: 4
        advice: [],
        captureReport: {
          total: 2,
          blocked: 1,
          newLessons: 1,
          upserts: 0,
          newTopics: 1,
          withWarnings: 1,
          byTriggerKind: { file: 3, command: 1, keyword: 2 },
        },
        hasLog: true,
        hasCaptureLog: true,
        telemetryEnabled: true,
      },
    });
    const out = output.stdout();
    expect(out).toContain('captures: 2');
    expect(out).toContain('blocked: 1');
    expect(out).toContain('file=3');
    expect(out).toContain('cmd=1');
    expect(out).toContain('kw=2');
    // 4 recalls / 2 captures = 2.00 recalls per capture.
    expect(out).toContain('recall:capture ratio: 2.00');
  });

  it('shows the capture block even when no recall log exists (capture-only telemetry)', () => {
    renderLessons({
      subcommand: 'stats',
      exitCode: 0,
      format: 'text',
      data: {
        report,
        advice: [],
        captureReport: { ...emptyCapture, total: 1, newLessons: 1 },
        hasLog: false,
        hasCaptureLog: true,
        telemetryEnabled: true,
      },
    });
    const out = output.stdout();
    expect(out).toContain('captures: 1');
    // The empty "enable telemetry" hint must NOT fire when a capture log exists.
    expect(out).not.toContain('AGENTSMESH_LESSONS_TELEMETRY=1');
  });
});

describe('renderLessons — branch coverage for less-common subcommands', () => {
  const output = useCapturedOutput();

  it('hook writes raw harness JSON to stdout when output is non-empty', () => {
    renderLessons({ subcommand: 'hook', exitCode: 0, data: { output: '{"x":1}' } });
    expect(output.stdout()).toContain('{"x":1}');
  });

  it('hook writes nothing when output is empty', () => {
    renderLessons({ subcommand: 'hook', exitCode: 0, data: { output: '' } });
    expect(output.stdout()).toBe('');
  });

  it('merge-driver renders nothing on a successful (exit 0) union merge', () => {
    renderLessons({ subcommand: 'merge-driver', exitCode: 0, data: { merged: true } });
    expect(output.stdout()).toBe('');
    expect(output.stderr()).toBe('');
  });

  it('untrigger reports the removed trigger and remaining count (singular)', () => {
    renderLessons({
      subcommand: 'untrigger',
      exitCode: 0,
      data: {
        lessonId: 'rule-a',
        triggerId: 't-1',
        removedTriggerNode: false,
        remainingTriggerCount: 1,
      },
    });
    expect(output.stdout()).toMatch(/Removed trigger t-1 from rule-a \(1 trigger left\)/);
  });

  it('untrigger notes GC when the trigger node was removed (plural count)', () => {
    renderLessons({
      subcommand: 'untrigger',
      exitCode: 0,
      data: {
        lessonId: 'rule-a',
        triggerId: 't-1',
        removedTriggerNode: true,
        remainingTriggerCount: 2,
      },
    });
    expect(output.stdout()).toMatch(/2 triggers left.*garbage-collected/);
  });

  it('query prints a corrupt-graph warning to stderr', () => {
    renderLessons({
      subcommand: 'query',
      exitCode: 0,
      format: 'plain',
      data: {
        lessons: [],
        query: {},
        autoMigrated: false,
        warning: 'lessons.json is unreadable (corrupt)',
      },
    });
    expect(output.stderr()).toContain('corrupt');
  });

  it('query notes suppressed (deduped) matches on stderr', () => {
    renderLessons({
      subcommand: 'query',
      exitCode: 0,
      format: 'plain',
      data: {
        lessons: [{ id: 'a', rule: 'Rule.', topics: ['t'], triggers: [], evidence: [] }],
        query: {},
        autoMigrated: false,
        totalMatches: 1,
        suppressed: 2,
      },
    });
    expect(output.stderr()).toMatch(/2 already shown this session/);
  });

  it('add reports the auto-pruned summary line (mixed singular/plural)', () => {
    renderLessons({
      subcommand: 'add',
      exitCode: 0,
      data: {
        id: 'topic-x-rule-1',
        isNewLesson: true,
        isNewTopic: false,
        newTriggerIds: [],
        changes: [],
        warnings: [],
        autoPruned: { removedTriggers: 1, removedTopics: 2, detachedDeadGlobs: 0 },
      },
    });
    expect(output.stdout()).toMatch(
      /auto-pruned: 1 orphan trigger, 2 orphan topics, 0 dead globs detached/,
    );
  });
});
