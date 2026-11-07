import { onGameAssetActivity } from './game-assets.ts';

const screen = document.getElementById('assetLoading')!;
const progress = document.getElementById('assetProgress') as HTMLProgressElement;
const status = document.getElementById('assetStatus')!;
const retry = document.getElementById('assetRetry') as HTMLButtonElement;
const app = document.getElementById('app')!;
let mainStarted = false;
let main: typeof import('./main.ts') | undefined;
let generation = 0;
let preparationFailed = false;
let pendingAssets = 0;

document.addEventListener('keydown', event => {
  if (!screen.hidden) event.stopImmediatePropagation();
}, { capture: true });

function failed(error: unknown) {
  preparationFailed = true;
  console.error('Game preparation failed.', error);
  screen.hidden = false;
  app.inert = true;
  screen.setAttribute('aria-busy', 'false');
  status.textContent = 'Could not prepare the game. Check your connection and try again.';
  retry.hidden = false;
}

async function revealWhenReady(token: number) {
  // Flush nested attachment promises (weapons, spirit forms, textures) first.
  await new Promise(resolve => setTimeout(resolve, 0));
  if (token !== generation || !main || preparationFailed || pendingAssets > 0) return;
  try {
    await main.prepareVisibleGameGraphics();
    if (token === generation && !preparationFailed && pendingAssets === 0) {
      screen.hidden = true;
      app.inert = false;
      screen.setAttribute('aria-busy', 'false');
    }
  } catch (error) { failed(error); }
}

async function start() {
  app.inert = true;
  preparationFailed = false;
  retry.hidden = true;
  screen.setAttribute('aria-busy', 'true');
  try {
    progress.removeAttribute('value');
    status.textContent = 'Starting Gridfall…';
    onGameAssetActivity(({ pending, error, progress: resources, status: message }) => {
      pendingAssets = pending;
      const token = ++generation;
      if (error) { failed(error); return; }
      if (pending > 0) {
        screen.hidden = false;
        app.inert = true;
        screen.setAttribute('aria-busy', 'true');
        if (message) {
          progress.removeAttribute('value');
          status.textContent = message;
        } else if (resources?.totalBytes) {
          progress.max = resources.totalBytes;
          progress.value = resources.loadedBytes;
          status.textContent = `Preparing resources · ${resources.completed}/${resources.total} · ${(resources.loadedBytes / 1048576).toFixed(1)} / ${(resources.totalBytes / 1048576).toFixed(1)} MiB`;
        } else {
          progress.removeAttribute('value');
          status.textContent = 'Preparing models and textures…';
        }
      } else void revealWhenReady(token);
    });
    mainStarted = true;
    main = await import('./main.ts');
    void revealWhenReady(generation);
  } catch (error) {
    failed(error);
  }
}

retry.addEventListener('click', () => {
  if (mainStarted) location.reload();
  else void start();
});
void start();
