import { describe, expect, it } from 'vitest';
import type { LessonsStatsData } from '../../../../src/cli/commands/lessons-types.js';
import { renderStats } from '../../../../src/cli/renderers/lessons-render-diagnostics.js';
import { summarizeCapture } from '../../../../src/lessons/stats-capture.js';
import { summarizeEffectiveness } from '../../../../src/lessons/stats-effectiveness.js';
import { summarizeRecall } from '../../../../src/lessons/stats.js';
import { useCapturedOutput } from './renderer-test-helpers.js';

const EMPTY_GRAPH = { version: 2, lessons: {}, topics: {}, triggers: {} } as const;

function data(over: Partial<LessonsStatsData>): LessonsStatsData {
  return {
    report: summarizeRecall([], { ...EMPTY_GRAPH }),
    advice: [],
    captureReport: summarizeCapture([]),
    effectiveness: summarizeEffectiveness([], { ...EMPTY_GRAPH }),
    hasLog: false,
    hasCaptureLog: false,
    hasOutcomeLog: false,
    telemetryEnabled: false,
    ...over,
  };
}

describe('renderStats — telemetry hints name the config switch', () => {
  const output = useCapturedOutput();

  it('the empty hint names "telemetry": true in config.json, not only the env var', () => {
    renderStats(data({}), 'text');
    const out = output.stdout();
    expect(out).toContain('"telemetry": true');
    expect(out).toContain('.agentsmesh/lessons/config.json');
    expect(out).toContain('AGENTSMESH_LESSONS_TELEMETRY=1');
  });

  it('with only the default-on outcome log, still points at the telemetry switch', () => {
    renderStats(
      data({
        hasOutcomeLog: true,
        effectiveness: {
          deliveries: 4,
          lessonsDelivered: 2,
          failuresObserved: 3,
          misses: 1,
          failingActions: 1,
          heldRate: 0.75,
          ineffectiveLessons: 0,
        },
      }),
      'text',
    );
    const out = output.stdout();
    expect(out).toContain('effectiveness (coarse)');
    expect(out).toContain('"telemetry": true');
  });

  it('says nothing about enabling telemetry once it is on', () => {
    renderStats(data({ hasOutcomeLog: true, telemetryEnabled: true }), 'text');
    expect(output.stdout()).not.toContain('"telemetry": true');
  });
});

describe('renderStats — effectiveness shows distinct failing actions beside the rate', () => {
  const output = useCapturedOutput();

  it('prints misses and the distinct failing-action count next to the held rate', () => {
    renderStats(
      data({
        hasOutcomeLog: true,
        telemetryEnabled: true,
        effectiveness: {
          deliveries: 10,
          lessonsDelivered: 4,
          failuresObserved: 6,
          misses: 3,
          failingActions: 2,
          heldRate: 0.7,
          ineffectiveLessons: 1,
        },
      }),
      'text',
    );
    const out = output.stdout();
    expect(out).toContain('held 70.0%');
    expect(out).toContain('3 misses from 2 distinct failing actions');
    expect(out).toContain('within 30 min');
    expect(out).toContain('not proof');
  });
});
