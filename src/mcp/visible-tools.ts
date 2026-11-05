import { findAgentsmeshProject } from './context.js';
import {
  RESOURCE_DESCRIPTORS,
  TOOL_DESCRIPTORS,
  type ResourceDescriptor,
  type ToolDescriptor,
} from './register.js';

/**
 * The tools a client sees from `cwd`. Outside an agentsmesh project only the
 * tools that need none (the lessons tools) work, so only they are listed.
 */
export async function visibleTools(cwd: string): Promise<readonly ToolDescriptor[]> {
  if ((await findAgentsmeshProject(cwd)) !== null) return TOOL_DESCRIPTORS;
  return TOOL_DESCRIPTORS.filter((d) => d.projectOptional === true);
}

/** The resources a client sees from `cwd`: every one reads project config. */
export async function visibleResources(cwd: string): Promise<readonly ResourceDescriptor[]> {
  return (await findAgentsmeshProject(cwd)) === null ? [] : RESOURCE_DESCRIPTORS;
}
