import fs from 'node:fs';
const dst = 'server/.env';
if (!fs.existsSync(dst)) { fs.copyFileSync('server/.env.example', dst); console.log('Created server/.env from .env.example'); }
