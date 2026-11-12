// Node (Google Cloud Run / เครื่องตัวเอง): เสิร์ฟทั้งหน้าเว็บใน public/ และ /api จาก process เดียว
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { secureHeaders } from 'hono/secure-headers';
import { createApp } from '../server/app.js';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const app = createApp({ readEnv: () => process.env });
// CSP เดียวกับ public/_headers (Cloudflare) และ vercel.json
app.use(
  '/*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      styleSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
    referrerPolicy: 'no-referrer',
  }),
);
app.use('/*', serveStatic({ root: './public' }));

const port = Number(process.env.PORT) || 8080;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[wp-app] http://localhost:${info.port}`);
});
