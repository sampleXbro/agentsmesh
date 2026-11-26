/**
 * Typed errors for lesson curation (`deprecate`, `merge`, `untrigger`). Each has
 * a stable string `code` so callers branch on the code, not the message text.
 */

/** A lesson id the graph does not hold. */
export class UnknownLessonError extends Error {
  readonly code = 'UNKNOWN_LESSON';
  /** `colon` reads `Unknown lesson: id.`; `quoted` reads `Unknown lesson "id".` */
  constructor(
    public readonly lessonId: string,
    style: 'colon' | 'quoted' = 'colon',
  ) {
    super(style === 'colon' ? `Unknown lesson: ${lessonId}.` : `Unknown lesson "${lessonId}".`);
    this.name = 'UnknownLessonError';
  }
}

/** A `--superseded-by` target the graph does not hold. */
export class UnknownSupersederError extends Error {
  readonly code = 'UNKNOWN_SUPERSEDER';
  constructor(public readonly supersederId: string) {
    super(`Unknown superseder: ${supersederId}.`);
    this.name = 'UnknownSupersederError';
  }
}

/** A merge side that is not active: a dead keeper, or a loser already retired. */
export class InactiveLessonError extends Error {
  readonly code = 'INACTIVE_LESSON';
  constructor(
    public readonly role: 'keeper' | 'loser',
    public readonly lessonId: string,
    public readonly status: string,
  ) {
    super(
      role === 'keeper'
        ? `Keeper "${lessonId}" is not active (status: ${status}).`
        : `Loser "${lessonId}" is already ${status}; nothing to merge.`,
    );
    this.name = 'InactiveLessonError';
  }
}

/** A lesson merged into itself. */
export class SelfMergeError extends Error {
  readonly code = 'SELF_MERGE';
  constructor(public readonly lessonId: string) {
    super(`Cannot merge lesson "${lessonId}" into itself.`);
    this.name = 'SelfMergeError';
  }
}

/** `untrigger` named a trigger the lesson does not carry. */
export class TriggerNotAttachedError extends Error {
  readonly code = 'TRIGGER_NOT_ATTACHED';
  constructor(
    public readonly lessonId: string,
    public readonly triggerId: string,
  ) {
    super(`Lesson "${lessonId}" does not reference trigger "${triggerId}".`);
    this.name = 'TriggerNotAttachedError';
  }
}

/** `untrigger` would leave an active triggered lesson with no way to be recalled. */
export class LastTriggerError extends Error {
  readonly code = 'LAST_TRIGGER';
  constructor(public readonly lessonId: string) {
    super(
      `Refusing to remove the only trigger of active lesson "${lessonId}" — it would become unreachable. Add a replacement trigger first (lessons add "<same rule>" --topic ...), then untrigger.`,
    );
    this.name = 'LastTriggerError';
  }
}
