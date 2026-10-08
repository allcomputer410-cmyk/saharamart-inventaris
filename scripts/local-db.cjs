const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const root=path.resolve(__dirname,'..');
const env=Object.fromEntries(fs.readFileSync(path.join(root,'backend','.env'),'utf8').trim().split(/\r?\n/).map(l=>l.split('=')));
function client() { return new Client({host:'127.0.0.1',port:55432,database:'inventaris',user:'postgres',password:env.POSTGRES_PASSWORD}); }
module.exports={client,root,env};
