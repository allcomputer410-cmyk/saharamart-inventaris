# Deploy via Portainer (Git repository + PAT) — stack `gitdevops`

App (Next.js) + PostgREST jalan sebagai stack Portainer yang ditarik langsung
dari GitHub. Database **tidak** ikut di stack: memakai Postgres yang sudah ada
di `postgres.locadev.id` (database `inventaris`).

## 0. Syarat sekali saja

1. **Cloudflare**: record `postgres.locadev.id` harus **DNS only (awan abu-abu)**.
   Proxy oranye Cloudflare hanya meneruskan HTTP, port 5432 tidak ikut.
2. **Role DB** `inventaris_app` & `authenticator` sudah punya password →
   jalankan `deploy/private/siapkan-vps.ps1` (menghasilkan `vps-stack.env`).
3. **Network** `web-network` (dipakai Caddy) sudah ada di host Docker.
4. **PAT GitHub** (repo privat):
   GitHub → Settings → Developer settings → Personal access tokens →
   *Fine-grained tokens* → Generate new token
   - Repository access: *Only select repositories* → `saharamart-inventaris-selfhost`
   - Permissions → Repository → **Contents: Read-only**
   - Simpan token (`github_pat_...`), hanya tampil sekali.

## 1. Buat stack di Portainer

Portainer → environment → **Stacks → Add stack**

| Field | Isi |
|---|---|
| Name | `gitdevops` |
| Build method | **Repository** |
| Repository URL | `https://github.com/allcomputer410-cmyk/saharamart-inventaris-selfhost` |
| Repository reference | `refs/heads/main` |
| Compose path | `deploy/portainer-stack.yml` |
| Authentication | ON → Username: `allcomputer410-cmyk`, Personal Access Token: `github_pat_...` |
| GitOps updates (opsional) | ON → Polling 5m, atau Webhook (lihat bawah) |

**Environment variables** → *Load variables from .env file* → pilih
`deploy/private/vps-stack.env`, lalu tambahkan (bila perlu):

```
DB_HOST=postgres.locadev.id
DB_PORT=5432
```

Klik **Deploy the stack**. Build pertama ±3–8 menit (npm ci + next build).

## 2. Caddy

```
inventaris.locadev.id {
    reverse_proxy inventaris-app:3000
}
```
Domain harus sama dengan `APP_ORIGIN` di env stack. Reload Caddy.

## 3. Cek

- Container `inventaris-rest` & `inventaris-app` status *running*.
- Log `inventaris-rest`: ada `Connection successful` (bukan `password authentication failed`).
- Buka `https://inventaris.locadev.id/login`.

## Update aplikasi

`git push` ke `main` repo selfhost, lalu di Portainer → stack `gitdevops` →
**Pull and redeploy** (centang *Re-pull image and redeploy* / force rebuild).
Dengan GitOps webhook: salin URL webhook dari Portainer ke GitHub →
repo → Settings → Webhooks, maka redeploy otomatis tiap push.

## Masalah umum

| Gejala | Penyebab |
|---|---|
| `authentication required` saat deploy | PAT salah/kedaluwarsa atau tidak punya akses Contents |
| `network web-network not found` | Network Caddy beda nama — ubah `web.name` di stack |
| rest: `timeout` / `could not connect` | `postgres.locadev.id` masih di-proxy Cloudflare, atau firewall 5432 |
| rest: `password authentication failed` | Jalankan ulang `siapkan-vps.ps1`, upload ulang env |
