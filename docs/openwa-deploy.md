# Deployment OpenWA (Gateway WhatsApp PintaSend)

Dokumentasi operasional server **OpenWA** yang dipakai PintaSend sebagai gateway WhatsApp.
Terakhir diperbarui: **20 Agu 2026 — upgrade v0.18.0 → v0.22.0** (349 commit / 4 rilis).

## Ringkasan

| Item | Nilai |
|---|---|
| Host | VPS `94.237.68.57` (AlmaLinux, 1 CPU / 1 GB, Singapura) |
| SSH | `root@94.237.68.57`, key `~/.ssh/nalaniaga-vps` (port 22) |
| Lokasi kode | `/opt/openwa` — git clone `https://github.com/rmyndharis/OpenWA` |
| Versi berjalan | **v0.22.0** (cek: `/api/health` dengan API key) |
| Runtime | podman (emulasi CLI docker) + `docker-compose` v5.4.0 |
| Container | `openwa-api` (image `ghcr.io/rmyndharis/openwa:latest`) · `openwa-docker-proxy` (tecnativa/docker-socket-proxy:v0.4.2) |
| Port | `127.0.0.1:2785` — **hanya localhost, tidak terbuka ke publik** |
| Akses eksternal | Hanya via Cloudflare Tunnel → `https://owa.nalaniaga.id` (service `cloudflared`, token-based) |
| Data | volume `openwa_openwa-data` → `/app/data` (SQLite, sessions, plugins, media, `.api-key`) |
| Backup | `/root/openwa-backup-20260820/` (tar volume + `.env` + compose lama) |

## Arsitektur

```
Browser/Worker ──► https://owa.nalaniaga.id  (Cloudflare Tunnel)
                        │
                        ▼
        cloudflared  ──► 127.0.0.1:2785  ──►  openwa-api (podman container)
                                                     │
                        ┌────────────────────────────┤
                        ▼                            ▼
              SQLite (/app/data/*.sqlite)   S3 Backblaze B2 (media)
              Engine: Baileys
```

- **PintaSend** (Cloudflare Workers) hanya memanggil via hostname tunnel `https://owa.nalaniaga.id` —
  Worker memblokir fetch IP mentah (error 1003). Jangan ubah `OPENWA_BASE_URL` ke IP.
- **Database:** SQLite (`main.sqlite` + `openwa.sqlite` di volume), bukan Postgres.
- **Storage media:** S3 (Backblaze B2, bucket `myopenwa`).
- **Engine:** Baileys (`ENGINE_TYPE=baileys`), `AUTO_START_SESSIONS=true` (session auto-start saat boot).
- **API key:** admin key auto-generated saat first boot, tersimpan di `/app/data/.api-key`
  (`owa_k1_...`, 71 karakter). Digunakan PintaSend sebagai `OPENWA_ADMIN_KEY`.

## Konfigurasi (`/opt/openwa/.env`)

| Key | Nilai | Catatan |
|---|---|---|
| `NODE_ENV` | `production` | Wajib salah satu dari `production`/`development`/`test` sejak v0.18 |
| `ENGINE_TYPE` | `baileys` | |
| `AUTO_START_SESSIONS` | `true` | Restart-resilience: session tersambung ulang saat boot |
| `STORAGE_TYPE` | `s3` | Media di Backblaze B2 |
| `S3_ENDPOINT` | `s3.eu-central-003.backblazeb2.com` | |
| `S3_BUCKET` / `S3_REGION` | `myopenwa` / `eu-central-003` | |
| `LOG_LEVEL` | `info` | |
| `OPENWA_MEM_LIMIT` | (default `2g`) | |

Setting lain (DATABASE_TYPE, engine detail, dst.) dikelola via dashboard
Infrastructure dan tersimpan di `/app/data/.env.generated`.

## Modifikasi lokal `docker-compose.yml` (wajib di-reapply tiap upgrade)

Repo adalah clone upstream, tapi `docker-compose.yml` di-*patch* lokal agar cocok
dengan deployment ini. Saat `git pull`, file ini akan konflik — reapply 4 hal berikut:

1. **`build:` → `image:`** — VPS 1 GB tidak bisa build image; pakai image prebuilt:
   ```yaml
   image: ghcr.io/rmyndharis/openwa:latest   # ganti blok build: context+dockerfile
   ```
2. **Bind `127.0.0.1:2785`** — upstream default sudah benar; **jangan** ubah ke `0.0.0.0`
   (membuka API ke publik; insiden 20 Agu 2026).
3. **Topologi network** — docker-proxy ikut `openwa-network` (tanpa network
   `internal-docker`). Hapus definisi `internal-docker` di bagian `networks:`.
4. **Healthcheck bentuk `CMD-SHELL`** — podman memecah argumen flow-array
   `[ 'CMD', 'node', '-e', "…, …" ]` pada koma di dalam script. Gunakan bentuk:
   ```yaml
   healthcheck:
     test: ["CMD-SHELL", "node -e \"require('http').get('http://localhost:2785/api/health/ready', (r) => process.exit(r.statusCode === 200 ? 0 : 1))\""]
     interval: 30s
     timeout: 10s
     retries: 3
     start_period: 30s
   ```

## Prosedur upgrade (yang dipakai 20 Agu 2026)

```bash
# 1. Backup (di VPS)
BK=/root/openwa-backup-$(date +%Y%m%d); mkdir -p $BK
cd /opt/openwa
cp -a .env docker-compose.yml $BK/
tar czf $BK/openwa-data-volume.tar.gz \
  -C /var/lib/containers/storage/volumes openwa_openwa-data

# 2. Tarik kode terbaru (discard dulu patch compose — sudah ter-backup)
git checkout -- docker-compose.yml
git pull --ff-only origin main
git describe --tags   # pastikan versi baru (mis. v0.22.0-…)

# 3. Reapply 4 modifikasi lokal di docker-compose.yml (lihat bagian atas)
#    lalu validasi:
docker-compose config -q

# 4. Tarik image baru & recreate
docker-compose pull
docker-compose up -d

# 5. Verifikasi
sleep 45 && docker ps --filter name=openwa-api --format "{{.Names}} {{.Status}}"
KEY=$(cat /var/lib/containers/storage/volumes/openwa_openwa-data/_data/.api-key)
curl -s -H "X-API-Key: $KEY" http://127.0.0.1:2785/api/health   # cek "version"
curl -s -H "X-API-Key: $KEY" https://owa.nalaniaga.id/api/sessions  # via tunnel
```

## Perubahan perilaku penting di v0.19–v0.22 (relevan untuk operasi)

- **v0.19**
  - `API_MASTER_KEY` < 32 karakter ditolak saat boot produksi (key generated 71 char = aman).
  - `POST /sessions/:id/messages/send-catalog` dan `PUT /api/settings` **dihapus** (selalu 501) —
    PintaSend tidak memakainya.
  - `/api/health` hanya menampilkan `version` untuk caller dengan API key valid.
  - Image ±900 MB lebih kecil; base image `node:22-slim` digest-pinned.
- **v0.20**
  - Webhook HMAC secret min 16 karakter (secret PintaSend = SHA-256 hex 64 char = aman).
  - `WEBHOOK_SSRF_PROTECT=false` tidak lagi mengikuti redirect (butuh `WEBHOOK_SSRF_REDIRECTS=true`).
  - Install plugin dari URL wajib pin `#sha256=` saat produksi.
  - Direktori kredensial session di-`0700`; status media jadi inert download.
- **v0.21**
  - File SQLite di-`0600`.
  - **Rate limit ingress per-IP** (`INGRESS_IP_LIMIT`, default 1200/window) — route webhook
    unauthenticated kini punya bound.
- **v0.22**
  - Fix SSRF Baileys di route reply/edit (`link-preview-js` punya advisory SSRF).
  - `DOMAIN` dihapus dari `.env.example` (tidak dibaca siapa pun).

## Catatan keamanan

- **Port 2785 tertutup dari internet** — firewall `firewall-cmd` tidak lagi membuka `2785/tcp`,
  container bind `127.0.0.1`. Semua akses lewat Cloudflare Tunnel. Jika perlu membuka lagi
  (mis. debugging), buka sementara lalu tutup kembali:
  ```bash
  firewall-cmd --permanent --add-port=2785/tcp && firewall-cmd --reload   # BUKA
  firewall-cmd --permanent --remove-port=2785/tcp && firewall-cmd --reload # TUTUP
  ```
- Admin key hanya ada di `/app/data/.api-key` (jangan dibagikan; backup volume mencakupnya).
- Webhook ke PintaSend diverifikasi HMAC (`x-openwa-signature`) — secret diturunkan deterministik
  dari `OPENWA_WEBHOOK_SECRET` + sessionId (lihat `pintasend/src/lib/openwa.ts`).
