const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, 'backend', '.env');
if (fs.existsSync(envPath)) {
  console.log('backend/.env sudah ada; kredensial tidak diubah.');
  process.exit(0);
}
const secret = () => crypto.randomBytes(32).toString('hex');
const password = secret();
const jwt = secret();
const restPassword = secret();
fs.writeFileSync(envPath, `POSTGRES_PASSWORD=${password}\nREST_DB_PASSWORD=${restPassword}\nPOSTGREST_JWT_SECRET=${jwt}\n`, { mode: 0o600 });
const localPath = path.join(root, '.env.local');
let current = fs.existsSync(localPath) ? fs.readFileSync(localPath, 'utf8') : '';
const values = {
  DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:55432/inventaris`,
  POSTGREST_URL: 'http://127.0.0.1:53000', POSTGREST_JWT_SECRET: jwt,
  APP_ORIGIN: 'http://localhost:3000',
};
for (const [key, value] of Object.entries(values)) {
  current = current.replace(new RegExp(`^${key}=.*\\r?\\n?`, 'gm'), '');
  current += `\n${key}=${value}\n`;
}
fs.writeFileSync(localPath, current, { mode: 0o600 });
console.log('Konfigurasi lokal dibuat. Kredensial hanya disimpan di file yang diabaikan Git.');
