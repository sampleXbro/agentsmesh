/**
 * Turn schema issues into one-line messages that name the wrong key
 * (`targets[1]: …`) and keep long id lists short.
 */

export interface ConfigIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
  readonly code?: string;
  readonly values?: readonly unknown[];
}

/** Longer enums are shortened; only the target id list is this long. */
const MAX_LISTED_VALUES = 8;
const SAMPLE_COUNT = 3;
const SUPPORTED_TOOLS_URL = 'https://samplexbro.github.io/agentsmesh/reference/supported-tools/';

/** `['extends', 0, 'features']` -> `extends[0].features`. */
export function formatIssuePath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const part of path) {
    if (typeof part === 'number') out += `[${part}]`;
    else out += out === '' ? String(part) : `.${String(part)}`;
  }
  return out;
}

function shortEnumMessage(values: readonly unknown[]): string {
  const sample = values
    .slice(0, SAMPLE_COUNT)
    .map((v) => JSON.stringify(v))
    .join('|');
  return (
    `Invalid option: not one of the ${values.length} supported values, e.g. ${sample}|… ` +
    `(full list: ${SUPPORTED_TOOLS_URL})`
  );
}

function issueText(issue: ConfigIssue): string {
  const { values } = issue;
  if (issue.code === 'invalid_value' && values !== undefined && values.length > MAX_LISTED_VALUES) {
    return shortEnumMessage(values);
  }
  return issue.message;
}

export function formatConfigIssues(issues: readonly ConfigIssue[]): string[] {
  return issues.map((issue) => {
    const where = formatIssuePath(issue.path);
    return where === '' ? issueText(issue) : `${where}: ${issueText(issue)}`;
  });
}
