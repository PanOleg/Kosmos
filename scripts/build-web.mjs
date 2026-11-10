// Один сайт для хостингу: екран у корені, пульт у /controller/ (його base у vite.config).
import { cpSync, rmSync } from 'node:fs';

const out = 'packages/screen/dist/controller';
rmSync(out, { recursive: true, force: true });
cpSync('packages/controller/dist', out, { recursive: true });
