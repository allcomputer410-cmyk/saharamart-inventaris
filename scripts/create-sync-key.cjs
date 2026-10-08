const fs=require('node:fs');
const path=require('node:path');
const {randomBytes,createHash}=require('node:crypto');
const {client,root}=require('./local-db.cjs');
(async()=>{
 const db=client();await db.connect();
 try {
  const storeId=process.argv[2];
  if(!storeId) {const {rows}=await db.query('SELECT id,code,name FROM public.stores WHERE is_active ORDER BY name');console.table(rows);console.log('Pilih ID lalu: npm run backend:sync-key -- ID_TOKO');return;}
  const {rows}=await db.query('SELECT id FROM public.stores WHERE id=$1 AND is_active',[storeId]);
  if(!rows.length) throw new Error('Toko tidak ditemukan');
  const token=randomBytes(32).toString('hex');
  await db.query('INSERT INTO app_private.sync_keys(store_id,token_hash,label) VALUES($1,$2,$3)',[storeId,createHash('sha256').update(token).digest('hex'),'iPOS agent']);
  const file=path.join(root,'backend','private',`sync-${storeId}.env`);
  fs.writeFileSync(file,`INVENTORY_API_URL=http://localhost:3000/api/sync\nINVENTORY_SYNC_TOKEN=${token}\n`,{mode:0o600});
  console.log(`Token disimpan di backend/private/sync-${storeId}.env. Gabungkan dengan pengaturan iPOS pada .env agent; ganti URL jika agent ada di komputer lain.`);
 }finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exit(1);});
