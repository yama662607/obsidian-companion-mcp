export function logInfo(message: string): void {
  console.error(`[bridge] ${message}`);
}

export function logError(message: string): void {
  console.error(`[bridge:error] ${message}`);
}
