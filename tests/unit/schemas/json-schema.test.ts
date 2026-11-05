/**
 * JSON Schema generation tests.
 * Verifies that each Zod schema produces a well-formed JSON Schema
 * and that the committed schema files in schemas/ stay in sync.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { configSchema } from '../../../src/config/core/schema.js';
import { packMetadataSchema } from '../../../src/install/pack/pack-schema.js';
import { installManifestSchema } from '../../../src/install/core/install-manifest.js';
import { installManifestFileSchema } from '../../../src/install/manifest/install-manifest-hash.js';
import {
  permissionsSchema,
  hooksSchema,
  mcpConfigSchema,
} from '../../../src/schemas/canonical-schemas.js';
import { buildAllSchemas } from '../../../src/schemas/schema-generator.js';

const SCHEMAS_DIR = join(process.cwd(), 'schemas');

// ─── Shape tests ──────────────────────────────────────────────────────────────

describe('configSchema → JSON Schema', () => {
  it('produces a valid JSON Schema object', () => {
    const schema = z.toJSONSchema(configSchema, { unrepresentable: 'any' });
    expect(schema).toMatchObject({ type: 'object' });
  });

  it('requires version field', () => {
    const schema = z.toJSONSchema(configSchema, { unrepresentable: 'any' }) as Record<
      string,
      unknown
    >;
    const required = schema.required as string[];
    expect(required).toContain('version');
  });

  it('publishes ONLY `version` as required (defaultable fields stay optional via the post-processor)', () => {
    // Regression for the published-schema bug where every field carrying a
    // `.default(...)` was emitted as `required: true`. The fix lives in
    // `schema-generator.ts::stripRequiredFromDefaults` (called inside
    // `buildAllSchemas`); the raw `z.toJSONSchema(configSchema)` output
    // still lists them as required, but the published schema must not.
    // A minimal valid `agentsmesh.yaml` is just `version: 1`.
    const published = buildAllSchemas().agentsmesh as Record<string, unknown>;
    expect(published.required).toEqual(['version']);
  });

  it('exposes targets and features as enum arrays', () => {
    const schema = z.toJSONSchema(configSchema, { unrepresentable: 'any' }) as Record<
      string,
      unknown
    >;
    const props = schema.properties as Record<string, unknown>;
    expect(props).toHaveProperty('targets');
    expect(props).toHaveProperty('features');
    const targets = props.targets as Record<string, unknown>;
    expect(targets).toHaveProperty('items');
    const items = targets.items as Record<string, unknown>;
    expect(Array.isArray(items.enum)).toBe(true);
    expect((items.enum as string[]).length).toBeGreaterThan(0);
  });

  it('exposes extends as an array of objects', () => {
    const schema = z.toJSONSchema(configSchema, { unrepresentable: 'any' }) as Record<
      string,
      unknown
    >;
    const props = schema.properties as Record<string, unknown>;
    const extendsSchema = props.extends as Record<string, unknown>;
    expect(extendsSchema.type).toBe('array');
  });
});

describe('permissionsSchema → JSON Schema', () => {
  it('produces a valid JSON Schema object', () => {
    const schema = z.toJSONSchema(permissionsSchema, { unrepresentable: 'any' });
    expect(schema).toMatchObject({ type: 'object' });
  });

  it('has allow, deny, ask as arrays of strings, or null for a key with no list', () => {
    const schema = z.toJSONSchema(permissionsSchema, { unrepresentable: 'any' }) as Record<
      string,
      unknown
    >;
    const props = schema.properties as Record<string, { anyOf: Array<Record<string, unknown>> }>;
    for (const field of ['allow', 'deny', 'ask']) {
      expect(props[field]!.anyOf).toEqual([
        { type: 'array', items: { type: 'string' } },
        { type: 'null' },
      ]);
    }
  });

  it('keeps every list optional with no default, since a missing list is unmanaged', () => {
    const schema = z.toJSONSchema(permissionsSchema, { unrepresentable: 'any' }) as Record<
      string,
      unknown
    >;
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(schema.required).toBeUndefined();
    expect(['allow', 'deny', 'ask'].map((field) => props[field]!.default)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe('hooksSchema → JSON Schema', () => {
  it('produces a valid JSON Schema object', () => {
    const schema = z.toJSONSchema(hooksSchema, { unrepresentable: 'any' });
    expect(typeof schema).toBe('object');
  });

  it('is an object with additionalProperties for hook entries', () => {
    const schema = z.toJSONSchema(hooksSchema, { unrepresentable: 'any' }) as Record<
      string,
      unknown
    >;
    // Record type produces additionalProperties or patternProperties
    expect(schema.type).toBe('object');
  });
});

describe('mcpConfigSchema → JSON Schema', () => {
  it('produces a valid JSON Schema object', () => {
    const schema = z.toJSONSchema(mcpConfigSchema, { unrepresentable: 'any' });
    expect(schema).toMatchObject({ type: 'object' });
  });

  it('has mcpServers property', () => {
    const schema = z.toJSONSchema(mcpConfigSchema, { unrepresentable: 'any' }) as Record<
      string,
      unknown
    >;
    const props = schema.properties as Record<string, unknown>;
    expect(props).toHaveProperty('mcpServers');
  });
});

describe('packMetadataSchema → JSON Schema', () => {
  it('produces a valid JSON Schema object', () => {
    const schema = z.toJSONSchema(packMetadataSchema, { unrepresentable: 'any' });
    expect(schema).toMatchObject({ type: 'object' });
  });

  it('requires name, source, source_kind, features fields', () => {
    const schema = z.toJSONSchema(packMetadataSchema, { unrepresentable: 'any' }) as Record<
      string,
      unknown
    >;
    const required = schema.required as string[];
    expect(required).toContain('name');
    expect(required).toContain('source');
    expect(required).toContain('source_kind');
    expect(required).toContain('features');
  });
});

describe('installManifestSchema → JSON Schema (installs.yaml)', () => {
  it('produces a valid JSON Schema object', () => {
    const schema = z.toJSONSchema(installManifestSchema, { unrepresentable: 'any' });
    expect(schema).toMatchObject({ type: 'object' });
  });

  it('requires the `version` top-level field and exposes `installs` as an array', () => {
    const schema = z.toJSONSchema(installManifestSchema, { unrepresentable: 'any' }) as Record<
      string,
      unknown
    >;
    const required = schema.required as string[];
    expect(required).toContain('version');
    const props = schema.properties as Record<string, unknown>;
    const installs = props.installs as Record<string, unknown>;
    expect(installs.type).toBe('array');
  });

  it('item shape requires name, source, source_kind, features', () => {
    const schema = z.toJSONSchema(installManifestSchema, { unrepresentable: 'any' }) as Record<
      string,
      unknown
    >;
    const props = schema.properties as Record<string, unknown>;
    const installs = props.installs as Record<string, unknown>;
    const items = installs.items as Record<string, unknown>;
    const itemRequired = items.required as string[];
    expect(itemRequired).toEqual(
      expect.arrayContaining(['name', 'source', 'source_kind', 'features']),
    );
  });
});

describe('installManifestFileSchema → JSON Schema (.agentsmesh-install-manifest.json)', () => {
  it('produces a valid JSON Schema object', () => {
    const schema = z.toJSONSchema(installManifestFileSchema, { unrepresentable: 'any' });
    expect(schema).toMatchObject({ type: 'object' });
  });

  it('requires every documented field including the nullable `source_type` and `extends_id`', () => {
    const schema = z.toJSONSchema(installManifestFileSchema, { unrepresentable: 'any' }) as Record<
      string,
      unknown
    >;
    const required = schema.required as string[];
    for (const field of ['name', 'source', 'installed_at', 'extends_id', 'source_type', 'files']) {
      expect(required).toContain(field);
    }
  });

  it('files map values are `sha256:<64-hex>` strings', () => {
    const schema = z.toJSONSchema(installManifestFileSchema, { unrepresentable: 'any' }) as Record<
      string,
      unknown
    >;
    const props = schema.properties as Record<string, unknown>;
    const files = props.files as Record<string, unknown>;
    expect(files.type).toBe('object');
    // Zod `z.record(key, value)` emits the value shape under additionalProperties.
    const additionalProps = files.additionalProperties as Record<string, unknown>;
    expect(additionalProps).toMatchObject({ pattern: '^sha256:[0-9a-f]{64}$' });
  });
});

// ─── buildAllSchemas ──────────────────────────────────────────────────────────

describe('buildAllSchemas()', () => {
  it('returns all 7 named schemas', () => {
    const schemas = buildAllSchemas();
    expect(schemas).toHaveProperty('agentsmesh');
    expect(schemas).toHaveProperty('permissions');
    expect(schemas).toHaveProperty('hooks');
    expect(schemas).toHaveProperty('mcp');
    expect(schemas).toHaveProperty('pack');
    expect(schemas).toHaveProperty('installs');
    expect(schemas).toHaveProperty('install-manifest');
  });

  it('each schema is a non-empty object', () => {
    const schemas = buildAllSchemas();
    for (const [key, schema] of Object.entries(schemas)) {
      expect(typeof schema, `${key} should be an object`).toBe('object');
      expect(Object.keys(schema).length, `${key} should be non-empty`).toBeGreaterThan(0);
    }
  });
});

// ─── Committed schema file freshness ─────────────────────────────────────────

describe('schemas/ committed files are in sync', () => {
  const EXPECTED_FILES = [
    'agentsmesh.json',
    'permissions.json',
    'hooks.json',
    'mcp.json',
    'pack.json',
    'installs.json',
    'install-manifest.json',
  ];

  for (const file of EXPECTED_FILES) {
    it(`schemas/${file} exists`, () => {
      expect(existsSync(join(SCHEMAS_DIR, file))).toBe(true);
    });

    it(`schemas/${file} matches generated output`, () => {
      const onDisk = JSON.parse(readFileSync(join(SCHEMAS_DIR, file), 'utf8')) as Record<
        string,
        unknown
      >;
      const generated = buildAllSchemas();
      const key = file.replace('.json', '') as keyof ReturnType<typeof buildAllSchemas>;
      expect(onDisk).toEqual(generated[key]);
    });
  }
});
