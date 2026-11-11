import { put } from '@vercel/blob';

/**
 * Збір журналів діагностики (DECISIONS.md, п. 71): екран і пульт надсилають сюди нові рядки
 * свого журналу; кожна порція — окремий файл у приватному сховищі Vercel Blob
 * `logs/<дата>/<кімната>/<час>-<роль>-<сесія>.txt`. Нічого, крім рядків журналу, не зберігаємо
 * (ані IP, ані cookie). Вхід публічний, тож розмір і форма суворо обмежені.
 */
const MAX_LINES = 150;
const MAX_LINE = 300;
const MAX_BODY = 48 * 1024;
const ID = /^[A-Za-z0-9]{1,16}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  // Лише з власних сторінок гри: чужий сайт не має слати сюди з браузера відвідувача.
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return res.status(403).end();
  let body = req.body;
  try {
    // sendBeacon шле text/plain — тоді тіло приходить рядком.
    if (typeof body === 'string') {
      if (body.length > MAX_BODY) return res.status(413).end();
      body = JSON.parse(body);
    }
  } catch {
    return res.status(400).end();
  }
  if (!body || typeof body !== 'object' || !Array.isArray(body.lines)) return res.status(400).end();
  const role = body.role === 'screen' ? 'screen' : 'controller';
  const room = ID.test(body.room ?? '') ? body.room : 'noroom';
  const sid = ID.test(body.sid ?? '') ? body.sid : 'nosid';
  const lines = body.lines
    .filter((l) => typeof l === 'string')
    .slice(-MAX_LINES)
    .map((l) => l.slice(0, MAX_LINE).replace(/[\r\n]+/g, ' '));
  if (lines.length === 0) return res.status(204).end();
  const text = lines.join('\n');
  if (text.length > MAX_BODY) return res.status(413).end();
  const now = new Date().toISOString();
  const path = `logs/${now.slice(0, 10)}/${room}/${now.slice(11, 19).replace(/:/g, '')}-${role}-${sid}.txt`;
  try {
    await put(path, text, {
      access: 'private',
      addRandomSuffix: true,
      contentType: 'text/plain; charset=utf-8',
    });
  } catch (e) {
    console.error('log upload failed', e);
    return res.status(500).end();
  }
  return res.status(204).end();
}
