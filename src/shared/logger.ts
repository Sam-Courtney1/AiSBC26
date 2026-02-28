import type { LogEntry } from './types';

const PREFIX = '[FC26 AiSBC]';

export function createLogEntry(
  level: LogEntry['level'],
  message: string
): LogEntry {
  return {
    timestamp: Date.now(),
    level,
    message,
  };
}

export function log(message: string): void {
  console.log(`${PREFIX} ${message}`);
}

export function logWarn(message: string): void {
  console.warn(`${PREFIX} ${message}`);
}

export function logError(message: string): void {
  console.error(`${PREFIX} ${message}`);
}
