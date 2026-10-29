import { describe, it, expect } from 'vitest';
import { descriptor } from '../../../../src/targets/replit-agent/index.js';
import {
  REPLIT_AGENT_ROOT_FILE,
  REPLIT_AGENT_SKILLS_DIR,
} from '../../../../src/targets/replit-agent/constants.js';

describe('replit-agent descriptor', () => {
  it('has correct target id', () => {
    expect(descriptor.id).toBe('replit-agent');
  });

  it('has project layout with rootInstructionPath', () => {
    expect(descriptor.project.rootInstructionPath).toBe(REPLIT_AGENT_ROOT_FILE);
  });

  it('has project layout with skillDir', () => {
    expect(descriptor.project.skillDir).toBe(REPLIT_AGENT_SKILLS_DIR);
  });

  it('has managed outputs for project scope', () => {
    expect(descriptor.project.managedOutputs).toEqual({
      dirs: [REPLIT_AGENT_SKILLS_DIR],
      files: [REPLIT_AGENT_ROOT_FILE],
    });
  });

  it('does not have globalSupport (Replit is cloud-only)', () => {
    expect(descriptor).not.toHaveProperty('globalSupport');
  });

  it('has correct project capabilities', () => {
    expect(descriptor.capabilities.rules).toBe('native');
    expect(descriptor.capabilities.additionalRules).toBe('embedded');
    expect(descriptor.capabilities.commands).toBe('embedded');
    expect(descriptor.capabilities.agents).toBe('embedded');
    expect(descriptor.capabilities.skills).toBe('native');
    expect(descriptor.capabilities.mcp).toBe('partial');
    expect(descriptor.capabilities.hooks).toBe('none');
    expect(descriptor.capabilities.ignore).toBe('none');
    expect(descriptor.capabilities.permissions).toBe('partial');
  });

  it('supports conversion for commands and agents', () => {
    expect(descriptor.supportsConversion).toEqual({
      commands: true,
      agents: true,
    });
  });

  it('declares .agents/skills/ as consumer shared artifact', () => {
    expect(descriptor.sharedArtifacts).toEqual({
      '.agents/skills/': 'consumer',
    });
  });

  it('has detection paths containing replit.md', () => {
    expect(descriptor.detectionPaths).toEqual([REPLIT_AGENT_ROOT_FILE]);
  });

  it('has importer descriptor for rules', () => {
    expect(descriptor.importer).toBeDefined();
    expect(descriptor.importer!.rules).toBeDefined();
    expect(descriptor.importer!.rules.mode).toBe('singleFile');
    expect(descriptor.importer!.rules.source.project).toEqual([REPLIT_AGENT_ROOT_FILE]);
  });

  it('has lint hooks for unsupported features', () => {
    expect(descriptor.lint).toBeDefined();
    expect(descriptor.lint!.hooks).toBeDefined();
    expect(descriptor.lint!.permissions).toBeDefined();
    expect(descriptor.lint!.ignore).toBeDefined();
    expect(descriptor.lint!.mcp).toBeDefined();
  });

  it('has lintRules function', () => {
    expect(descriptor.lintRules).toBeDefined();
    expect(typeof descriptor.lintRules).toBe('function');
  });

  it('has a non-empty emptyImportMessage', () => {
    expect(descriptor.emptyImportMessage.length).toBeGreaterThan(0);
    expect(descriptor.emptyImportMessage).toContain('Replit Agent');
  });

  it('project paths resolve rule to root file', () => {
    expect(descriptor.project.paths.rulePath('typescript', {} as never)).toBe(
      REPLIT_AGENT_ROOT_FILE,
    );
  });

  it('project paths resolve command to skills dir', () => {
    const cmdPath = descriptor.project.paths.commandPath('review', {} as never);
    expect(cmdPath).toContain(REPLIT_AGENT_SKILLS_DIR);
    expect(cmdPath).toContain('SKILL.md');
  });

  it('project paths resolve agent to skills dir', () => {
    const agentPath = descriptor.project.paths.agentPath('researcher', {} as never);
    expect(agentPath).toContain(REPLIT_AGENT_SKILLS_DIR);
    expect(agentPath).toContain('SKILL.md');
  });
});
