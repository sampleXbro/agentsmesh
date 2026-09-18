/**
 * Descriptor-driven importer spec for Goose.
 *
 * Extracted from `index.ts` to keep that file under the 200-line cap. The shared
 * runner (`runDescriptorImport`) walks these specs per scope:
 *   - rules  → `.goosehints` (project) / global `.goosehints`
 *   - mcp    → plugin `.mcp.json` (project) / global `config.yaml` extensions
 *   - ignore → `.gooseignore` (project) / global `.gooseignore`
 */

import { AB_IGNORE, AB_RULES } from '../../core/canonical-paths.js';
import type { TargetImporterDescriptor } from '../catalog/import-descriptor.js';
import { gooseMcpMap } from './mcp-import.js';
import {
  GOOSE_ROOT_FILE,
  GOOSE_IGNORE,
  GOOSE_PROJECT_MCP_FILE,
  GOOSE_GLOBAL_ROOT_FILE,
  GOOSE_GLOBAL_IGNORE,
  GOOSE_GLOBAL_CONFIG,
} from './constants.js';

export const gooseImporter: TargetImporterDescriptor = {
  rules: {
    feature: 'rules',
    mode: 'singleFile',
    source: {
      project: [GOOSE_ROOT_FILE],
      global: [GOOSE_GLOBAL_ROOT_FILE],
    },
    canonicalDir: AB_RULES,
    canonicalRootFilename: '_root.md',
    markAsRoot: true,
  },
  mcp: {
    feature: 'mcp',
    mode: 'singleFile',
    // Two shapes behind one feature: the plugin `.mcp.json` at project scope and
    // the bespoke `extensions` YAML globally. `gooseMcpMap` picks by source path.
    source: { project: [GOOSE_PROJECT_MCP_FILE], global: [GOOSE_GLOBAL_CONFIG] },
    canonicalDir: '.agentsmesh',
    canonicalRootFilename: 'mcp.json',
    map: gooseMcpMap,
  },
  ignore: {
    feature: 'ignore',
    mode: 'flatFile',
    source: {
      project: [GOOSE_IGNORE],
      global: [GOOSE_GLOBAL_IGNORE],
    },
    canonicalDir: '.agentsmesh',
    canonicalFilename: AB_IGNORE,
  },
};
