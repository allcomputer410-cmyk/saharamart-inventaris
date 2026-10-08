// Integration tests use temporary identities/stores and remove them in finally.
const assert=require('node:assert/strict');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const {hash}=require('bcryptjs');
const {client}=require('./local-db.cjs');
const base=process.env.TEST_BASE_URL||'http://localhost:3000';
const digest=s=>createHash('sha256').update(s).digest('hex');
const suffix=randomBytes(6).toString('hex');
const pass=randomBytes(20).toString('hex');
const a=randomUUID(),b=randomUUID(),owner=randomUUID(),staff=randomUUID(),product=randomUUID();
let passed=0;
async function req(path,method='GET',body,cookie,token) {
 const headers={}; if(body!==undefined) headers['Content-Type']='application/json';
 if(cookie) headers.Cookie=cookie;
 if(token) headers.Authorization=`Bearer ${token}`;
 const r=await fetch(base+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined,redirect:'manual'});
 const text=await r.text(); let data;try{data=JSON.parse(text)}catch{data=text}
 return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
function ok(value,message) {assert.ok(value,message);passed++;console.log('PASS',message);}
(async()=>{
 const d=client();await d.connect();
 try {
  await d.query('INSERT INTO public.stores(id,code,name,type) VALUES($1,$2,$3,\'toko\'),($4,$5,$6,\'toko\')',[a,`QA-A-${suffix}`,'QA backend A',b,`QA-B-${suffix}`,'QA backend B']);
  const passwordHash=await hash(pass,10);
  for(const [id,role] of [[owner,'owner'],[staff,'supervisor']]) {
   const email=`qa-${id}@example.invalid`;
   await d.query('INSERT INTO auth.users(id,email,encrypted_password) VALUES($1,$2,$3)',[id,email,passwordHash]);
   await d.query('INSERT INTO public.user_profiles(id,email,name,role,store_id,is_active,status) VALUES($1,$2,\'QA backend\',$3,$4,true,\'active\')',[id,email,role,a]);
  }
  const login=await req('/api/auth/login','POST',{email:`qa-${staff}@example.invalid`,password:pass});
  ok(login.status===200&&login.cookie,'Login with bcrypt + HttpOnly session');
  const session=login.cookie;
  const adminLogin=await req('/api/auth/login','POST',{email:`qa-${owner}@example.invalid`,password:pass});
  const admin=adminLogin.cookie;
  ok((await req('/api/data/stores')).status===401,'Anonymous database access denied');
  ok((await req('/api/users/register?id='+staff,'PATCH',{action:'approve'})).status===401,'Anonymous approval denied');
  ok((await req('/api/users/invite','GET',undefined,session)).status===403,'Staff cannot manage users');
  const stores=await req('/api/data/stores?select=id','GET',undefined,session);
  ok(stores.status===200&&stores.data.length===1&&stores.data[0].id===a,'Staff sees only assigned store');
  const foreign=await req(`/api/data/stores?id=eq.${b}`,'PATCH',{name:'Should never change'},session);
  const unchanged=await d.query('SELECT name FROM public.stores WHERE id=$1',[b]);
  ok(foreign.status>=400||unchanged.rows[0].name==='QA backend B','Cross-store write denied');
  const elevate=await req(`/api/data/user_profiles?id=eq.${staff}`,'PATCH',{role:'owner'},session);
  ok(elevate.status>=400,'Profile privilege escalation denied');
  ok((await req('/api/data/admin_users','GET',undefined,admin)).status===404,'Unrelated sensitive tables not exposed');
  ok((await req('/api/data/rpc/update_product_image','POST',{},session)).status===404,'Arbitrary privileged RPC denied');
  const csrf=await fetch(base+'/api/auth/logout',{method:'POST',headers:{Cookie:session,Origin:'https://untrusted.invalid'},body:'{}'});
  ok(csrf.status===403,'Cross-origin mutation denied');
  const key=randomBytes(32).toString('hex');
  await d.query('INSERT INTO app_private.sync_keys(store_id,token_hash,label) VALUES($1,$2,\'QA\')',[a,digest(key)]);
  ok((await req('/api/sync/stores','GET',undefined,undefined,'wrong-token')).status===401,'Invalid sync credential denied');
  const syncStores=await req('/api/sync/stores?select=id','GET',undefined,undefined,key);
  ok(syncStores.status===200&&syncStores.data.length===1&&syncStores.data[0].id===a,'Sync key restricted to its store');
  const row={id:product,store_id:a,barcode:`QA-${suffix}`,name:'QA sync product',sell_price:12000,hpp:10000};
  for(let i=0;i<2;i++) {
   const r=await fetch(base+'/api/sync/store_products?on_conflict=store_id,barcode',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify([row])});
   assert.ok([200,201].includes(r.status),await r.text());
  }
  const count=await d.query('SELECT count(*)::int n FROM public.store_products WHERE id=$1',[product]);
  ok(count.rows[0].n===1,'Sync product upsert repeat does not duplicate');
  const foreignSync=await req('/api/sync/store_products','POST',[{...row,id:randomUUID(),store_id:b}],undefined,key);
  ok(foreignSync.status>=400,'Sync cannot insert into another store');
  const sale={store_id:a,sale_date:'2026-01-01',total_transactions:1,total_revenue:12000,total_items_sold:1,total_profit:2000};
  const items=[{store_product_id:product,qty_sold:1,revenue:12000,hpp_total:10000}];
  for(let i=0;i<2;i++) {
   const r=await req('/api/sync/rpc/sync_daily_sales','POST',{p_daily:sale,p_items:items},undefined,key);
   assert.equal(r.status,200,JSON.stringify(r.data));
  }
  const detail=await d.query('SELECT count(*)::int n FROM public.daily_sale_items i JOIN public.daily_sales s ON s.id=i.daily_sale_id WHERE s.store_id=$1',[a]);
  ok(detail.rows[0].n===1,'Repeated daily sales sync is atomic and idempotent');
  const invalid=await req('/api/sync/rpc/sync_daily_sales','POST',{p_daily:{...sale,total_revenue:999},p_items:[{...items[0],store_product_id:randomUUID()}]},undefined,key);
  const preserved=await d.query('SELECT total_revenue FROM public.daily_sales WHERE store_id=$1',[a]);
  ok(invalid.status>=400&&Number(preserved.rows[0].total_revenue)===12000,'Failed sales batch preserves previous day data');
  const nested=await req(`/api/data/store_products?select=id,name,category:categories(name),stock(current_qty)&id=eq.${product}`,'GET',undefined,session);
  ok(nested.status===200&&nested.data[0]?.id===product,'Nested relationship queries work');
  for(const table of ['v_margin_rendah','v_rekap_kasir','v_sale_items_detail','operational_costs']) {
   const r=await req(`/api/data/${table}?limit=1`,'GET',undefined,session);
   ok(r.status===200,`${table} accessible with RLS`);
  }
  const invitation=await req('/api/users/invite','POST',{email:`qa-invite-${suffix}@example.invalid`,name:'QA invited',role:'supervisor',store_id:a},admin);
  ok(invitation.status===200&&invitation.data.activation_url,'Manager creates activation link');
  const token=new URL(invitation.data.activation_url).hash.slice(1);
  const activation=await req('/api/activate','POST',{token,password:pass});
  ok(activation.status===200,'Activation sets password');
  ok((await req('/api/activate','POST',{token,password:pass})).status===400,'Activation token single use');
  const reg=await req('/api/users/register','POST',{email:`qa-register-${suffix}@example.invalid`,name:'QA register',store_id:a,password:pass});
  ok(reg.status===200,'Self registration creates pending profile');
  ok((await req('/api/auth/login','POST',{email:`qa-register-${suffix}@example.invalid`,password:pass})).status===403,'Pending profile cannot login');
  const registered=await d.query('SELECT id FROM public.user_profiles WHERE email=$1',[`qa-register-${suffix}@example.invalid`]);
  const approve=await req('/api/users/register?id='+registered.rows[0].id,'PATCH',{action:'approve',role:'supervisor'},admin);
  ok(approve.status===200,'Manager approves registration');
  await req('/api/auth/logout','POST',{},session);
  ok((await req('/api/data/stores','GET',undefined,session)).status===401,'Logout revokes stored session');
  console.log(`ALL ${passed} integration checks passed`);
 }finally{
  await d.query('DELETE FROM public.notifications WHERE store_id IN($1,$2)',[a,b]);
  await d.query('DELETE FROM public.daily_sale_items WHERE daily_sale_id IN(SELECT id FROM public.daily_sales WHERE store_id IN($1,$2))',[a,b]);
  await d.query('DELETE FROM public.daily_sales WHERE store_id IN($1,$2)',[a,b]);
  await d.query('DELETE FROM public.store_products WHERE id=$1',[product]);
  await d.query('DELETE FROM app_private.sync_keys WHERE store_id IN($1,$2)',[a,b]);
  const users=await d.query('SELECT id FROM public.user_profiles WHERE store_id IN($1,$2)',[a,b]);
  await d.query('DELETE FROM public.user_profiles WHERE store_id IN($1,$2)',[a,b]);
  for(const u of users.rows) await d.query('DELETE FROM auth.users WHERE id=$1',[u.id]);
  await d.query('DELETE FROM public.stores WHERE id IN($1,$2)',[a,b]);
  await d.end();
 }
})().catch(e=>{console.error(e.message);process.exit(1);});
