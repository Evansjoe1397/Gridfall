import { chooseNagrandCommand } from './nagrand-bot.ts';
import type { MerylinObservation } from './merylin-bot-observation.ts';

self.onmessage = (event: MessageEvent<{ revision: number; observation: MerylinObservation }>) => {
  try { self.postMessage({ revision: event.data.revision, decision: chooseNagrandCommand(event.data.observation) }); }
  catch (error) { self.postMessage({ revision: event.data.revision, error: error instanceof Error ? error.message : String(error) }); }
};
