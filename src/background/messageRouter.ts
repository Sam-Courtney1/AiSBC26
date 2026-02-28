import type { UserConfig } from '../shared/types';
import {
  start,
  pause,
  resume,
  stop,
  getStatus,
  updateConfig,
} from './orchestrator';
import { log } from '../shared/logger';

/**
 * Routes all incoming messages (from popup + content script) to
 * the appropriate handler.
 *
 * Popup messages: START_GRIND, PAUSE_GRIND, RESUME_GRIND, STOP_GRIND,
 *                 GET_STATUS, UPDATE_CONFIG
 */
export async function routeMessage(
  msg: { type: string; payload?: unknown; config?: Partial<UserConfig> }
): Promise<unknown> {
  switch (msg.type) {
    case 'GET_STATUS':
      return getStatus();

    case 'START_GRIND': {
      const config = (msg.config ?? msg.payload ?? {}) as Partial<UserConfig>;
      await start(config);
      return { success: true };
    }

    case 'PAUSE_GRIND':
      await pause();
      return { success: true };

    case 'RESUME_GRIND':
      await resume();
      return { success: true };

    case 'STOP_GRIND':
      await stop();
      return { success: true };

    case 'UPDATE_CONFIG': {
      const config = (msg.config ?? msg.payload ?? {}) as Partial<UserConfig>;
      updateConfig(config);
      return { success: true };
    }

    case 'PAGE_CHANGED':
      log(`Page changed: ${(msg.payload as { page: string })?.page}`);
      return { success: true };

    default:
      return { error: `Unknown message type: ${msg.type}` };
  }
}
