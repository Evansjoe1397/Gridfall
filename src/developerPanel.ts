type DebugRow = readonly [label: string, value: string];
import { debugRecorder } from './debug-recorder';

type RecordingControls = {
  exportDump: () => void;
  markIssue: () => void;
  status: () => string;
  toggleRecording: () => void;
};

export function createDeveloperPanel(snapshot: () => readonly DebugRow[], recording?: RecordingControls) {
  const panel = document.createElement('aside');
  panel.className = 'developer-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Developer diagnostics');
  const header = document.createElement('header');
  const title = document.createElement('strong');
  title.textContent = 'DEVELOPER';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close developer panel');
  const hint = document.createElement('small');
  hint.textContent = 'Ctrl+D · updates every 0.5s';
  const rows = document.createElement('dl');
  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin:10px 0';
  const recorderStatus = document.createElement('small');
  recorderStatus.style.cssText = 'display:block;overflow-wrap:anywhere';
  function addButton(label: string, action: () => void) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText = 'padding:5px 7px;border:1px solid #49786b;border-radius:4px;background:#132b23;color:#d5ebe4;cursor:pointer;font:inherit';
    button.addEventListener('click', action);
    controls.append(button);
    return button;
  }
  if (recording) {
    addButton('Mark issue', recording.markIssue);
    addButton('Export debug dump', recording.exportDump);
    addButton('Pause/resume client recording', recording.toggleRecording);
  }
  const previousButton = addButton('Export previous', () => { void debugRecorder.exportPrevious(); });
  previousButton.hidden = true;
  header.append(title, close);
  panel.append(header, hint, controls, recorderStatus, rows);
  document.body.append(panel);

  let previousTime: number | undefined;
  let elapsed = 0;
  let frames = 0;
  let slowest = 0;
  let fastest = Infinity;
  let workTotal = 0;
  const values = new Map<string, HTMLElement>();
  function render(entries: readonly DebugRow[]) {
    recorderStatus.textContent = recording?.status() ?? debugRecorder.status();
    previousButton.hidden = !debugRecorder.hasPrevious();
    for (const [label, value] of entries) {
      let cell = values.get(label);
      if (!cell) {
        const term = document.createElement('dt');
        term.textContent = label;
        cell = document.createElement('dd');
        rows.append(term, cell);
        values.set(label, cell);
      }
      cell.textContent = value;
    }
  }
  function reset() {
    previousTime = undefined;
    elapsed = frames = slowest = 0;
    fastest = Infinity;
    workTotal = 0;
  }
  function toggle() {
    panel.hidden = !panel.hidden;
    reset();
    if (!panel.hidden) render([
      ['FPS', 'Sampling…'], ['FPS min / max', 'Sampling…'], ['Frame avg / max', 'Sampling…'], ['CPU loop avg', 'Sampling…'], ...snapshot(),
    ]);
  }
  close.addEventListener('click', toggle);
  document.addEventListener('visibilitychange', () => {
    reset();
    if (!panel.hidden) render([['FPS', 'Sampling…'], ['FPS min / max', 'Sampling…'], ['Frame avg / max', 'Sampling…'], ['CPU loop avg', 'Sampling…']]);
  });

  return {
    toggle,
    get visible() { return !panel.hidden && !document.hidden; },
    frame(time: number, workMs: number) {
      if (panel.hidden || document.hidden) return;
      if (previousTime !== undefined) {
        const duration = time - previousTime;
        elapsed += duration;
        frames++;
        slowest = Math.max(slowest, duration);
        fastest = Math.min(fastest, duration);
        workTotal += workMs;
      }
      previousTime = time;
      if (elapsed < 500) return;
      render([
        ['FPS', (frames * 1000 / elapsed).toFixed(1)],
        ['FPS min / max', `${(1000 / slowest).toFixed(1)} / ${(1000 / fastest).toFixed(1)}`],
        ['Frame avg / max', `${(elapsed / frames).toFixed(1)} / ${slowest.toFixed(1)} ms`],
        ['CPU loop avg', `${(workTotal / frames).toFixed(1)} ms`],
        ...snapshot(),
      ]);
      elapsed = frames = slowest = 0;
      fastest = Infinity;
      workTotal = 0;
    },
  };
}
