# Anomia

Alat bantu instruktur dan tim training untuk mengenali dan memetakan peserta pelatihan lewat foto wajah dan denah ruang.

Upload foto peserta, sistem mendeteksi wajah dan mengusulkan nama (dari roster yang sudah diimpor atau dari kecocokan dengan sesi sebelumnya), instruktur mengonfirmasi, lalu peserta ditempatkan di denah ruang training. Mode latihan singkat sebelum sesi membantu instruktur benar-benar hafal nama, bukan cuma menyimpan data.

Status: **discovery / pra-implementasi.** Belum ada kode aplikasi — lihat [`docs/discovery.md`](docs/discovery.md) untuk pemahaman produk, domain model, dan rencana arsitektur secara lengkap.

## Prinsip inti

- **Instruktur/tim selalu yang memutuskan.** Sistem hanya mengusulkan kecocokan wajah-ke-nama; tidak pernah melakukan assignment otomatis.
- **Tidak ada face data yang keluar ke pihak ketiga.** Deteksi dan embedding wajah berjalan di browser (Web Worker), tidak ada panggilan ke API pengenalan wajah pihak ketiga.
- **Skala kecil, arsitektur sederhana.** Satu batch training = puluhan peserta. Tidak butuh vector database, tidak butuh GPU server, tidak butuh LLM di jalur inti.

## Stack (rencana MVP)

Next.js (TypeScript) · onnxruntime-web (deteksi & embedding wajah di browser) · Postgres (Supabase/Neon) · object storage privat · deploy Vercel.

Detail lengkap dan alasan setiap pilihan ada di [`docs/discovery.md`](docs/discovery.md).

## Status pengembangan

Lihat bagian "Rencana implementasi bertahap" di dokumen discovery. Fase berjalan saat ini: **Fase 0 — spike computer vision**, menguji deteksi dan embedding wajah pada foto training asli sebelum kode aplikasi ditulis.
