import express from 'express';
import { resolve } from 'node:path';

export function serveClient(app: express.Application, directory = 'dist') {
  const root = resolve(directory);
  app.use('/assets', express.static(resolve(root, 'assets'), { maxAge: '1y', immutable: true, fallthrough: false }));
  app.use(express.static(root, { maxAge: 0 }));
  app.get(/.*/, (_request, response) => response.sendFile('index.html', { root }));
}
