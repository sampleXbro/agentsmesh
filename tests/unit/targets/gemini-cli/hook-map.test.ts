/**
 * Gemini tests a BeforeTool/AfterTool matcher as a regex against its own tool
 * names (run_shell_command, write_file, replace, ...), so a canonical
 * `Edit|Write|Bash` passed through verbatim never fires
 * (geminicli.com/docs/reference/tools, geminicli.com/docs/hooks/reference).
 */

import { describe, expect, it } from 'vitest';
import { fromGeminiMatcher, toGeminiMatcher } from '../../../../src/targets/gemini-cli/hook-map.js';

describe('toGeminiMatcher', () => {
  it('translates canonical tool names to anchored Gemini tool names', () => {
    expect(toGeminiMatcher('BeforeTool', 'Edit|Write|NotebookEdit|Bash|PowerShell')).toBe(
      '^(?:replace|write_file|run_shell_command)$',
    );
    expect(toGeminiMatcher('AfterTool', 'Read')).toBe('^(?:read_file|read_many_files)$');
    expect(toGeminiMatcher('AfterTool', 'Edit, Write')).toBe('^(?:replace|write_file)$');
    expect(toGeminiMatcher('BeforeTool', 'Grep|Glob|LS|WebFetch|WebSearch|TodoWrite')).toBe(
      '^(?:grep_search|glob|list_directory|web_fetch|google_web_search|write_todos)$',
    );
  });

  it('keeps unknown names as exact names', () => {
    expect(toGeminiMatcher('BeforeTool', 'Bash|run_shell_command|mcp_github_create')).toBe(
      '^(?:run_shell_command|mcp_github_create)$',
    );
  });

  it('leaves wildcards, regexes, tools with no Gemini twin, and lifecycle matchers alone', () => {
    expect(toGeminiMatcher('BeforeTool', '*')).toBe('*');
    expect(toGeminiMatcher('BeforeTool', '')).toBe('');
    expect(toGeminiMatcher('BeforeTool', 'read_.*')).toBe('read_.*');
    expect(toGeminiMatcher('BeforeTool', 'NotebookEdit')).toBe('NotebookEdit');
    expect(toGeminiMatcher('SessionStart', 'startup')).toBe('startup');
    expect(toGeminiMatcher('BeforeAgent', 'Edit')).toBe('Edit');
  });
});

describe('fromGeminiMatcher', () => {
  it('maps anchored and plain Gemini tool lists back to canonical names', () => {
    expect(fromGeminiMatcher('BeforeTool', '^(?:replace|write_file|run_shell_command)$')).toBe(
      'Edit|Write|Bash',
    );
    expect(fromGeminiMatcher('AfterTool', 'read_file|read_many_files|search_file_content')).toBe(
      'Read|Grep',
    );
    expect(fromGeminiMatcher('BeforeTool', '^(?:replace|mcp_github_create)$')).toBe(
      'Edit|mcp_github_create',
    );
  });

  it('leaves wildcards, regexes and lifecycle matchers alone', () => {
    expect(fromGeminiMatcher('BeforeTool', '*')).toBe('*');
    expect(fromGeminiMatcher('BeforeTool', 'read_.*')).toBe('read_.*');
    expect(fromGeminiMatcher('SessionStart', 'startup')).toBe('startup');
  });
});
