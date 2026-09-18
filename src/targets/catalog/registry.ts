import type { TargetDescriptor } from './target-descriptor.js';
import { BUILTIN_TARGETS } from './builtin-targets.js';
import { validateDescriptor } from './target-descriptor.schema.js';

const descriptorRegistry = new Map<string, TargetDescriptor>();

let _builtinDescriptors: Map<string, TargetDescriptor> | undefined;
function builtinDescriptors(): Map<string, TargetDescriptor> {
  if (_builtinDescriptors) return _builtinDescriptors;
  // Filter undefined slots: when a descriptor's path callback transitively
  // looks up another descriptor during the circular-import resolution
  // window (e.g. cline's `agentPath` → `shouldConvertAgentsToSkills` →
  // `getDescriptor`), BUILTIN_TARGETS may temporarily contain TDZ holes.
  // Don't cache until every slot is populated, so the next call after
  // module load completes gets a full map. See `.agentsmesh/lessons/journal.md:248` for
  // the original trap; contract is locked by `registry.test.ts`
  // "builtin descriptor lookup (circular-import contract)".
  const defined = BUILTIN_TARGETS.filter(
    (d): d is TargetDescriptor => d !== undefined && typeof d.id === 'string',
  );
  const map = new Map(defined.map((d) => [d.id, d]));
  if (defined.length === BUILTIN_TARGETS.length) {
    _builtinDescriptors = map;
  }
  return map;
}

/** Register a full target descriptor (for plugins). */
export function registerTargetDescriptor(descriptor: TargetDescriptor): void {
  const validated = validateDescriptor(descriptor);
  descriptorRegistry.set(validated.id, validated);
}

/** Look up a full descriptor by target ID. */
export function getDescriptor(name: string): TargetDescriptor | undefined {
  return descriptorRegistry.get(name) ?? builtinDescriptors().get(name);
}

export function getAllDescriptors(): TargetDescriptor[] {
  return [...descriptorRegistry.values()];
}

/**
 * IDs of every descriptor available via `getDescriptor`: builtins plus any
 * runtime-registered plugin descriptors. Plugin IDs that override a builtin
 * appear once. Use this when callers need to **enumerate** every target —
 * e.g. install-time helpers asking "which targets claim non-`.md` command
 * extensions?". Don't use `TARGET_IDS` (builtin-only) or
 * `getAllDescriptors()` (plugin-only) for that question.
 */
export function getAllRegisteredDescriptorIds(): readonly string[] {
  const ids = new Set<string>([...builtinDescriptors().keys(), ...descriptorRegistry.keys()]);
  return [...ids];
}

export function resetRegistry(): void {
  descriptorRegistry.clear();
}
