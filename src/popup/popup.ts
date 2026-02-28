import type { OrchestratorStatus, LogEntry, SpeedMode } from '../shared/types';

let currentMode: 'idle' | 'running' | 'paused' = 'idle';

document.addEventListener('DOMContentLoaded', async () => {
  // Restore state from background on every popup open
  const state = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
  if (state && !state.error) {
    updateUI(state);
  }

  // Listen for live updates while popup is open
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'STATUS_UPDATE') updateUI(msg.payload);
    if (msg.type === 'LOG_ENTRY') appendLog(msg.payload);
  });

  // Start / Resume button (same button, different behavior based on state)
  document.getElementById('startBtn')!.addEventListener('click', () => {
    if (currentMode === 'paused') {
      chrome.runtime.sendMessage({ type: 'RESUME_GRIND' });
      setControlState('running');
    } else {
      const config = {
        maxPricePerPlayer: parseInt(
          (document.getElementById('maxPrice') as HTMLInputElement).value
        ),
        totalBudget: parseInt(
          (document.getElementById('totalBudget') as HTMLInputElement).value
        ),
        repeatCount: parseInt(
          (document.getElementById('repeatCount') as HTMLInputElement).value
        ),
        speedMode: (document.getElementById('speedMode') as HTMLSelectElement).value as SpeedMode,
      };
      chrome.runtime.sendMessage({ type: 'START_GRIND', config });
      setControlState('running');
    }
  });

  // Pause button
  document.getElementById('pauseBtn')!.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'PAUSE_GRIND' });
  });

  // Stop button
  document.getElementById('stopBtn')!.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_GRIND' });
    setControlState('idle');
  });

  // Kill button — instant stop, always available when running/paused
  document.getElementById('killBtn')!.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_GRIND' });
    setControlState('idle');
  });
});

const STATUS_COLORS: Record<string, string> = {
  idle: '#666',
  running: '#4CAF50',
  paused: '#FF9800',
  error: '#e94560',
  complete: '#2196F3',
};

function updateUI(state: {
  status: OrchestratorStatus;
  completedSquads: number;
  totalSquads: number;
  totalCoinsSpent: number;
  currentRepeat: number;
  totalRepeats: number;
  completedLeagues?: string[];
  currentLeague?: string | null;
  logs?: LogEntry[];
}): void {
  const statusDot = document.getElementById('statusDot')!;
  const statusText = document.getElementById('statusText')!;
  const progress = document.getElementById('progress')!;
  const currentLeagueEl = document.getElementById('currentLeague')!;
  const repeatProgress = document.getElementById('repeatProgress')!;

  const displayStatus = state.status === 'idle' ? 'idle' :
    ['complete', 'paused', 'error'].includes(state.status) ? state.status : 'running';

  statusDot.style.backgroundColor = STATUS_COLORS[displayStatus] ?? '#666';
  statusText.textContent = state.status.replace(/_/g, ' ');
  progress.textContent = `${state.completedSquads}/${state.totalSquads} squads`;
  repeatProgress.textContent = `Repeat ${state.currentRepeat}/${state.totalRepeats}`;

  // Show current league being worked on
  if (state.currentLeague) {
    currentLeagueEl.textContent = `Current: ${state.currentLeague}`;
  } else if (state.completedLeagues && state.completedLeagues.length > 0) {
    currentLeagueEl.textContent = `Done: ${state.completedLeagues.join(', ')}`;
  } else {
    currentLeagueEl.textContent = '';
  }

  if (state.status === 'idle' || state.status === 'complete' || state.status === 'error') {
    setControlState('idle');
  } else if (state.status === 'paused') {
    setControlState('paused');
  } else {
    setControlState('running');
  }

  // Populate logs if provided (on popup open)
  if (state.logs) {
    const logEl = document.getElementById('activityLog')!;
    logEl.innerHTML = '';
    for (const entry of state.logs) {
      appendLog(entry);
    }
  }
}

function appendLog(entry: LogEntry): void {
  const logEl = document.getElementById('activityLog')!;
  const time = new Date(entry.timestamp).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const div = document.createElement('div');
  div.className = `log-entry log-${entry.level}`;
  div.textContent = `${time} ${entry.message}`;
  logEl.prepend(div);
  while (logEl.children.length > 50) logEl.removeChild(logEl.lastChild!);
}

function setControlState(mode: 'idle' | 'running' | 'paused'): void {
  currentMode = mode;
  const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
  const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
  const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
  const killBtn = document.getElementById('killBtn') as HTMLButtonElement;

  switch (mode) {
    case 'idle':
      startBtn.disabled = false;
      startBtn.textContent = 'Start League Grind';
      pauseBtn.disabled = true;
      stopBtn.disabled = true;
      killBtn.disabled = true;
      break;
    case 'running':
      startBtn.disabled = true;
      startBtn.textContent = 'Start League Grind';
      pauseBtn.disabled = false;
      stopBtn.disabled = false;
      killBtn.disabled = false;
      break;
    case 'paused':
      startBtn.disabled = false;
      startBtn.textContent = 'Resume';
      pauseBtn.disabled = true;
      stopBtn.disabled = false;
      killBtn.disabled = false;
      break;
  }
}
