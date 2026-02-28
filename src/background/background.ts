import { log } from '../shared/logger';
import { init, processNextStep } from './orchestrator';
import { routeMessage } from './messageRouter';

log('Service worker started');

// Initialize orchestrator — restores persisted state if worker was killed
init();

// Keepalive alarm — prevents Chrome from killing the service worker during automation.
// Fires every 24 seconds (0.4 minutes). On each tick, the orchestrator processes
// one step of the state machine if it's in an active state.
chrome.alarms.create('orchestrator-tick', { periodInMinutes: 0.4 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'orchestrator-tick') {
    await processNextStep();
  }
});

// Message router — handles messages from popup and content script.
// Delegates all routing to messageRouter.ts for clean separation.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  routeMessage(msg).then(sendResponse);
  return true; // Required for async sendResponse
});
