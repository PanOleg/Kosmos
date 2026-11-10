import { networkInterfaces } from 'node:os';
import { defineConfig } from 'vite';

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
    __CONTROLLER_URL__: JSON.stringify(
      process.env.VITE_CONTROLLER_URL ??
        (mode === 'production'
          ? '/controller/'
          : `${controllerHttp ? 'http' : 'https'}://${lanAddress()}:5174/controller/`),
    ),
  },
}));
