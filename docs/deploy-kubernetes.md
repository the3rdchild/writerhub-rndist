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
  tetap jauh di bawah satu per permintaan.
- **Pantau restart.** Pod web yang sering di-OOMKill adalah tanda kebocoran baru, bukan tanda
  batasnya perlu dinaikkan. Periksa dulu metrik memorinya per rute sebelum menaikkan angka.
