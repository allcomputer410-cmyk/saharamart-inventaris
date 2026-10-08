const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'backend', 'private');
const args = ['compose', '--env-file', 'backend/.env', '-f', 'backend/compose.yml'];
const env = Object.fromEntries(fs.readFileSync(path.join(root,'backend','.env'),'utf8').trim().split(/\r?\n/).map(l=>l.split('=')));
const { Client } = require('pg');
(async () => {
  const client = new Client({ host:'127.0.0.1', port:55432, user:'postgres', password:env.POSTGRES_PASSWORD, database:'inventaris' });
  await client.connect();
  const exists = await client.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname IN ('public','auth','app_private')");
  if (exists.rows[0].n) throw new Error('Database tidak kosong. Restore dihentikan agar data tidak tertimpa.');
  await client.end();
  let restore = fs.readFileSync(path.join(dir,'restore.sql'),'utf8').replace(/\r\n/g,'\n').replace(/^\\set ON_ERROR_STOP on\nBEGIN;\n/,'').replace(/\nCOMMIT;\n$/,'');
  const bootstrap = fs.readFileSync(path.join(root,'backend','bootstrap.sql'),'utf8');
  const access = fs.readFileSync(path.join(root,'backend','access.sql'),'utf8') + '\n' + fs.readFileSync(path.join(root,'backend','additions.sql'),'utf8');
  if (!/^[a-f0-9]{64}$/.test(env.REST_DB_PASSWORD)) throw new Error('Konfigurasi password tidak valid');
  fs.writeFileSync(path.join(dir,'complete.sql'), `\\set ON_ERROR_STOP on\nBEGIN;\n${bootstrap}\n${restore}\n${access}\nALTER ROLE authenticator PASSWORD '${env.REST_DB_PASSWORD}';\nCOMMIT;\n`);
  for (const extra of [['cp','backend/private/complete.sql','db:/tmp/inventory-restore.sql'],
    ['exec','-T','db','psql','-X','-U','postgres','-d','inventaris','-v','ON_ERROR_STOP=1','-f','/tmp/inventory-restore.sql']]) {
    const result = spawnSync('docker', [...args,...extra], { cwd:root, encoding:'utf8', maxBuffer:16*1024*1024 });
    fs.appendFileSync(path.join(dir,'restore.log'), (result.stdout||'')+(result.stderr||''));
    if (result.status !== 0) throw new Error('Restore gagal dan transaksi dibatalkan. Detail tersimpan di backend/private/restore.log');
  }
  console.log('Database lokal dipulihkan. Jalankan npm run backend:verify untuk mencocokkan jumlah baris.');
})().catch(e=> { console.error(e.message); process.exit(1); });
