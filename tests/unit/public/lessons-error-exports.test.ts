import { describe, expect, expectTypeOf, it } from 'vitest';
import * as lessons from '../../../src/public/lessons.js';
import type {
  CaptureRejection,
  LessonsErrorCode,
  RecallHookOutcome,
  ScaffoldLessonsOptions,
} from '../../../src/public/lessons.js';
import {
  BroadCommandPatternError,
  CatchAllGlobError,
  EmptyRuleError,
  InvalidTopicIdError,
  NoTriggerError,
  RuleTooLongError,
  TopicSummaryRequiredError,
  UnknownTopicError,
  UnrecallableLessonError,
} from '../../../src/lessons/add-errors.js';
import { isCaptureRejection } from '../../../src/lessons/capture-rejection.js';
import {
  InactiveLessonError,
  LastTriggerError,
  SelfMergeError,
  TriggerNotAttachedError,
  UnknownLessonError,
  UnknownSupersederError,
} from '../../../src/lessons/curation-errors.js';
import type { ScaffoldLessonsOptions as InternalScaffoldOptions } from '../../../src/lessons/init.js';
import type { RecallHookOutcome as InternalRecallHookOutcome } from '../../../src/lessons/recall-hook-scaffold.js';
import { LessonsGraphExistsError } from '../../../src/lessons/import-legacy.js';
import { LessonsWriteRefusedError } from '../../../src/lessons/mutate.js';
import { TriggerFileGlobError } from '../../../src/lessons/trigger-file-glob.js';

describe('agentsmesh/lessons error exports', () => {
  it.each([
    ['EmptyRuleError', EmptyRuleError],
    ['BroadCommandPatternError', BroadCommandPatternError],
    ['CatchAllGlobError', CatchAllGlobError],
    ['UnknownLessonError', UnknownLessonError],
    ['UnknownSupersederError', UnknownSupersederError],
    ['InactiveLessonError', InactiveLessonError],
    ['SelfMergeError', SelfMergeError],
    ['TriggerNotAttachedError', TriggerNotAttachedError],
    ['LastTriggerError', LastTriggerError],
    ['UnknownTopicError', UnknownTopicError],
    ['InvalidTopicIdError', InvalidTopicIdError],
    ['TopicSummaryRequiredError', TopicSummaryRequiredError],
    ['RuleTooLongError', RuleTooLongError],
    ['NoTriggerError', NoTriggerError],
    ['UnrecallableLessonError', UnrecallableLessonError],
    ['TriggerFileGlobError', TriggerFileGlobError],
    ['LessonsGraphExistsError', LessonsGraphExistsError],
    ['LessonsWriteRefusedError', LessonsWriteRefusedError],
  ])('exports %s as the same class the library throws', (name, cls) => {
    expect((lessons as Record<string, unknown>)[name]).toBe(cls);
  });

  it('exports isCaptureRejection and it recognises exported rejections', () => {
    expect(lessons.isCaptureRejection).toBe(isCaptureRejection);
    expect(lessons.isCaptureRejection(new lessons.NoTriggerError())).toBe(true);
    expect(lessons.isCaptureRejection(new lessons.UnknownTopicError('x'))).toBe(false);
    expect(lessons.isCaptureRejection(new Error('x'))).toBe(false);
  });

  it('lets a consumer narrow a caught error by instanceof and read its code', () => {
    const err: unknown = new lessons.RuleTooLongError(900, 400);
    expect(err instanceof lessons.RuleTooLongError).toBe(true);
    if (lessons.isCaptureRejection(err)) expect(err.code).toBe('OVERSIZED_RULE');
  });
});

describe('LessonsErrorCode', () => {
  it('holds every code the exported errors carry today', () => {
    expectTypeOf<'EMPTY_RULE'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'BROAD_COMMAND_PATTERN'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'UNKNOWN_TOPIC'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'INVALID_TOPIC_ID'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'TOPIC_SUMMARY_REQUIRED'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'OVERSIZED_RULE'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'NO_TRIGGER'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'UNRECALLABLE_LESSON'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'TRIGGER_FILE_OUTSIDE_PROJECT'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'TRIGGER_FILE_IS_PROJECT_ROOT'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'TRIGGER_FILE_IS_DIRECTORY'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'UNSAFE_GLOB_PATTERN'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'LESSONS_GRAPH_EXISTS'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'LESSONS_DIR_OUTSIDE_PROJECT'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'LEGACY_TOPIC_PATH_OUTSIDE'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'CATCH_ALL_GLOB'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'UNKNOWN_LESSON'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'UNKNOWN_SUPERSEDER'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'INACTIVE_LESSON'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'SELF_MERGE'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'TRIGGER_NOT_ATTACHED'>().toExtend<LessonsErrorCode>();
    expectTypeOf<'LAST_TRIGGER'>().toExtend<LessonsErrorCode>();
  });

  it('is a closed union of string literals, not plain string', () => {
    expectTypeOf<string>().not.toExtend<LessonsErrorCode>();
    expectTypeOf<LessonsErrorCode>().toExtend<string>();
  });

  it('covers the code of every capture rejection', () => {
    expectTypeOf<CaptureRejection['code']>().toExtend<LessonsErrorCode>();
  });
});

describe('scaffold and recall-hook types', () => {
  it('exports the same RecallHookOutcome and ScaffoldLessonsOptions the scaffolder uses', () => {
    expectTypeOf<RecallHookOutcome>().toEqualTypeOf<InternalRecallHookOutcome>();
    expectTypeOf<ScaffoldLessonsOptions>().toEqualTypeOf<InternalScaffoldOptions>();
  });
});
