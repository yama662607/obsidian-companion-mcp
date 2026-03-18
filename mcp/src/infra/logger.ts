export function logInfo(message: string): void {
  console.error(`[mcp] ${message}`);
}

export function logError(message: string): void {
  console.error(`[mcp:error] ${message}`);
}
