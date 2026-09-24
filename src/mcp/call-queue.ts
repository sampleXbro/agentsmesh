/**
 * Runs MCP tool calls one at a time, in the order they arrive. A client may
 * send several calls without waiting, and each write tool reads a file, changes
 * it and writes it back, so parallel calls lost each other's changes while all
 * of them reported success (#134). One queue covers every tool at once.
 */
export function createCallQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let last: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = last.then(task);
    last = run.catch(() => undefined);
    return run;
  };
}
