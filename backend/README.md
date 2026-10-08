# Backend PostgreSQL mandiri

Alur: iPOS → Python sync agent → Next.js `/api/sync` → PostgREST → PostgreSQL 17.
Browser → Next.js `/api/data` dengan cookie HttpOnly → PostgREST dengan identitas pengguna dan RLS.
Tidak memerlukan akun atau layanan Supabase. Paket `@supabase/postgrest-js` hanya digunakan
sebagai pembuat query HTTP ke PostgREST lokal. SQL `auth.users` dipertahankan untuk ID dan hash
password hasil impor; Supabase Auth tidak berjalan.

## Kondisi pemulihan lokal

Backup yang diberikan: `db_cluster-29-09-2026@09-50-19.backup`, 181.564.812 byte.
49 tabel berisi 606.395 baris telah dipulihkan dan jumlahnya dicocokkan dengan backup.
Termasuk 4 toko, 16.603 baris produk lintas toko, 83.729 transaksi, dan 9 akun.
Tabel aplikasi lain yang ada di schema public ikut disimpan, tetapi tidak otomatis dibuka oleh API inventaris.
Sesi login lama tidak diimpor. Login ulang diperlukan. Data setelah tanggal backup perlu disinkronkan dari iPOS.
`operational_costs` ada di migrasi repository tetapi tidak ada di backup; tabel dibuat kosong.
Tidak ada file storage dalam backup ini (`storage.objects` berisi 0 baris).

## Menjalankan instalasi yang sudah disiapkan

Nyalakan Docker Desktop, lalu dari root proyek:

```powershell
npm run backend:up
npm run dev
```

Buka http://localhost:3000 dan coba email/password lama. Akun harus memiliki profil aktif.
Database disimpan di volume Docker `inventaris-local_inventaris_data`, bukan di folder iPOS.
Jangan menjalankan `docker compose down -v` karena opsi `-v` menghapus volume database.
Port 55432 (PostgreSQL) dan 53000 (PostgREST) hanya terikat ke localhost.
Docker Desktop perlu berjalan selama aplikasi lokal digunakan.

## Instalasi lokal baru dari backup

```powershell
npm install
npm run backend:setup
python scripts/prepare-postgres.py "PATH_KE_FILE_ATAU_FOLDER_BACKUP"
docker compose --env-file backend/.env -f backend/compose.yml up -d db
npm run backend:restore
npm run backend:verify
npm run backend:up
npm run dev
```

`backend:setup` membuat password acak ke `backend/.env` dan menambahkan konfigurasi ke `.env.local`.
Konfigurasi lama di `.env.local` tidak digunakan oleh runtime baru. `backend:restore` menolak
database yang sudah berisi tabel; tidak ada reset otomatis. Script hanya menargetkan PostgreSQL
lokal port 55432, database `inventaris`. SQL pemulihan lengkap dijalankan dalam satu transaksi.
Folder `backend/private` berisi SQL, manifest, log, dan token; diabaikan Git dan harus tetap privat.
Backup asli di Downloads tidak diubah. File `.backup` yang digunakan adalah SQL teks, bukan
format custom pg_restore. Jangan mengeksekusi dump cluster mentah ke database yang sudah dipakai.

## Sync agent

Buat kredensial per toko:

```powershell
npm run backend:sync-key
npm run backend:sync-key -- ID_TOKO
```

Perintah pertama menampilkan pilihan toko. Perintah kedua menyimpan konfigurasi privat ke
`backend/private/sync-ID_TOKO.env`. Tambahkan isinya ke `.env` di folder agent yang digunakan,
dengan pengaturan koneksi iPOS yang sudah ada:

```dotenv
INVENTORY_API_URL=http://localhost:3000/api/sync
INVENTORY_SYNC_TOKEN=isi_dari_file_privat
```

Gunakan `localhost` hanya jika agent dan aplikasi ada di komputer yang sama. Untuk komputer lain
atau VPS nanti, ganti URL ke alamat backend HTTPS. Token hanya memberi akses sync pada satu toko.
Token Supabase lama tidak digunakan oleh agent yang telah diperbarui.

```powershell
cd sync-agent
python sync_agent.py --type products
python sync_agent.py --daemon
```

Source agent utama dan source di ketiga folder `KIRIM-KE-*` telah disesuaikan. File EXE dan ZIP
lama belum dibangun ulang; jangan membagikannya sebagai versi backend baru. `ipos-sync-kit`
dan script patch/debug lama adalah alat legacy dan belum dimigrasi. Jalankan source Python yang
disebut di atas. Pembacaan langsung database iPOS/kasir belum diuji di sesi ini.

Pengiriman produk menggunakan upsert. Penjualan harian menggunakan RPC `sync_daily_sales`
yang menyimpan header dan detail dalam satu transaksi; pengulangan request mengganti hari yang
sama tanpa menambah duplikasi. Pengiriman stok mempertahankan perbandingan stok lama pada agent.

## Login dan pembaruan layar

- Password lama berupa bcrypt tetap disimpan; tidak ada password yang dicetak ke log.
- Cookie session HttpOnly, SameSite=Lax, masa sesi server 12 jam. Akun nonaktif tidak bisa memakai API.
- Pendaftaran mandiri menunggu persetujuan direktur/owner/manajer.
- Tambah pengguna menghasilkan tautan aktivasi sekali pakai, berlaku 24 jam. Salin dan bagikan
  tautan tersebut; email otomatis belum dikonfigurasi. Tidak ada klaim bahwa email telah terkirim.
- Notifikasi diperiksa setiap 15 detik, stok pesanan yang menunggu sync setiap 5 detik saat tab aktif.
- Cron analisis promo harus mengirim `Authorization: Bearer CRON_SECRET`; tanpa konfigurasi itu
  endpoint cron menolak akses. Analisis manual tetap melalui login.

## Verifikasi

```powershell
npm run backend:verify
npm run test:backend
npm run lint
npx tsc --noEmit
npm run build
```

Tes integrasi membutuhkan aplikasi berjalan di localhost:3000. Tes membuat data QA sementara
dan membersihkannya; menggunakan database lokal khusus ini, bukan database produksi.
Menguji login/logout, RLS antar toko, pencegahan eskalasi role, token sync, upsert, transaksi
penjualan, relasi, views laporan, pendaftaran/approval, dan aktivasi sekali pakai.

## Saat pindah VPS nanti

Paket ini belum dipasang ke VPS. Siapkan konfigurasi produksi terpisah, HTTPS, `APP_ORIGIN`
sesuai domain, secret baru, dan backup ke tempat di luar VPS. Database/PostgREST tetap privat;
yang diakses kasir/browser hanya API Next.js. Jangan menyalin token QA ke produksi.
Backup rutin sesudah migrasi harus mencakup database inventaris dan diuji pemulihannya.

PostgREST yang digunakan adalah layanan open source terpisah. Referensi:
[konfigurasi PostgREST](https://docs.postgrest.org/en/v13/references/configuration.html).
