import { networkInterfaces } from 'node:os';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Запис озвучки власним голосом (DECISIONS.md, п. 55): сторінка /record.html шле кожну фразу
 * сюди, dev-сервер кладе її в scripts/voice/raw/<id>.webm. Лише в dev, у збірку не потрапляє.
 */
function voiceRecorder(): Plugin {
  const root = resolve(__dirname, '../..');
  const raw = resolve(root, 'scripts/voice/raw');
  return {
    name: 'voice-recorder',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__voice', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://x');
        if (req.method === 'GET' && url.pathname === '/lines') {
          res.setHeader('content-type', 'application/json');
          res.end(readFileSync(resolve(root, 'scripts/voice/lines.json')));
          return;
        }
        if (req.method === 'GET' && url.pathname === '/list') {
          mkdirSync(raw, { recursive: true });
          const ids = readdirSync(raw)
            .filter((f) => f.endsWith('.webm'))
            .map((f) => f.slice(0, -5));
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(ids));
          return;
        }
        const rawId = /^\/raw\/([a-zA-Z0-9]+)$/.exec(url.pathname)?.[1];
        if (req.method === 'GET' && rawId) {
          try {
            res.setHeader('content-type', 'audio/webm');
            res.end(readFileSync(resolve(raw, `${rawId}.webm`)));
          } catch {
            res.statusCode = 404;
            res.end();
          }
          return;
        }
        const id = /^\/save\/([a-zA-Z0-9]+)$/.exec(url.pathname)?.[1];
        if (req.method === 'POST' && id) {
          const chunks: Buffer[] = [];
          req.on('data', (c: Buffer) => chunks.push(c));
          req.on('end', () => {
            mkdirSync(raw, { recursive: true });
            writeFileSync(resolve(raw, `${id}.webm`), Buffer.concat(chunks));
            res.end('ok');
          });
          return;
        }
        res.statusCode = 404;
        res.end();
      });
    },
  };
}

/**
 * Телефон відкриває пульт за QR-кодом, тож у QR потрібна LAN-адреса цього комп'ютера,
 * а не localhost. VITE_CONTROLLER_URL перекриває автовизначення (прод, тунель, інший порт).
 */
function lanAddress(): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) return a.address;
    }
  }
  return 'localhost';
}

const controllerHttp = process.env.CONTROLLER_HTTP === '1';

export default defineConfig(({ mode }) => ({
  plugins: [voiceRecorder()],
  server: {
    host: true,
    port: 5173,
    // Пульт на тому ж origin, що й екран: потрібно для локального транспорту (?net=local).
    proxy: {
      '/controller': {
        target: `${controllerHttp ? 'http' : 'https'}://localhost:5174`,
        secure: false,
        ws: true,
      },
    },
  },
  define: {
    __LAN_IP__: JSON.stringify(mode === 'production' ? '' : lanAddress()),
    __CONTROLLER_URL__: JSON.stringify(
      process.env.VITE_CONTROLLER_URL ??
        (mode === 'production'
          ? '/controller/'
          : `${controllerHttp ? 'http' : 'https'}://${lanAddress()}:5174/controller/`),
    ),
  },
}));
