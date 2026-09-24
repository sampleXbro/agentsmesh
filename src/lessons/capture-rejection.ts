import {
  BroadCommandPatternError,
  EmptyRuleError,
  InvalidTopicIdError,
  NoTriggerError,
  RuleTooLongError,
  TopicSummaryRequiredError,
  UnrecallableLessonError,
} from './add-errors.js';
import { TriggerFileGlobError } from './trigger-file-glob.js';

export type CaptureRejection =
  | EmptyRuleError
  | NoTriggerError
  | UnrecallableLessonError
  | RuleTooLongError
  | BroadCommandPatternError
  | InvalidTopicIdError
  | TopicSummaryRequiredError
  | TriggerFileGlobError;

/** True for a capture guardrail rejection: the caller's input must change. */
export function isCaptureRejection(err: unknown): err is CaptureRejection {
  return (
    err instanceof EmptyRuleError ||
    err instanceof NoTriggerError ||
    err instanceof UnrecallableLessonError ||
    err instanceof RuleTooLongError ||
    err instanceof BroadCommandPatternError ||
    err instanceof InvalidTopicIdError ||
    err instanceof TopicSummaryRequiredError ||
    err instanceof TriggerFileGlobError
  );
}
