import type { CommandResult } from './command-result.js';

export function emitJson(command: string, result: CommandResult): void {
  const envelope: Record<string, unknown> = { success: result.success, command };
  if (result.success) {
    envelope.data = result.data;
  } else {
    envelope.error = result.error;
    if (result.code !== undefined) envelope.code = result.code;
    if (result.data !== undefined) envelope.data = result.data;
  }
  process.stdout.write(JSON.stringify(envelope) + '\n');
}
