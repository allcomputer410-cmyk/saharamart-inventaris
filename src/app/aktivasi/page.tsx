'use client';
import { useState } from 'react';
export default function Activation() {
  const [password,setPassword]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  return <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
    <form className="bg-white p-8 rounded-xl shadow-sm w-full max-w-sm space-y-4" onSubmit={async e=>{
      e.preventDefault();setBusy(true);setMessage('');
      try {
        const response=await fetch('/api/activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:window.location.hash.slice(1),password})});
        const data=await response.json(); if(!response.ok) throw new Error(data.error||'Gagal mengaktifkan akun');
        window.history.replaceState(null,'',window.location.pathname);setDone(true);setPassword('');
      }catch(error){setMessage(error instanceof Error?error.message:'Tidak dapat menghubungi server');}finally{setBusy(false);}
    }}>
      <h1 className="text-xl font-semibold">Aktifkan akun inventaris</h1>
      {done?<p>Akun siap digunakan. <a className="text-blue-600 underline" href="/login">Masuk</a></p>:<>
        <label className="block">Password baru<input className="input-field mt-2" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <p className="text-sm text-red-600" role="alert">{message}</p>
        <button className="btn-primary w-full" disabled={busy}>{busy?'Menyimpan...':'Simpan password'}</button>
      </>}
    </form>
  </main>;
}
