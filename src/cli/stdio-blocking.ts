/**
 * Put stdout and stderr into blocking mode.
 *
 * `process.exit` discards whatever is still queued inside an async stream, and
 * Node writes to a *pipe* asynchronously (unlike a TTY or a file, which it
 * already makes blocking). Every command that emits its payload and then exits
 * therefore truncated at the pipe buffer — 64 KiB on macOS — so
 * `agentsmesh diff --json | jq` received an unparseable fragment while the same
 * command redirected to a file was complete.
 *
 * libuv can move the fd back to blocking mode, which makes the write land
 * before `process.exit` runs. The handle is private API, so this is
 * best-effort: if the shape ever changes, or the platform refuses, we keep
 * today's behaviour rather than failing the command.
 */

interface BlockingHandle {
  setBlocking?: (blocking: boolean) => void;
}

export function makeStdioBlocking(
  streams: readonly NodeJS.WriteStream[] = [process.stdout, process.stderr],
): void {
  for (const stream of streams) {
    try {
      const handle = (stream as unknown as { _handle?: BlockingHandle })._handle;
      handle?.setBlocking?.(true);
    } catch {
      // A platform or stream that will not block stays as it is.
    }
  }
}
