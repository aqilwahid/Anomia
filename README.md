<p align="center">
  <img src="public/logo-mark.png" alt="Anomia — See, Match, Remember" width="220">
</p>

![Anomia](public/backdrop.png)

Alat bantu instruktur dan tim training untuk mengenali dan memetakan peserta pelatihan lewat foto wajah dan denah ruang.

Upload foto peserta, sistem mendeteksi wajah dan mengusulkan nama (dari roster yang sudah diimpor atau dari kecocokan dengan sesi sebelumnya), instruktur mengonfirmasi, lalu peserta ditempatkan di denah ruang training. Mode latihan singkat sebelum sesi membantu instruktur benar-benar hafal nama, bukan cuma menyimpan data.

Status: **prototipe lokal jalan, belum bisa dipakai tim.** Alur inti (upload → deteksi → cluster → labeling) sudah berfungsi di browser, tapi datanya masih tersimpan di IndexedDB satu browser saja — belum ada auth/database/deploy. Lihat [`docs/discovery.md`](docs/discovery.md) untuk pemahaman produk, domain model, dan rencana arsitektur secara lengkap.

## Menjalankan secara lokal

```bash
npm install   # juga meng-copy model deteksi wajah dari node_modules (postinstall)
npm run dev
```

Buka `http://localhost:3000`, buat kelas, import roster, lalu upload foto — deteksi wajah berjalan sepenuhnya di browser (tidak ada backend).

## Prinsip inti

- **Instruktur/tim selalu yang memutuskan.** Sistem hanya mengusulkan kecocokan wajah-ke-nama; tidak pernah melakukan assignment otomatis.
- **Tidak ada face data yang keluar ke pihak ketiga.** Deteksi dan embedding wajah berjalan di browser, tidak ada panggilan ke API pengenalan wajah pihak ketiga.
- **Skala kecil, arsitektur sederhana.** Satu batch training = puluhan peserta. Tidak butuh vector database, tidak butuh GPU server, tidak butuh LLM di jalur inti.

## Stack

Next.js (App Router, TypeScript) · Tailwind CSS · [@vladmandic/human](https://github.com/vladmandic/human) untuk deteksi & embedding wajah di browser · Dexie (IndexedDB) untuk penyimpanan lokal sementara.

Catatan: discovery doc awalnya mengusulkan onnxruntime-web + model InsightFace mentah; implementasi pertama ini pakai `@vladmandic/human` (lihat opsi 9.1 di discovery doc) karena sudah membungkus deteksi+embedding+preprocessing jadi satu API, mempercepat validasi alur produk. `FacePipeline` di [`src/face/pipeline.ts`](src/face/pipeline.ts) tetap jadi interface yang framework-agnostic, jadi model/library ini bisa diganti tanpa menyentuh UI.

## Status pengembangan

Sudah jalan & teruji di browser (Fase 1 sebagian): buat/hapus kelas, import roster, upload multi-foto, deteksi wajah + quality score, clustering wajah mirip, dan UI konfirmasi label.

Belum ada: auth & akses tim, Postgres/object storage, deploy Vercel, denah kelas, mode drill, export data. Detail lengkap dan urutan pengerjaan ada di bagian "Rencana implementasi bertahap" pada [`docs/discovery.md`](docs/discovery.md).
