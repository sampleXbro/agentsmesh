/**
 * Install methods shown by the hero snippet. Plain ESM so `node --test` can
 * exercise it without a TypeScript toolchain.
 */

/** @typedef {{ id: 'brew' | 'curl' | 'npm', label: string, note: string, command: string }} InstallMethod */

/** @type {readonly InstallMethod[]} */
export const INSTALL_METHODS = Object.freeze([
  {
    id: 'brew',
    label: 'Homebrew',
    note: 'No Node.js needed',
    command: 'brew install samplexbro/agentsmesh/agentsmesh',
  },
  {
    id: 'curl',
    label: 'Binary',
    note: 'Linux, macOS, Windows',
    command:
      'curl -fsSL https://github.com/sampleXbro/agentsmesh/releases/latest/download/install.sh | sh',
  },
  {
    id: 'npm',
    label: 'npm',
    note: 'Node.js 20.19+',
    command: 'npm install -D agentsmesh',
  },
]);
