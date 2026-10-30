import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { permissionsSchema } from '../../../src/schemas/canonical-schemas.js';

// `deny:` with no list under it is valid YAML (null) and means "unmanaged",
// so the schema must not make editors flag it.
describe('permissions schema and a list key with no list', () => {
  it('accepts null for every list', () => {
    expect(permissionsSchema.safeParse({ allow: null, deny: null, ask: null }).success).toBe(true);
  });

  it('allows null for every list in the published JSON Schema', () => {
    const schema = JSON.parse(readFileSync('schemas/permissions.json', 'utf-8')) as {
      properties: Record<string, { anyOf?: Array<{ type?: string }> }>;
    };

    for (const list of ['allow', 'deny', 'ask']) {
      expect(schema.properties[list]!.anyOf!.map((option) => option.type)).toEqual([
        'array',
        'null',
      ]);
    }
  });
});
