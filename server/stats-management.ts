import express, { type Request } from 'express';

const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
export function isLocalManagementRequest(request: Request, mutation = false): boolean {
  if (!loopback.has(request.socket.remoteAddress ?? '')) return false;
  // A tunnel also connects over loopback, so the socket address alone is insufficient.
  for (const header of ['cf-ray', 'cf-connecting-ip', 'forwarded', 'x-forwarded-for', 'x-forwarded-host']) {
    if (request.headers[header]) return false;
  }
  const host = request.headers.host;
  if (!host) return false;
  let origin: string;
  try {
    const address = new URL(`http://${host}`);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(address.hostname) || address.username || address.password || address.pathname !== '/') return false;
    origin = address.origin;
  } catch { return false; }
  if (request.headers['sec-fetch-site'] && request.headers['sec-fetch-site'] !== 'same-origin') return false;
  if (request.headers.origin && request.headers.origin !== origin) return false;
  if (mutation && (request.headers.origin !== origin || request.headers['x-gridfall-management'] !== '1')) return false;
  return true;
}

export type ManagementConfig = { url: string; importKey?: string; adminKey?: string };
export function managementCapabilities(request: Request, config: ManagementConfig) {
  const local = isLocalManagementRequest(request);
  return { canImport: local && Boolean(config.importKey && config.importKey.length >= 32),
    canDelete: local && Boolean(config.adminKey && config.adminKey.length >= 32) };
}
export function statsManagementRouter(config: ManagementConfig, send: typeof fetch = fetch): express.Router {
  const router = express.Router();
  router.use((request, response, next) => {
    if (!isLocalManagementRequest(request, true)) { response.status(403).json({ error: 'Management is available only on the host at localhost.' }); return; }
    next();
  });
  async function forward(request: Request, response: express.Response, importing: boolean): Promise<void> {
    const key = importing ? config.importKey : config.adminKey;
    if (!key || key.length < 32) { response.status(503).json({ error: 'Management key is not configured on this host.' }); return; }
    const id = request.params.id;
    if (!importing && (typeof id !== 'string' || !/^[a-zA-Z0-9:_-]{1,160}$/.test(id))) { response.status(400).json({ error: 'Invalid match ID' }); return; }
    try {
      const upstream = await send(`${config.url.replace(/\/$/, '')}${importing ? '/imports' : `/matches/${encodeURIComponent(id as string)}`}`, {
        method: importing ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${key}`, ...(importing ? { 'Content-Type': 'application/json' } : {}) },
        ...(importing ? { body: JSON.stringify(request.body) } : {}), signal: AbortSignal.timeout(15_000),
      });
      // Forward only a bounded receipt/error shape, never credentials or arbitrary upstream content.
      const receipt = await upstream.json() as { id?: string; duplicate?: boolean; deleted?: boolean; error?: string };
      response.status(upstream.status).json(upstream.ok ? { id: receipt.id, duplicate: receipt.duplicate, deleted: receipt.deleted }
        : { error: upstream.status === 401 ? 'Host management credentials were rejected.' : receipt.error ?? 'Statistics request failed.' });
    } catch { response.status(502).json({ error: 'Statistics service unavailable. Retry is safe.' }); }
  }
  router.post('/imports', express.json({ limit: '128kb' }), (request, response) => void forward(request, response, true));
  router.delete('/matches/:id', (request, response) => void forward(request, response, false));
  return router;
}
