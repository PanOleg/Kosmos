import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS із самопідписаним сертифікатом: Wake Lock (екран не гасне) працює лише в захищеному
// контексті. Телефон один раз попросить підтвердити сертифікат.
// CONTROLLER_HTTP=1 — без TLS (автотести в браузері, тунелі, що самі дають HTTPS).
const http = process.env.CONTROLLER_HTTP === '1';

// base /controller/: так пульт однаково живе й окремо (:5174/controller/), і за проксі екрана,
// і в продакшн-збірці поруч з екраном.
export default defineConfig({
  base: '/controller/',
  plugins: http ? [] : [basicSsl()],
  server: { host: true, port: 5174 },
});
