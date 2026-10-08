const fs=require('node:fs');
const path=require('node:path');
const {client,root}=require('./local-db.cjs');
(async()=>{
 const db=client();await db.connect();
 try {
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'backend','private','manifest.json'),'utf8'));
  let total=0;
  for(const [table,expected] of Object.entries(manifest.row_counts)) {
   if(!/^(public|auth)\.[a-z_]+$/.test(table)) throw new Error('Invalid table');
   const {rows}=await db.query(`SELECT count(*)::int n FROM ${table}`);
   if(rows[0].n!==expected) throw new Error(`Jumlah baris ${table} berbeda: ${rows[0].n} / ${expected}`);
   total+=expected;
  }
  console.log(`PASS: ${Object.keys(manifest.row_counts).length} tabel, ${total.toLocaleString('en-US')} baris cocok dengan backup.`);
 }finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exit(1);});
