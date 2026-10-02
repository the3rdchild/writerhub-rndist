# Sumber daya & probe Kubernetes

Potongan di bawah ini untuk manifest di repo deploy (`ReacteevID/reacteev-deployments`). Repo ini
hanya membangun image-nya.

Dua hal yang tidak bisa diurus dari Dockerfile:

- **Batas memori.** Tanpa `resources.limits.memory`, proses yang bocor memakan memori node sampai
  node itu bermasalah. Dengan batas, pod yang melewatinya di-OOMKill lalu dijalankan ulang. Kebocoran
  proxy web yang ditemukan uji beban 30 Sep sudah ditutup, dan batas ini adalah pengaman kalau muncul
  lagi dalam bentuk lain.
- **Probe.** Kubernetes mengabaikan `HEALTHCHECK` di Dockerfile, jadi pod yang menggantung tidak akan
  di-restart kecuali ada `livenessProbe`.

## Dasar angka

Diukur di stack mode produksi lokal (i5-12450H, 12 thread), 30 Sep 2026, sesudah perbaikan uji beban.

| Service | Diam | Di bawah beban | Keterangan |
|---|---:|---:|---|
| web (Next standalone di Bun) | ±90 MB | 165–245 MB | 18 ribu permintaan proxy per rute, stabil; sebelum perbaikan mencapai 5,3 GB |
| api (per proses Bun) | ±100 MB | ±100–310 MB | 1.200 penulis serentak |
| worker (Python + Chromium ×2 + spaCy) | ±490 MB | ±650 MB | 32 PDF serentak; Chromium hangat per slot render |

Hardware prod belum diketahui pasti, dan diasumsikan node kelas menengah (4–8 vCPU, 8–16 GB). Mulai
dari angka di bawah, lalu sesuaikan dengan metrik pod yang sebenarnya (`kubectl top pod`) setelah
seminggu berjalan.

## web

```yaml
containers:
  - name: web
    image: registry.digitalocean.com/<registry>/writer-hub-web:<tag>
    ports:
      - containerPort: 3000
    resources:
      requests:
        cpu: 250m
        memory: 256Mi
      limits:
        # ±3x pemakaian di bawah beban. Kebocoran seperti yang lama (±200 KB per autosave)
        # akan mengenai batas ini dan pod dijalankan ulang, bukan menghabiskan memori node.
        memory: 768Mi
    startupProbe:
      httpGet: { path: /, port: 3000 }
      periodSeconds: 5
      failureThreshold: 24 # beri waktu 2 menit untuk boot pertama
    livenessProbe:
      httpGet: { path: /, port: 3000 }
      periodSeconds: 20
      timeoutSeconds: 5
      failureThreshold: 3
    readinessProbe:
      httpGet: { path: /, port: 3000 }
      periodSeconds: 10
      timeoutSeconds: 5
```

## api

```yaml
containers:
  - name: api
    image: registry.digitalocean.com/<registry>/writer-hub-api:<tag>
    ports:
      - containerPort: 8080
    env:
      # Satu proses Bun mentok di ±1,25 core. Samakan dengan jumlah core yang dialokasikan.
      - name: API_PROCESSES
        value: "2"
      # Total koneksi = DB_POOL_MAX x API_PROCESSES x replika (+ worker) harus muat
      # di max_connections Postgres.
      - name: DB_POOL_MAX
        value: "10"
    resources:
      requests:
        cpu: "1"
        memory: 384Mi
      limits:
        # ±300 MB per proses di bawah beban, ditambah ruang. Naikkan seiring API_PROCESSES.
        memory: 1Gi
    livenessProbe:
      httpGet: { path: /api/v1/health, port: 8080 }
      periodSeconds: 20
      timeoutSeconds: 5
      failureThreshold: 3
    readinessProbe:
      httpGet: { path: /api/v1/health, port: 8080 }
      periodSeconds: 10
      timeoutSeconds: 5
```

### Kolaborasi real-time (websocket)

API melayani websocket kolaborasi di `GET /api/v1/collab/ws/<tabId>` (rancangannya: `docs/collab-realtime.md`).
Peramban membukanya LANGSUNG ke API, bukan lewat proxy Next - route handler Next tidak bisa meng-upgrade websocket.

**Rute.** Alamat yang dibuka peramban adalah `COLLAB_PUBLIC_WS_URL`, atau bila kosong `SERVICE_URL` (http→ws) +
`/api/v1/collab/ws`. Pilih salah satu:

- API sudah punya host publik (`SERVICE_URL`, yang juga dipakai URL aset): cukup pastikan ingress host itu meneruskan
  upgrade websocket (ingress-nginx melakukannya otomatis).
- Satu host dengan web: tambahkan aturan jalur `/api/v1/collab/ws` → service api port 8080, DI ATAS aturan `/` → web,
  lalu set `COLLAB_PUBLIC_WS_URL=wss://<host-web>/api/v1/collab/ws`.

```yaml
# Potongan Ingress (ingress-nginx) untuk jalur kolaborasi.
metadata:
  annotations:
    # Bawaan 60 dtk. Klien mengirim awareness ±15 dtk dan server mengirim ping websocket saat
    # diam, jadi 60 dtk sebenarnya cukup; dinaikkan supaya jeda jaringan sesaat tidak memutus sesi.
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
spec:
  rules:
    - host: <host>
      http:
        paths:
          - path: /api/v1/collab/ws
            pathType: Prefix
            backend:
              service: { name: api, port: { number: 8080 } }
```

Load balancer di depan ingress juga punya batas waktu diam; pastikan tidak di bawah 60 dtk.

**Tidak perlu sticky session.** Sambungan untuk tab yang sama boleh jatuh ke replika atau proses mana pun: pembaruan dan
kehadiran diteruskan antar-instance lewat Redis pub/sub, dan state tersimpan di Postgres.

**Tiket ada di query string** (`?ticket=…`) dan bisa tercatat di log akses ingress. Umurnya 60 dtk dan hanya berlaku
untuk satu tab; bila kebijakan log mengharuskan, matikan pencatatan query untuk jalur ini.

**Variabel lingkungan api:**

| Variabel | Bawaan | Catatan |
|---|---|---|
| `COLLAB_TICKET_SECRET` | (kosong) | Wajib untuk mengaktifkan kolaborasi; secret, SAMA di semua replika dan proses. Kosong = kolaborasi mati, tab disimpan lewat PUT seperti dulu. |
| `COLLAB_TICKET_TTL_S` | 60 | Umur tiket untuk membuka sambungan. |
| `COLLAB_REAUTH_S` | 3600 | Sambungan ditutup 4401 setelah selama ini supaya klien mengambil tiket baru (batas atas akses yang sudah dicabut). |
| `COLLAB_REDIS_PREFIX` | `writer-hub:collab:` | Kanal pub/sub berlaku lintas indeks DB Redis: lingkungan yang berbagi satu Redis (staging/prod) WAJIB beda awalan. |
| `COLLAB_PUBLIC_WS_URL` | (turunan `SERVICE_URL`) | Lihat "Rute". |
| `COLLAB_ROOM_IDLE_S` | 30 | Room tanpa sambungan dilepas dari memori setelah sekian detik. |
| `COLLAB_DERIVE_DEBOUNCE_MS` / `COLLAB_DERIVE_MAX_MS` | 2000 / 10000 | Seberapa cepat `document_tabs.content` (dibaca AI chat, draf, ekspor, share) mengikuti suntingan. |
| `COLLAB_MAX_MESSAGE_MB` | 32 | Batas satu pesan websocket; harus muat naskah awal terbesar. |
| `REDIS_DB` | 0 | Indeks DB Redis untuk kunci (antrean, cache, kunci penyemaian). |

**Berhenti rapi.** Saat SIGTERM, API menutup port, menyimpan antrean tulis setiap room, lalu memutus kliennya dengan
1012; klien menyambung ulang (jeda ≤ 2,5 dtk) ke pod lain. Beri jeda supaya endpoint pod sudah dicabut sebelum itu:

```yaml
# pod spec
terminationGracePeriodSeconds: 30
containers:
  - name: api
    lifecycle:
      preStop:
        exec: { command: ["sleep", "5"] }
```

**Memori.** Setiap tab yang sedang disunting menyimpan Y.Doc-nya di memori proses yang memegangnya (±2-3× ukuran naskah,
termasuk gambar base64), dan dilepas 30 dtk setelah sepi. Batas 1Gi di atas cukup untuk pemakaian biasa; pantau bila
banyak naskah besar disunting bersamaan.

**Migrasi.** Skema kolaborasi ada di `0028_collab_realtime` (`collab_documents`, `collab_updates`).

## worker

```yaml
containers:
  - name: worker
    image: registry.digitalocean.com/<registry>/writer-hub-worker:<tag>
    env:
      # Satu Chromium hangat per slot (±150-250 MB masing-masing). Naikkan batas memori
      # bila slot ditambah.
      - name: RENDER_MAX_CONCURRENCY
        value: "2"
    resources:
      requests:
        cpu: 500m
        memory: 768Mi
      limits:
        # Dokumen besar (hingga 50 halaman, banyak gambar) bisa membuat Chromium melonjak
        # jauh di atas angka uji. Terlalu ketat berarti render gagal di tengah jalan.
        memory: 1536Mi
```

Worker tidak membuka port HTTP, jadi tidak ada probe HTTP. Kalau Chromium mati, worker sudah
meluncurkannya ulang sendiri. Proses Python yang mati mengakhiri kontainernya, dan Kubernetes
menjalankannya ulang.

## Catatan

- **Batas CPU sengaja tidak dipasang.** Batas CPU memicu throttling yang terlihat sebagai lonjakan
  latensi, bukan sebagai galat. `requests` sudah cukup untuk penjadwalan. Pasang batas hanya bila
  kebijakan cluster mewajibkannya.
- **Replika vs proses.** API bisa diskalakan dengan replika, dengan `API_PROCESSES`, atau keduanya.
  Semua state bersama ada di Postgres/Redis. Cache di memori (verifikasi token, identitas) dimiliki
  tiap proses, jadi lebih banyak proses berarti lebih banyak panggilan awal ke pp-backend, tetapi
  tetap jauh di bawah satu per permintaan. Room kolaborasi juga per proses, dan proses yang memegang
  tab yang sama saling meneruskan lewat Redis - tanpa sticky session.
- **Pantau restart.** Pod web yang sering di-OOMKill adalah tanda kebocoran baru, bukan tanda
  batasnya perlu dinaikkan. Periksa dulu metrik memorinya per rute sebelum menaikkan angka.
