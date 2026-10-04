import { cp, access } from 'node:fs/promises';

// Standalone output omits static assets; keep the local runner equivalent to Docker.
await access(new URL('../.next/standalone/server.js', import.meta.url));
await cp(new URL('../.next/static', import.meta.url), new URL('../.next/standalone/.next/static', import.meta.url), { recursive: true });
process.env.HOSTNAME ??= '127.0.0.1';
await import('../.next/standalone/server.js');
