import type { Permissions } from './types.js';

export const PERMISSION_LISTS = ['allow', 'deny', 'ask'] as const;

export type PermissionList = (typeof PERMISSION_LISTS)[number];

/** Every entry of the managed lists; an unmanaged list adds nothing. */
export function permissionEntries(permissions: Permissions | null): string[] {
  return PERMISSION_LISTS.flatMap((list) => permissions?.[list] ?? []);
}

/**
 * The managed lists among `lists` (the ones a tool reads). An unmanaged list is
 * left out, so a key-scoped merge keeps the tool's own value; an empty managed
 * list stays, so writing it clears the tool's list.
 */
export function managedLists<K extends PermissionList>(
  permissions: Permissions | null,
  lists: readonly K[],
): Partial<Record<K, string[]>> {
  const managed: Partial<Record<K, string[]>> = {};
  for (const list of lists) {
    const entries = permissions?.[list];
    if (entries !== undefined) managed[list] = entries;
  }
  return managed;
}
