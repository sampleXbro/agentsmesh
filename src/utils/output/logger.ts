// Colored console output

import { colorEnabled } from './color.js';

const C = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

let muted = false;
let stdoutRedirectedToStderr = false;

export function muteLogger(): void {
  muted = true;
}

export function unmuteLogger(): void {
  muted = false;
}

export function redirectLoggerToStderr(): void {
  stdoutRedirectedToStderr = true;
}

function outStream(): NodeJS.WriteStream {
  return stdoutRedirectedToStderr ? process.stderr : process.stdout;
}

function out(text: string): void {
  outStream().write(text);
}

function c(code: string, text: string, stream: NodeJS.WriteStream): string {
  return colorEnabled(stream) ? `${code}${text}${C.reset}` : text;
}

export const logger = {
  info(msg: string): void {
    if (muted) return;
    out(c(C.cyan, msg, outStream()) + '\n');
  },
  warn(msg: string): void {
    if (muted) return;
    process.stderr.write(c(C.yellow, '⚠ ', process.stderr) + msg + '\n');
  },
  error(msg: string): void {
    if (muted) return;
    process.stderr.write(c(C.red, '✗ ', process.stderr) + msg + '\n');
  },
  success(msg: string): void {
    if (muted) return;
    out(c(C.green, '✓ ', outStream()) + msg + '\n');
  },
  debug(msg: string): void {
    if (muted) return;
    if (process.env.AGENTSMESH_DEBUG === '1') {
      out(c(C.cyan, '[debug] ', outStream()) + msg + '\n');
    }
  },
};
