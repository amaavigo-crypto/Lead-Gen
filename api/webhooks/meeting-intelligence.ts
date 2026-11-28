import type { IncomingMessage, ServerResponse } from 'http';
import { handleCoreApi } from '../../src/server/coreApiHandler.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req: IncomingMessage & { body?: any; rawBody?: Buffer }, res: ServerResponse) {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks);
    req.rawBody = rawBody;
    try {
      req.body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {};
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid JSON webhook payload.' }));
      return;
    }
    const handled = await handleCoreApi(req, res);
    if (handled) return;
    if (!res.writableEnded) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Webhook route not found.' }));
    }
  } catch (error: any) {
    console.error('[Meeting Intelligence webhook endpoint]', error?.message || error);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Webhook request failed.' }));
    }
  }
}
