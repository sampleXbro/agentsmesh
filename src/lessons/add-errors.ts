import type { IneffectiveTrigger } from './trigger-effectiveness.js';

/**
 * Capture rejection errors thrown by {@link addLessonInto}. Kept in their own
 * module so `add.ts` stays focused on the mutation logic; re-exported from
 * `add.js` so every existing importer keeps its `from './add.js'` path.
 */

/** Thrown when the rule text is empty or whitespace-only — there is nothing to capture. */
export class EmptyRuleError extends Error {
  readonly code = 'EMPTY_RULE';
  constructor() {
    super('Lesson rule must not be empty — pass one imperative sentence.');
    this.name = 'EmptyRuleError';
  }
}

/**
 * Thrown when a `--trigger-cmd` pattern matches the empty string or nearly every
 * command (`.*`, ` `, `\w`). Such a trigger fires on every recall, so it is a
 * leak that dilutes every command-shaped lesson rather than a trigger.
 */
export class BroadCommandPatternError extends Error {
  readonly code = 'BROAD_COMMAND_PATTERN';
  constructor(public readonly pattern: string) {
    super(
      `Command pattern ${JSON.stringify(pattern)} matches nearly every command, so it would fire on ` +
        'every recall. Key it on the action instead — a word-bounded program + subcommand ' +
        '(e.g. "\\bgit commit\\b", "\\brm\\b").',
    );
    this.name = 'BroadCommandPatternError';
  }
}

export class UnknownTopicError extends Error {
  readonly code = 'UNKNOWN_TOPIC';
  constructor(public readonly topic: string) {
    super(`Unknown topic: ${topic}. Pass allowNewTopic + topicSummary to create it.`);
    this.name = 'UnknownTopicError';
  }
}

/** Thrown when a topic id is not kebab-case, so the graph schema would reject it. */
export class InvalidTopicIdError extends Error {
  readonly code = 'INVALID_TOPIC_ID';
  constructor(public readonly topic: string) {
    const slug = topic
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    super(
      `Topic id ${JSON.stringify(topic)} must be kebab-case (lowercase letters, digits and -)` +
        (slug.length > 0 ? `, e.g. ${JSON.stringify(slug)}.` : '.'),
    );
    this.name = 'InvalidTopicIdError';
  }
}

/** Thrown when a capture creates a topic without a (non-blank) summary. */
export class TopicSummaryRequiredError extends Error {
  readonly code = 'TOPIC_SUMMARY_REQUIRED';
  constructor(public readonly topic: string) {
    super(
      `New topic ${JSON.stringify(topic)} needs a one-line summary (--topic-summary on the CLI, ` +
        'topic_summary over MCP).',
    );
    this.name = 'TopicSummaryRequiredError';
  }
}

/**
 * Thrown when a capture's rule text exceeds {@link MAX_RULE_LENGTH}. A rule is
 * one imperative sentence; a far longer one is a malformed capture (a pasted log,
 * a whole diff) that would bloat every recall that surfaces it.
 */
export class RuleTooLongError extends Error {
  readonly code = 'OVERSIZED_RULE';
  constructor(
    public readonly length: number,
    public readonly max: number,
  ) {
    super(
      `Lesson rule is ${length} characters (max ${max}). A rule should be one imperative ` +
        'sentence — trim it to the essential instruction, or split it into separate lessons.',
    );
    this.name = 'RuleTooLongError';
  }
}

/** Thrown when a capture would leave a lesson with no trigger (unrecallable). */
export class NoTriggerError extends Error {
  readonly code = 'NO_TRIGGER';
  constructor() {
    super(
      'A lesson needs at least one trigger to be recallable. Pass --trigger-file <glob> ' +
        '(preferred), --trigger-cmd <regex>, or --trigger-kw <text>.',
    );
    this.name = 'NoTriggerError';
  }
}

/**
 * Thrown when a capture would leave a lesson whose every trigger is dead on the
 * mandatory `--file`/`--cmd` recall path (a stopword-only keyword, an invalid or
 * ReDoS-shaped command regex). The lesson would be captured then silently never
 * recalled — so capture is rejected with the dead triggers named and a fix.
 */
export class UnrecallableLessonError extends Error {
  readonly code = 'UNRECALLABLE_LESSON';
  constructor(public readonly deadTriggers: readonly IneffectiveTrigger[]) {
    super(
      'This capture would create a lesson with no effective trigger — every trigger is dead ' +
        'on the mandatory --file/--cmd recall path, so the lesson could never be recalled there:\n' +
        deadTriggers.map((t) => `  • ${t.kind} "${t.pattern}" — ${t.reason}`).join('\n') +
        '\nFix: add a precise --trigger-file <glob> (preferred) or a valid --trigger-cmd <regex>; ' +
        'for a keyword, drop the stopwords (e.g. "state art" not "state of the art").',
    );
    this.name = 'UnrecallableLessonError';
  }
}
