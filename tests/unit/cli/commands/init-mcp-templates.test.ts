import { describe, it, expect } from 'vitest';
import {
  TEMPLATE_MCP,
  TEMPLATE_MCP_GLOBAL,
} from '../../../../src/cli/commands/init-mcp-templates.js';
import { stripJsonComments } from '../../../../src/utils/text/json-comments.js';

describe('TEMPLATE_MCP', () => {
  it('seeds the agentsmesh entry uncommented', () => {
    expect(TEMPLATE_MCP).toMatch(/"agentsmesh":\s*\{/);
    expect(TEMPLATE_MCP).toMatch(/"command":\s*"npx"/);
    expect(TEMPLATE_MCP).toMatch(/"args":\s*\["-y",\s*"agentsmesh",\s*"mcp"\]/);
  });
  it('keeps github + filesystem examples commented', () => {
    expect(TEMPLATE_MCP).toMatch(/\/\/\s*"github"/);
    expect(TEMPLATE_MCP).toMatch(/\/\/\s*"filesystem"/);
  });
  it('docs reference points to the MCP server page', () => {
    expect(TEMPLATE_MCP).toContain('reference/mcp-server');
  });
});

describe('TEMPLATE_MCP_GLOBAL', () => {
  it('has no agentsmesh MCP server entry', () => {
    expect(TEMPLATE_MCP_GLOBAL).not.toContain('agentsmesh');
  });
  it('parses to an object without an mcpServers key', () => {
    expect(JSON.parse(stripJsonComments(TEMPLATE_MCP_GLOBAL))).toEqual({});
  });
  it('keeps github + filesystem examples commented', () => {
    expect(TEMPLATE_MCP_GLOBAL).toMatch(/\/\/\s*"mcpServers"/);
    expect(TEMPLATE_MCP_GLOBAL).toMatch(/\/\/\s*"github"/);
    expect(TEMPLATE_MCP_GLOBAL).toMatch(/\/\/\s*"filesystem"/);
  });
});
