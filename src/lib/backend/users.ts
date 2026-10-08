import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';
import { db } from './db';
import { ApiError, apiError, canManageStore, checkOrigin, digest, rateLimit, requireManager, ROLES, User } from './auth';

const validId = (value: unknown): value is string => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
function validate(body: Record<string, unknown>) {
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100) throw new ApiError(400, 'Nama wajib diisi (maksimum 100 karakter)');
  if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.email.length > 200) throw new ApiError(400, 'Email tidak valid');
  if (body.phone && (typeof body.phone !== 'string' || body.phone.length > 20)) throw new ApiError(400, 'Nomor telepon tidak valid');
  if (body.permissions != null && (!Array.isArray(body.permissions) || !body.permissions.every(p=>typeof p === 'string'))) throw new ApiError(400, 'Hak akses tidak valid');
}
function validateRole(manager: User, role: string, store: string | null) {
  if (!ROLES.includes(role)) throw new ApiError(400, 'Role tidak valid');
  if (!['direktur','owner'].includes(manager.role) && (['direktur','owner','gm','manajer'].includes(role) || !canManageStore(manager,store))) throw new ApiError(403, 'Tidak dapat memberikan hak akses tersebut');
  if (!['direktur','owner','gm'].includes(role) && !validId(store)) throw new ApiError(400, 'Pilih toko untuk akun ini');
}
async function targetUser(manager: User, id: string | null) {
  if (!validId(id)) throw new ApiError(400, 'ID pengguna tidak valid');
  const { rows } = await db().query('SELECT * FROM public.user_profiles WHERE id=$1',[id]);
  const target = rows[0];
  if (!target) throw new ApiError(404, 'Pengguna tidak ditemukan');
  if (!canManageStore(manager,target.store_id) || (manager.role==='manajer' && ['direktur','owner','manajer','gm'].includes(target.role))) throw new ApiError(403, 'Akses ditolak');
  return target;
}

export async function register(request: NextRequest) {
  try {
    checkOrigin(request);
    const body = await request.json(); validate(body);
    if (!validId(body.store_id)) throw new ApiError(400,'Pilih toko');
    if (typeof body.password !== 'string' || body.password.length < 8 || Buffer.byteLength(body.password)>72) throw new ApiError(400,'Password harus 8–72 byte');
    await rateLimit('register:global',30,3600);
    const client=await db().connect();
    try {
      await client.query('BEGIN');
      const store=await client.query('SELECT id FROM public.stores WHERE id=$1 AND is_active=true',[body.store_id]);
      if (!store.rowCount) throw new ApiError(400,'Toko tidak aktif');
      const id=randomUUID(), email=body.email.trim().toLowerCase();
      await client.query('INSERT INTO auth.users(id,email,encrypted_password,created_at,updated_at,email_confirmed_at) VALUES($1,$2,$3,now(),now(),now())',[id,email,await hash(body.password,12)]);
      await client.query(`INSERT INTO public.user_profiles(id,email,name,role,store_id,phone,is_active,status) VALUES($1,$2,$3,'supervisor',$4,$5,false,'pending')`,[id,email,body.name.trim(),body.store_id,body.phone||null]);
      await client.query(`INSERT INTO public.notifications(store_id,type,title,message,is_read) VALUES($1,'new_registration','Permintaan Akun Baru',$2,false)`,[body.store_id,`${body.name.trim()} meminta akses ke toko ini.`]);
      await client.query('COMMIT'); return NextResponse.json({success:true});
    } catch (e) { await client.query('ROLLBACK'); if ((e as {code?:string}).code==='23505') throw new ApiError(409,'Email sudah terdaftar'); throw e; }
    finally { client.release(); }
  } catch(e) { return apiError(e); }
}
export async function approve(request: NextRequest) {
  try {
    checkOrigin(request); const manager=await requireManager();
    const target=await targetUser(manager,request.nextUrl.searchParams.get('id'));
    const body=await request.json();
    if (!['approve','reject'].includes(body.action)) throw new ApiError(400,'Tindakan tidak valid');
    if (target.id===manager.id) throw new ApiError(400,'Tidak dapat mengubah status akun sendiri');
    const role=body.role||'supervisor'; validateRole(manager,role,target.store_id);
    await db().query('UPDATE public.user_profiles SET status=$1,is_active=$2,role=$3 WHERE id=$4',[body.action==='approve'?'active':'rejected',body.action==='approve',role,target.id]);
    await db().query('DELETE FROM app_private.sessions WHERE user_id=$1',[target.id]);
    return NextResponse.json({success:true});
  } catch(e) { return apiError(e); }
}
export async function manage(request: NextRequest) {
  try {
    checkOrigin(request); const manager=await requireManager();
    if (request.method==='GET') {
      const {rows}=await db().query(`SELECT p.*,json_build_object('id',s.id,'name',s.name,'code',s.code) AS store FROM public.user_profiles p
        LEFT JOIN public.stores s ON s.id=p.store_id JOIN auth.users u ON u.id=p.id
        WHERE u.deleted_at IS NULL AND ($1 OR p.store_id=$2) ORDER BY p.name`,[['direktur','owner'].includes(manager.role),manager.store_id]);
      return NextResponse.json({success:true,data:rows});
    }
    if (request.method==='POST') {
      const body=await request.json(); validate(body);
      const store=['direktur','owner'].includes(body.role)?null:body.store_id||null;
      validateRole(manager,body.role,store);
      const id=randomUUID(), token=randomBytes(32).toString('hex');
      const client=await db().connect();
      try {
        await client.query('BEGIN');
        await client.query('INSERT INTO auth.users(id,email,created_at,updated_at) VALUES($1,$2,now(),now())',[id,body.email.trim().toLowerCase()]);
        await client.query(`INSERT INTO public.user_profiles(id,name,email,role,store_id,phone,is_active,permissions,status) VALUES($1,$2,$3,$4,$5,$6,true,$7,'active')`,[id,body.name.trim(),body.email.trim().toLowerCase(),body.role,store,body.phone||null,JSON.stringify(body.permissions??null)]);
        await client.query(`INSERT INTO app_private.invitations(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '24 hours')`,[digest(token),id]);
        await client.query('COMMIT');
      } catch(e) { await client.query('ROLLBACK'); if ((e as {code?:string}).code==='23505') throw new ApiError(409,'Email sudah terdaftar'); throw e; }
      finally { client.release(); }
      return NextResponse.json({success:true,user_id:id,activation_url:`${process.env.APP_ORIGIN||request.nextUrl.origin}/aktivasi#${token}`});
    }
    const target=await targetUser(manager,request.nextUrl.searchParams.get('id'));
    if (target.id===manager.id) throw new ApiError(400,'Kelola akun sendiri melalui Pengaturan');
    const client=await db().connect();
    try {
      await client.query('BEGIN');
      if (request.method==='DELETE') {
        // Historical foreign keys retain the identity; revoke access instead of destroying history.
        await client.query("UPDATE public.user_profiles SET is_active=false,status='rejected' WHERE id=$1",[target.id]);
        await client.query('UPDATE auth.users SET deleted_at=now(),encrypted_password=NULL WHERE id=$1',[target.id]);
      } else {
        const body=await request.json();
        const next={...target,...Object.fromEntries(Object.entries(body).filter(([k])=>['name','email','phone','role','store_id','is_active','feature_enabled','permissions'].includes(k)))};
        validate(next); validateRole(manager,next.role,next.store_id);
        if (typeof next.is_active!=='boolean' || typeof next.feature_enabled!=='boolean') throw new ApiError(400,'Status tidak valid');
        await client.query('UPDATE public.user_profiles SET name=$1,email=$2,phone=$3,role=$4,store_id=$5,is_active=$6,feature_enabled=$7,permissions=$8 WHERE id=$9',[next.name,next.email.trim().toLowerCase(),next.phone,next.role,next.store_id,next.is_active,next.feature_enabled,JSON.stringify(next.permissions),target.id]);
        await client.query('UPDATE auth.users SET email=$1,updated_at=now() WHERE id=$2',[next.email.trim().toLowerCase(),target.id]);
      }
      await client.query('DELETE FROM app_private.sessions WHERE user_id=$1',[target.id]);
      await client.query('DELETE FROM app_private.invitations WHERE user_id=$1',[target.id]);
      await client.query('COMMIT');
    } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    return NextResponse.json({success:true});
  } catch(e) { return apiError(e); }
}
