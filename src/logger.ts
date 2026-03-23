export function log(scope: string, message: string): void {
  process.stderr.write(`[${scope}] ${message}\n`);
}

export function logError(scope: string, message: string): void {
  process.stderr.write(`[${scope}] ERROR ${message}\n`);
}
