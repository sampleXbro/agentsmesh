/**
 * The Homebrew tap formula gets the SHA-256 of the npm tarball. If npm has not
 * served the tarball yet, the step must fail, never hash an empty download.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Step {
  id?: string;
  run?: string;
}

const EMPTY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function shaStepScript(): string {
  const raw = readFileSync(join(process.cwd(), '.github', 'workflows', 'publish.yml'), 'utf8');
  const workflow = parse(raw) as { jobs: Record<string, { steps: Step[] }> };
  const script = workflow.jobs['update-tap']?.steps.find((s) => s.id === 'sha')?.run;
  if (script === undefined) throw new Error('update-tap has no step with id "sha"');
  return script;
}

describe('update-tap SHA step (script text)', () => {
  const script = shaStepScript();

  it('downloads to a file instead of piping curl into sha256sum', () => {
    expect(script).toContain('curl -fsSL -o "$TARBALL" "$URL"');
    expect(script).not.toMatch(/curl[^\n]*\|/);
  });

  it('knows the empty-input hash and fails after the last attempt', () => {
    expect(script).toContain(`EMPTY_SHA=${EMPTY_SHA}`);
    expect(script).toContain('exit 1');
  });

  it('waits long enough for npm to serve a new version', () => {
    expect(script).toContain('ATTEMPTS=30');
    expect(script).toContain('sleep 15');
  });
});

describe.skipIf(process.platform === 'win32')('update-tap SHA step (run with bash -e)', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'am-tap-sha-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Runs the real step with the URL pointed at `url`, 2 attempts and no waiting. */
  function runStep(url: string): { status: number | null; stderr: string; output: string } {
    const script = shaStepScript()
      .replace(/^URL=.*$/m, `URL="${url}"`)
      .replace('ATTEMPTS=30', 'ATTEMPTS=2')
      .replace('sleep 15', 'sleep 0');
    const scriptPath = join(dir, 'step.sh');
    const outputPath = join(dir, 'github-output');
    writeFileSync(scriptPath, script, 'utf8');
    writeFileSync(outputPath, '', 'utf8');
    const result = spawnSync('bash', ['-e', scriptPath], {
      encoding: 'utf8',
      env: { ...process.env, VERSION: '1.2.3', GITHUB_OUTPUT: outputPath },
    });
    return {
      status: result.status,
      stderr: result.stderr,
      output: readFileSync(outputPath, 'utf8'),
    };
  }

  it('fails and writes no sha when the tarball is missing', () => {
    const run = runStep(pathToFileURL(join(dir, 'missing.tgz')).href);
    expect(run.status).toBe(1);
    expect(run.output).toBe('');
    expect(run.stderr).toContain(
      'npm did not serve a non-empty tarball for v1.2.3 after 2 attempts',
    );
  });

  it('fails and writes no sha when the download is empty', () => {
    const empty = join(dir, 'empty.tgz');
    writeFileSync(empty, '');
    const run = runStep(pathToFileURL(empty).href);
    expect(run.status).toBe(1);
    expect(run.output).toBe('');
  });

  it('writes the SHA-256 of the downloaded file', () => {
    const tarball = join(dir, 'good.tgz');
    writeFileSync(tarball, 'tarball bytes');
    const run = runStep(pathToFileURL(tarball).href);
    const expected = createHash('sha256').update('tarball bytes').digest('hex');
    expect(run.status).toBe(0);
    expect(run.output).toBe(`sha256=${expected}\n`);
  });
});
