# Anomia — Product & Technical Discovery

**Status:** Draft v0.2 — discovery selesai untuk pertanyaan inti, siap masuk Fase 0
**Repo:** https://github.com/aqilwahid/Anomia
**Tanggal draf awal:** 2 September 2026
**Tanggal update:** 3 September 2026

---

## 0. Keputusan yang sudah terkunci (update 3 Sep 2026)

Diskusi lanjutan menjawab pertanyaan-pertanyaan kunci di bagian 14 versi awal dokumen ini. Keputusan berikut menggantikan asumsi awal:

| Pertanyaan | Jawaban | Dampak |
|---|---|---|
| Untuk siapa produk ini? | Instruktur **dan tim** di lingkungan pelatihan (training center), bukan individu tunggal | Multi-user & sharing data antar instruktur **masuk MVP**, bukan fase belakangan |
| Konteks peserta | **Pelatihan untuk peserta dewasa** (bukan sekolah/anak di bawah umur) | Persetujuan cukup dari peserta sendiri (attestation langsung), tidak perlu mekanisme wali. Risiko hukum jauh lebih ringan dari skenario awal |
| Mode deployment | **Cloud sejak awal**, target hosting **Vercel** | Stack A (local-only) gugur. Auth, Postgres, dan object storage privat aktif dari hari pertama, tidak bisa ditunda |
| Stack | **Stack B dikonfirmasi**: Next.js + TypeScript, CV di browser, Postgres, object storage privat | Lihat bagian 9–10, sekarang berlaku sebagai keputusan, bukan opsi |

**Konsekuensi pada domain model (bagian 4):** relasi `User` ↔ `ClassGroup` perlu didefinisikan sebagai akses tim (mis. satu organisasi, anggota tim punya akses ke kelas yang sama), bukan 1:1 milik satu guru. Ini perlu diselesaikan sebelum implementasi skema database — lihat bagian 4a (baru).

**Konsekuensi pada privasi (bagian 7):** karena peserta dewasa, item consent disederhanakan menjadi checkbox attestation dari peserta sendiri. UU PDP tetap berlaku untuk data biometrik siapa pun (bukan hanya anak-anak), jadi prinsip minimalisasi data, retensi otomatis, dan hard delete tetap wajib. Data residency Indonesia tidak lagi menjadi syarat hukum yang keras (tidak ada anak di bawah umur), tapi tetap praktik baik untuk transparansi ke peserta.

**Yang belum dijawab, masih terbuka:**
- Struktur tim: apakah semua anggota organisasi lihat semua kelas, atau ada kepemilikan/pembatasan akses per kelas?
- Berapa instruktur/anggota tim yang akan pakai produk ini bersamaan?
- Retensi data: berapa lama data kelas disimpan setelah sesi training selesai?
- Lisensi kode (repo ini privat tapi belum ada file `LICENSE`) — perlu diputuskan terpisah dari diskusi produk.

---

## 1. Kondisi repository saat ini (kondisi awal, sebelum housekeeping)

Hasil inspeksi awal:

| Item | Kondisi |
|---|---|
| Commit | 1 commit |
| File | Hanya `README.md` |
| Isi README | Persis `# Anomia` + `...` |
| Default branch | `Main` (huruf besar M) |
| LICENSE | Tidak ada |
| .gitignore | Tidak ada |
| Issues / Projects / CI | Kosong |
| Bahasa/stack | Belum ada apa pun |

**Kesimpulan:** greenfield penuh. Tidak ada utang teknis, tidak ada kode untuk dipakai ulang, tidak ada legacy constraint. Semua opsi arsitektur masih terbuka kecuali yang sudah dikunci di bagian 0.

---

## 2. Pemahaman tentang Anomia

### Apa produk ini sebenarnya

Anomia adalah **alat bantu instruktur dan tim training untuk mengenali dan memetakan peserta pelatihan**. Face recognition di dalamnya bukan fitur utama — ia hanya *mesin pengurang kerja input data*. Produk sebenarnya adalah loop: upload foto → sistem usulkan label nama → instruktur konfirmasi → tempelkan ke denah ruang training.

Kalau salah paham di titik ini, arsitekturnya akan salah arah: kita akan membangun face search engine padahal yang dibutuhkan adalah alat labeling cepat dengan pipeline ingest yang pintar.

### Tiga observasi yang mengubah keputusan teknis

**Observasi 1 — Ini closed-set problem yang sangat kecil.**
Satu sesi training = belasan sampai puluhan peserta. Satu instruktur/tim menangani beberapa batch training. Total identitas maksimal beberapa ratus, dan matching selalu terbatas dalam scope satu kelas/batch.

Implikasi: **tidak butuh vector database.** Tidak butuh Pinecone, tidak butuh pgvector (untuk MVP), tidak butuh ANN index. Cosine similarity brute force terhadap puluhan vektor 512-dimensi adalah operasi mikrodetik.

**Observasi 2 — Bottleneck-nya adalah kesabaran instruktur, bukan akurasi model.**
Risiko kegagalan terbesar produk ini bukan "model salah mengenali wajah". Risikonya adalah instruktur upload foto batch, melihat puluhan kotak wajah kosong yang harus dinamai satu per satu, lalu menutup tab dan tidak pernah kembali.

Implikasi: **desain UI labeling adalah fitur inti, bukan detail implementasi.** Clustering, keyboard shortcut, dan roster import lebih menentukan keberhasilan daripada pilihan model ArcFace vs FaceNet.

**Observasi 3 — Instruktur biasanya sudah punya daftar nama sebelum punya foto.**
Training center hampir selalu punya daftar peserta (form pendaftaran, spreadsheet, LMS internal). Alur "deteksi wajah → ketik nama" itu alur yang salah. Alur yang benar: "import daftar nama → deteksi wajah → tempelkan wajah ke nama yang sudah ada".

Ini mengubah interaksi dari *mengetik* (lambat, typo, duplikat) menjadi *memilih/mencocokkan* (cepat, konsisten). Perbedaan kecepatannya bisa 5–10x.

### Apa yang membuat Anomia beda dari flashcard biasa

Konteks spasial. Manusia mengingat wajah jauh lebih baik ketika ada *anchor* tambahan: "yang duduk di pojok kanan belakang, pakai kacamata". Denah ruang bukan gimmick — ia adalah cue memori kedua yang secara ilmiah memperkuat recall. Ini justifikasi kuat untuk fitur seating map, dan alasan kenapa ia layak masuk MVP.

---

## 3. User journey

### Journey utama (first-time setup, sekali per batch/kelas training)

1. **Instruktur/tim buat kelas** — nama batch training, tanggal, jumlah perkiraan peserta.
2. **(Opsional, sangat disarankan) Import roster** — paste/upload daftar nama peserta. Sistem membuat Participant tanpa wajah.
3. **Upload foto** — bisa satu foto grup, bisa banyak foto portrait, bisa campuran.
4. **Sistem memproses** — deteksi wajah, crop, hitung embedding, kelompokkan wajah yang mirip.
5. **Review & labeling** — instruktur melihat *cluster* wajah (bukan wajah individual), lalu:
   - assign cluster ke nama dari roster, atau
   - buat participant baru, atau
   - tandai "bukan wajah / bukan peserta" (panitia, orang lewat).
6. **Sistem menawarkan merge** — "2 cluster ini kelihatannya orang yang sama, gabungkan?" Instruktur konfirmasi atau tolak. **Selalu manusia yang memutuskan.**
7. **Buat denah ruang** — pilih preset (grid, U-shape, classroom style) atau atur manual.
8. **Tempatkan peserta di kursi** — drag & drop dari sidebar ke kursi. Bisa juga: klik kursi → cari nama.

### Journey harian (yang bikin produk ini dipakai berulang)

9. **Latihan sebelum sesi** — mode drill singkat: tampilkan wajah, instruktur sebut/pilih nama, sistem catat benar/salah.
10. **Saat mengajar** — buka denah ruang di laptop/tablet, lihat nama di posisi kursi. Mode "peek": nama tersembunyi, tap untuk lihat.
11. **Sistem melacak** siapa yang sudah hafal dan siapa yang belum, lalu memprioritaskan yang lemah di sesi berikutnya.

### Journey pemeliharaan

12. Tambah peserta baru di tengah batch.
13. Ubah denah tempat duduk.
14. Hapus kelas/batch di akhir training — semua foto & embedding terhapus permanen.

**Poin kritis:** langkah 1–8 adalah *biaya*, langkah 9–11 adalah *nilai*. Kalau MVP hanya mengimplementasikan 1–8, instruktur mengerjakan data entry tanpa imbalan apa pun. **Minimal satu mode recall harus masuk MVP.**

---

## 4. Definisi MVP

### Prinsip

MVP = jalur terpendek dari "foto mentah" ke "instruktur merasa lebih hafal nama peserta". Satu tim, beberapa kelas/batch, akses bersama — ini sudah bagian dari MVP sesuai keputusan bagian 0 (bukan ditunda ke fase lanjutan).

### Masuk MVP

| # | Fitur | Alasan |
|---|---|---|
| 1 | Auth + akses tim (multi-user dari hari pertama) | Kebutuhan sharing sudah dikonfirmasi, bukan opsional |
| 2 | Buat/kelola kelas (batch training) | Container dasar |
| 3 | Import roster (paste daftar nama) | Pengurang friksi terbesar |
| 4 | Upload multi-foto (JPEG/PNG/HEIC) | Input utama |
| 5 | Deteksi wajah + crop otomatis | Inti pipeline |
| 6 | Quality score per wajah (buram/kecil/miring) | Cegah embedding sampah |
| 7 | Clustering wajah yang mirip | Pengurang friksi terbesar #2 |
| 8 | UI labeling cepat (keyboard-first) | Penentu apakah produk dipakai |
| 9 | Merge / split participant manual | Recovery dari kesalahan sistem |
| 10 | Denah kelas grid + drag-drop kursi | Cue memori spasial |
| 11 | Satu mode drill: "Siapa ini?" | Payoff untuk instruktur |
| 12 | Hapus kelas → purge total | Kewajiban privasi |
| 13 | Export data (JSON + gambar) | Anti lock-in, backup |

### Tidak masuk MVP

Integrasi LMS eksternal; aplikasi mobile native; spaced repetition scheduler yang canggih (cukup catat benar/salah dulu); denah freeform arbitrer; fitur LLM apa pun; analytics dashboard; deteksi wajah dari video/live camera; multi-bahasa.

### Definisi sukses MVP

Satu tim asli, satu batch training asli 20–30 orang, dari nol sampai denah lengkap **dalam < 20 menit**, dan setelah 3 sesi drill instruktur bisa menyebut ≥ 80% nama dengan benar. Kalau setup > 45 menit, MVP gagal terlepas dari seberapa bagus kodenya.

---

## 4a. Model akses tim (baru — perlu diselesaikan sebelum implementasi skema)

Pertanyaan yang masih terbuka dari bagian 0: apakah semua anggota tim melihat semua kelas, atau ada pembatasan kepemilikan per kelas?

Dua opsi yang layak untuk MVP:

| Opsi | Deskripsi | Kompleksitas |
|---|---|---|
| **A. Organisasi datar** | Satu `Organization`, semua anggota tim = akses penuh ke semua `ClassGroup` milik organisasi itu. Tidak ada role granular. | Rendah — cukup tabel `organization_members` |
| **B. Kepemilikan per kelas** | `ClassGroup` punya `owner_id` + daftar kolaborator eksplisit. Instruktur lain butuh diundang per kelas. | Sedang — perlu tabel `class_group_members` + UI undangan |

**Rekomendasi:** mulai dari Opsi A untuk MVP kalau ukuran tim kecil (di bawah ~10 orang) dan tidak ada kebutuhan kerahasiaan antar-batch. Opsi A bisa ditingkatkan ke Opsi B nanti tanpa migrasi data yang menyakitkan — cukup tambah tabel relasi baru, `owner_id` default ke pembuat kelas.

---

## 5. Usulan domain model

### Evaluasi nama-nama yang diusulkan

| Usulan | Verdict | Catatan |
|---|---|---|
| `User` | Pakai | Anggota tim/organisasi, wajib ada sejak awal (bukan ditunda) |
| `ClassGroup` | Pakai | Ganti dari `Class` — reserved word di JS/TS/Python/Java. Tabel `class_groups`, label UI tetap "Kelas"/"Batch" |
| `Participant` | Pakai | Dipisahkan dari `Person` — lihat di bawah |
| `Photo` | Pakai | Pisahkan metadata dari blob file (`ImageAsset`) |
| `DetectedFace` | Pakai | Entitas paling penting di pipeline |
| `FaceEmbedding` | Pakai | Wajib punya kolom versi model. Satu wajah bisa punya beberapa embedding dari model berbeda |
| `RoomLayout` | Pakai | Dulu diusulkan sebagai `Classroom`, diganti agar tidak tertukar dengan `ClassGroup` |
| `Seat` | Pakai | Bagian dari layout, bukan dari kelas |
| `SeatingPlan` / `SeatAssignment` | Pakai, dengan versioning | Denah bisa berubah tanpa menghancurkan riwayat |
| `RecallState` | Pakai | Lebih penting daripada log sesi individual |

### Person vs Participant — kenapa dipisah

- **Person** = identitas manusia. Budi si peserta.
- **Participant** = keanggotaan Person di sebuah ClassGroup (batch training). Budi di batch "Fundamental Cloud — Sept 2026".

Kenapa penting: peserta yang sama bisa muncul di beberapa batch training berbeda. Kalau digabung, instruktur harus melabeli ulang wajah orang yang sama dari nol setiap batch.

Biaya memisahkan sekarang: satu tabel + satu foreign key. Biaya memisahkan nanti: migrasi data biometrik yang sudah terlanjur nempel di tempat salah. **Pisahkan sekarang.** Untuk MVP, Person boleh dibuat otomatis 1:1 dan tidak pernah ditampilkan di UI.

### Konsep yang hilang dari daftar awal

- **`ImageAsset`** — file biner + hash + ukuran, terpisah dari `Photo` (konteks/metadata). Satu asset bisa dirujuk beberapa kali; crop wajah juga adalah asset.
- **`FaceCrop`** — thumbnail hasil crop+align. Perlu entitas sendiri karena kalau nanti foto asli dihapus demi privasi, crop tetap dipertahankan.
- **`MatchSuggestion`** — usulan sistem yang menunggu konfirmasi instruktur. Membuat "human-in-the-loop" jadi eksplisit dan bisa diaudit, bukan logika tersembunyi di UI.
- **`ParticipantPrototype`** — vektor representatif (centroid) dari semua embedding milik seorang participant. Untuk MVP awal, ini boleh berupa nilai terhitung (computed), bukan tabel tersimpan — persist baru kalau performa jadi masalah nyata.
- **`IngestJob`** — status pemrosesan batch upload (queued/processing/done/failed) supaya UI bisa menampilkan progres dan bisa resume. Bisa disederhanakan jadi field status di `Photo` untuk MVP awal.
- **`RecallState`** — status hafalan per participant (streak, terakhir dilatih, jadwal berikutnya). Ini yang sebenarnya menggerakkan fitur memori.

### Model final yang diusulkan

```
Organization (1)---< User (member)
     |
     +--< ClassGroup (1)---< Participant >--- (1) Person
              |                   |
              |                   +--< FaceLink >-- DetectedFace
              |                   +--- ParticipantPrototype (1:1, computed di MVP)
              |                   +--- RecallState (1:1)
              |
              +--< Photo --- ImageAsset
              |      +--< DetectedFace ---+--- FaceCrop
              |                           +--- FaceEmbedding (per model version)
              |                           +--< MatchSuggestion
              |
              +--< RoomLayout ---< Seat
                        +--< SeatingPlan ---< SeatAssignment >--- Participant
```

Field penting per entitas:

- **DetectedFace**: `photo_id`, `bbox`, `landmarks[5]`, `detector_score`, `quality_score`, `blur_score`, `pose_yaw/pitch`, `detector_name`, `detector_version`, `status` (`unlabeled` | `assigned` | `rejected` | `not_a_face`)
- **FaceEmbedding**: `detected_face_id`, `model_name`, `model_version`, `dim`, `vector`, `normalized`.
- **SeatingPlan**: `room_layout_id`, `effective_from`, `label`. Denah bisa berubah tanpa menghancurkan riwayat.
- **RecallState**: `participant_id`, `correct_count`, `wrong_count`, `last_reviewed_at`, `due_at`.

### Aturan integritas yang harus dipegang

1. Sebuah `DetectedFace` maksimal terikat ke **satu** Participant.
2. Semua ikatan wajah–participant **wajib** hasil konfirmasi manusia. Sistem hanya boleh mengisi `MatchSuggestion`.
3. Menghapus Participant harus menghapus embedding + prototype-nya, lalu mengembalikan wajah-wajahnya ke status `unlabeled` (bukan menghapus wajahnya).
4. Menghapus ClassGroup = purge kaskade penuh termasuk file di object storage.

---

## 6. Usulan arsitektur

### Batas browser / server

Pertanyaan paling menentukan di project ini: **di mana wajah diproses?**

| Tahap | Browser | Server | Rekomendasi |
|---|---|---|---|
| Upload & preview | ✓ | ✓ | Browser |
| Strip EXIF, resize | ✓ | ✓ | **Browser** — data lokasi GPS tidak pernah keluar device |
| Deteksi wajah | ✓ (WASM/WebGPU) | ✓ (lebih cepat) | **Browser** untuk MVP |
| Align + crop | ✓ | ✓ | Browser |
| Embedding | ✓ (model ~13–170MB) | ✓ (akurasi lebih baik) | **Browser** untuk MVP |
| Clustering & matching | ✓ (≤ 40 vektor, trivial) | ✓ | **Browser** |
| Persistence | — | Postgres + object storage | Server (cloud sejak awal, lihat bagian 0) |
| Drill / recall | ✓ | ✓ | Browser |
| Auth | — | ✓ | Server, **sejak hari pertama** |

### Keputusan arsitektural inti

> **Pipeline computer vision dibangun sebagai modul mandiri yang berjalan di Web Worker, dan lapisan persistence disembunyikan di balik satu interface (`AnomiaStore`) yang diimplementasikan sebagai HTTP client ke server.**

Karena cloud sudah dikunci sejak bagian 0, adapter lokal (IndexedDB) tidak lagi menjadi jalur utama — tapi interface tetap dipertahankan agar mode offline/local-cache bisa ditambahkan nanti (mis. untuk dipakai tanpa koneksi saat sesi training berlangsung) tanpa menulis ulang aplikasi.

```
interface FacePipeline {
  detect(image): DetectedFace[]
  embed(face): Float32Array
  compare(a, b): number
}

interface AnomiaStore {
  // implementasi utama: HttpStore
  // implementasi opsional nanti: IndexedDBStore (cache offline)
}
```

### Diagram alur

```
+-------------------------- BROWSER --------------------------+
|                                                               |
|  UI (upload, label, seat map, drill)                         |
|         |                                                     |
|         v                                                     |
|  +---------------------------------------------------------+ |
|  |  Web Worker - Face Pipeline                              | |
|  |  decode -> EXIF strip -> resize                          | |
|  |  -> detect (SCRFD) -> quality filter                     | |
|  |  -> align 112x112 -> embed (ArcFace)                     | |
|  |  -> L2 normalize -> cluster                              | |
|  +---------------------------------------------------------+ |
|         |                          |                          |
|         v                          v                          |
|  MatchSuggestion            crops + vectors                   |
|         |                          |                          |
|         v                          |                          |
|  +----------------+                |                          |
|  | Instruktur     |                |                          |
|  | konfirmasi     |                |                          |
|  +----------------+                |                          |
|         |                          |                          |
|         v                          v                          |
|  +---------------------------------------------------------+ |
|  |  AnomiaStore (HttpStore)                                 | |
|  +---------------------------------------------------------+ |
+---------------------------|-----------------------------------+
                             v
              +----------------------------------+
              |  API (CRUD, auth, signed URL)     |
              |  Postgres  |  Object Storage      |
              |  metadata  |  crops + originals    |
              |  vectors   |  (private bucket)     |
              +----------------------------------+
```

**Yang sengaja tidak ada di diagram:** LLM. Tidak ada di jalur inti mana pun.

### Titik integrasi AI di masa depan (jangan dibangun sekarang, cukup disiapkan)

1. Parsing roster berantakan (copy-paste dari PDF/spreadsheet) — LLM, **teks saja, tanpa wajah**.
2. Membangkitkan mnemonic verbal dari catatan yang instruktur tulis sendiri.
3. Generate soal drill yang bervariasi.
4. Voice mode: instruktur menyebut nama, sistem cek dengan speech-to-text.

Semuanya berjalan pada data **teks**, tidak pernah pada gambar wajah. Ini menjaga janji privasi tetap utuh sekaligus membuka ruang fitur AI.

---

## 7. Strategi pemrosesan wajah

### Pipeline detail

```
1. Decode & orientasi   -> hormati EXIF orientation, lalu buang seluruh EXIF
2. Downscale            -> sisi terpanjang maks 1600-2000px (foto grup: pertahankan lebih besar)
3. Deteksi              -> bbox + 5 landmark + confidence
4. Quality gate         -> tolak/tandai jika:
                            - lebar wajah < 60px
                            - variance Laplacian rendah (buram)
                            - |yaw| > 40 derajat
                            - terlalu gelap/overexposed
5. Align                -> similarity transform ke 112x112 pakai 5 landmark
6. Embed                -> vektor 512-d, L2 normalized
7. Cluster              -> agglomerative/connected-component, threshold konservatif
8. Suggest              -> cocokkan cluster ke prototype participant yang sudah ada
9. Konfirmasi manusia   -> WAJIB
10. Update prototype    -> hitung ulang centroid, buang outlier
```

### Masalah paling serius: foto grup

Foto kelas 30 orang dari 4000px, wajah di baris belakang mungkin hanya 60-90px. Model embedding butuh 112x112 dengan detail yang cukup. Hasilnya: **embedding dari foto grup jauh lebih lemah daripada dari portrait.**

Strategi yang disarankan — pisahkan dua peran foto:

| Jenis foto | Perannya |
|---|---|
| Portrait / close-up | **Enrollment.** Sumber utama embedding & prototype |
| Foto grup / kelas | **Konteks & posisi.** Bagus untuk memicu ingatan spasial dan untuk labeling, tapi bobot embedding-nya dikecilkan |

Implementasi: simpan `quality_score`, gunakan sebagai bobot saat menghitung prototype, dan naikkan threshold matching untuk wajah berkualitas rendah. Jangan pernah menolak wajah berkualitas rendah secara diam-diam — tandai saja, biarkan instruktur memutuskan.

Untuk foto sangat besar dengan banyak wajah kecil, siapkan opsi **tiled inference** (bagi gambar jadi ubin bertumpuk, deteksi per ubin, gabungkan dengan NMS). Uji di spike, jangan diasumsikan.

### Matching

Cosine similarity terhadap prototype semua participant dalam satu ClassGroup. Brute force. Puluhan vektor x 512 dim = tidak terukur waktunya.

Threshold: **jangan pakai angka dari internet.** Kalibrasi sendiri dengan foto training asli. Sebagai titik awal untuk ArcFace ternormalisasi, similarity di kisaran 0,4-0,5 biasanya jadi wilayah keputusan, tapi ini harus divalidasi pada data nyata — terutama karena mayoritas model publik dilatih pada dataset yang timpang secara demografis.

Tiga zona keputusan, bukan dua:

- similarity tinggi → auto-suggest, instruktur cukup tekan Enter
- zona abu-abu → tampilkan sebagai "mungkin", butuh klik eksplisit
- rendah → jangan tampilkan sama sekali

**Prinsip yang tidak boleh dilanggar:** sistem tidak pernah melakukan assignment otomatis. Satu false merge yang tidak disadari instruktur akan merusak kepercayaan pada seluruh aplikasi, dan sulit dideteksi setelah terjadi.

### Versioning model

Setiap embedding menyimpan `model_name` + `model_version`. Saat ganti model, embedding lama tidak dihapus — jalankan re-embedding batch dari `FaceCrop` yang tersimpan. **Ini alasan kenapa crop harus disimpan sebagai artefak permanen, bukan cache sementara.**

---

## 8. Pertimbangan privasi

### Kenyataan hukum yang harus dihadapi

Data yang diolah Anomia adalah **data biometrik**. Karena konteksnya kini dikonfirmasi **pelatihan untuk peserta dewasa**, mekanisme persetujuan bisa langsung dari peserta sendiri, tanpa proses wali. Tapi UU No. 27/2022 tentang Pelindungan Data Pribadi tetap mengategorikan data biometrik sebagai data pribadi spesifik untuk **siapa pun**, yang butuh dasar pemrosesan lebih ketat dan persetujuan eksplisit.

Bukan nasihat hukum — tapi ini bukan detail yang bisa ditunda ke "nanti kalau sudah besar". Ini menentukan arsitektur.

**Poin yang sering dilewatkan:** face embedding **bukan data anonim**. Ia adalah data biometrik dalam bentuk lain, dan bisa dipakai untuk mencocokkan orang. Menghapus foto tapi menyimpan embedding **bukan** penghapusan data.

### Prinsip desain privasi

1. **Nol third-party face API.** Jangan kirim wajah peserta ke AWS Rekognition / Azure Face / vendor mana pun. Ini garis merah, bukan preferensi.
2. **Minimalisasi data.** Sediakan opsi "hapus foto asli setelah diproses, simpan crop saja". Foto grup asli berisi jauh lebih banyak informasi daripada yang dibutuhkan aplikasi.
3. **Strip EXIF sebelum apa pun.** Koordinat GPS di foto adalah kebocoran yang tidak perlu.
4. **Penghapusan yang benar-benar menghapus** — kaskade ke embedding, prototype, crop, dan file di object storage. Hard delete, bukan `deleted_at`. Prototype yang tersisa harus dihitung ulang.
5. **Retensi otomatis.** Default: kelas kedaluwarsa setelah satu periode training, dengan pengingat. Data yang tidak ada tidak bisa bocor.
6. **Export penuh.** Tim memiliki datanya. JSON + gambar, satu tombol.
7. **Tidak ada face data yang pernah menyentuh LLM.**
8. **Transparansi di dalam produk.** Satu halaman singkat: apa yang disimpan, di mana, berapa lama, cara menghapus. Ini juga jadi bahan attestation consent peserta.
9. **Bucket privat + signed URL berumur pendek** — wajib karena mode cloud sudah dikunci sejak awal.

### Yang masih perlu diputuskan di level kebijakan

- Bentuk consent: checkbox attestation sederhana saat pendaftaran training, atau perlu dokumen terpisah?
- Berapa lama retensi default data per batch training?

---

## 9. Opsi teknologi

### 9.1 Deteksi & embedding wajah — komponen paling menentukan

| Opsi | Cocok untuk | Kelebihan | Kekurangan | Kompleksitas | Biaya | Privasi | Sulit diganti? |
|---|---|---|---|---|---|---|---|
| **ONNX Runtime Web + InsightFace (SCRFD + ArcFace/MobileFaceNet)** | Browser, kualitas tinggi | Akurasi SOTA, model kecil tersedia (~13MB mbf) atau besar (~170MB r50), WASM SIMD + WebGPU, sepenuhnya di device | Perlu implementasi pre/post-processing sendiri (NMS, alignment), download model pertama kali, cek lisensi model | Sedang-Tinggi | Rp0 runtime | Sangat baik | Mudah — hanya ganti file model |
| **`@vladmandic/human`** | Prototipe cepat | Semua-dalam-satu (deteksi, landmark, deskriptor), API bersih, aktif dipelihara | Embedding lebih lemah dari ArcFace, bundle besar, kurang bisa dikontrol | Rendah | Rp0 | Sangat baik | Mudah |
| **`face-api.js`** (dan fork-nya) | Legacy/demo | Sangat banyak tutorial | Basis lama (dlib ResNet-34, 128-d), turun drastis pada wajah miring/kecil, upstream tidak aktif | Rendah | Rp0 | Sangat baik | Mudah |
| **MediaPipe Face Detector/Mesh** | Deteksi & landmark | Sangat cepat, ringan, matang | **Tidak menyediakan embedding identitas** — hanya separuh solusi | Rendah | Rp0 | Sangat baik | Mudah (untuk deteksi saja) |
| **InsightFace di server (Python)** | Kualitas maksimal | Akurasi terbaik, mudah tiled inference, tidak bergantung device instruktur | Butuh runtime Python terpisah, wajah keluar dari device, biaya server, GPU mahal | Tinggi | Sedang-Tinggi | Buruk-Sedang | Sedang |
| **AWS Rekognition / Azure Face** | — | Tidak perlu ML sendiri | Wajah peserta dikirim ke pihak ketiga, biaya per gambar, risiko regulasi | Rendah | Per-panggilan | **Tidak dapat diterima** | Mudah |

**Rekomendasi:** ONNX Runtime Web + model InsightFace di Web Worker. Fallback ke `@vladmandic/human` kalau spike menunjukkan integrasinya terlalu mahal waktu.

### 9.2 Frontend

**Next.js (App Router) + React + TypeScript** — dikonfirmasi, karena deploy ke Vercel sudah dikunci dan Next.js adalah target native platform tersebut. Satu deploy untuk UI+API, ekosistem terbesar, dukungan worker/WASM baik.

### 9.3 Database

**Postgres (Supabase atau Neon)** — dikonfirmasi karena mode cloud sejak awal. Model relasional cocok untuk domain ini; `float4[]` cukup untuk vektor di skala puluhan-per-kelas (pgvector hanya kalau terbukti perlu nanti).

### 9.4 Penyimpanan gambar

| Opsi | Catatan |
|---|---|
| **Cloudflare R2** | Tanpa biaya egress, S3-compatible, murah. Kandidat kuat |
| **Supabase Storage** | Terintegrasi dengan auth & RLS kalau Supabase juga dipakai untuk DB — paling sedikit kode |
| S3 | Matang, tapi egress berbayar dan setup IAM lebih ribet |

### 9.5 Autentikasi

**Wajib sejak hari pertama** (bukan ditunda) karena akses tim sudah dikonfirmasi. Kandidat:

| Opsi | Catatan |
|---|---|
| **Supabase Auth** | Magic link, RLS otomatis, gratis di tier awal, terintegrasi rapi kalau DB juga Supabase |
| **Auth.js (NextAuth)** | Fleksibel, self-hosted, sedikit lebih banyak kerja, cocok kalau DB dipisah dari Supabase |
| Clerk/Auth0 | Bagus tapi berbayar dan berlebihan untuk skala tim kecil |

### 9.6 Denah kelas / canvas

**DOM + CSS Grid + dnd-kit** — direkomendasikan untuk MVP. Aksesibel, bisa keyboard, mudah di-debug, ringan, cukup untuk grid. 95% ruang training nyata adalah baris-kolom. Membangun canvas engine di MVP adalah pengalihan energi dari masalah yang sebenarnya (labeling & recall). Konva/react-konva jadi opsi fase 2 kalau memang dibutuhkan layout benar-benar bebas.

### 9.7 Deployment

**Vercel** — dikonfirmasi. Perlu pasangkan dengan Postgres (Supabase/Neon) dan object storage (R2/Supabase Storage) yang mendukung akses dari Vercel Functions.

---

## 10. Rekomendasi stack MVP (dikonfirmasi)

| Komponen | Pilihan |
|---|---|
| Bahasa | TypeScript di seluruh sistem |
| Frontend | Next.js (App Router) + React |
| Styling | Tailwind CSS |
| Deteksi wajah | SCRFD (InsightFace) via onnxruntime-web, di Web Worker |
| Embedding | ArcFace / MobileFaceNet (varian ringan dulu), 512-d, L2 normalized |
| Matching | Cosine brute force in-memory, scope per ClassGroup |
| Database | Postgres (Supabase/Neon), vektor sebagai `float4[]` (pgvector hanya kalau terbukti perlu) |
| Object storage | Bucket privat + signed URL (R2 atau Supabase Storage) |
| Auth | Supabase Auth atau Auth.js — sejak hari pertama |
| Denah kelas | DOM + CSS Grid + dnd-kit |
| Deploy | Vercel |
| LLM | Tidak ada di jalur inti |

### Alasan

1. **Satu bahasa.** Model domain, validasi, dan logika matching dipakai bersama antara client dan server. Untuk tim kecil, ini penghematan besar.
2. **CV di browser mematikan tiga masalah sekaligus:** biaya server, latency upload foto besar, dan sebagian besar risiko privasi — meski data akhirnya tetap tersimpan di server untuk keperluan sharing tim.
3. **Tidak ada infrastruktur yang tidak dibutuhkan.** Tanpa vector DB, tanpa queue, tanpa GPU, tanpa microservice. Skala masalahnya memang sekecil itu.
4. **Setiap keputusan besar tetap bisa dibalik.** Model wajah = ganti file ONNX. Grid vs freeform = ganti komponen render, model data `Seat` sudah menyimpan koordinat. Model akses tim (4a) = tambah tabel relasi, bukan migrasi besar.
5. **Jalur eskalasi ke pemrosesan server-side tetap terbuka** kalau spike menunjukkan browser tidak sanggup: bungkus pipeline yang sama sebagai endpoint server, interface `FacePipeline` tidak berubah.

### Yang sengaja tidak direkomendasikan

Vector database, LLM di jalur inti, canvas library berat, native mobile app, microservices, Kubernetes, dan API pengenalan wajah pihak ketiga.

---

## 11. Usulan struktur repository

```
anomia/
├── README.md
├── LICENSE
├── .gitignore
├── docs/
│   ├── discovery.md              <- dokumen ini
│   ├── domain-model.md
│   ├── privacy.md
│   └── adr/
│       ├── 0001-record-architecture-decisions.md
│       ├── 0002-face-processing-in-browser.md
│       ├── 0003-storage-adapter-boundary.md
│       ├── 0004-classroom-as-grid-first.md
│       └── 0005-team-access-model.md
├── src/
│   ├── app/                      <- route Next.js
│   ├── domain/                   <- tipe & aturan murni, tanpa I/O
│   │   ├── participant.ts
│   │   ├── face.ts
│   │   ├── layout.ts
│   │   └── recall.ts
│   ├── face/                     <- pipeline CV, framework-agnostic
│   │   ├── pipeline.ts           <- interface FacePipeline
│   │   ├── detector.ts
│   │   ├── embedder.ts
│   │   ├── align.ts
│   │   ├── quality.ts
│   │   ├── cluster.ts
│   │   └── worker.ts
│   ├── store/
│   │   ├── store.ts               <- interface AnomiaStore
│   │   └── http/
│   ├── features/
│   │   ├── ingest/
│   │   ├── labeling/
│   │   ├── seating/
│   │   └── recall/
│   └── ui/
├── public/models/                 <- file ONNX (Git LFS atau unduh saat runtime)
├── scripts/
│   └── evaluate-pipeline.ts       <- ukur akurasi pada dataset uji sendiri
└── tests/
    └── fixtures/                  <- WAJIB: foto sintetis/berizin saja, JANGAN foto peserta asli
```

Aturan yang ditegakkan sejak commit pertama:

- `src/domain` tidak boleh mengimpor apa pun dari `src/store`, `src/face`, atau React.
- `src/face` tidak boleh tahu apa itu Participant.
- Setiap keputusan arsitektural masuk ADR — itulah mekanisme yang membuat keputusan bisa dibalik dengan sadar, bukan dilupakan.
- **Jangan pernah commit foto peserta asli ke repo**, termasuk di fixture test.

---

## 12. Rencana implementasi bertahap

### Fase 0 — Spike computer vision (2-4 hari) — mulai dari sini

Kode buangan. Satu halaman HTML, tanpa framework, tanpa database.

Ukur pada foto training asli yang representatif:
- Berapa persen wajah terdeteksi dari foto grup 20-30 orang?
- Berapa lama waktu proses di laptop kelas menengah?
- Apakah embedding dari wajah 80px masih bisa dibedakan?
- Berapa besar model dan berapa lama first load?
- Berapa threshold yang benar untuk data Anda?
- Apakah tiled inference perlu?

**Ini gerbang penentu.** Kalau recall deteksi < 85% atau proses > 30 detik, pemrosesan di browser gugur dan kita evaluasi ulang ke arah server-side. Jangan menulis satu baris pun kode aplikasi sebelum angka-angka ini ada.

*Butuh: foto training asli (izin pakai sudah ada) untuk diuji.*

### Fase 1 — Ingest & labeling (1-2 minggu)
Model domain, auth dasar + model akses tim, HTTP store ke Postgres, upload, deteksi, crop, clustering, UI labeling keyboard-first, import roster, merge/split, export JSON.
*Selesai ketika:* satu foto kelas 30 orang bisa dilabeli lengkap dalam < 10 menit.

### Fase 2 — Denah & tempat duduk (1 minggu)
RoomLayout, preset grid, editor kursi, drag-drop peserta, mode tampilan kelas.
*Selesai ketika:* instruktur bisa membuka denah dan mengenali semua orang.

### Fase 3 — Recall (1 minggu)
Mode "Siapa ini?", mode klik-kursi, RecallState, statistik sederhana "sudah hafal / belum".
*Selesai ketika:* ada payoff yang membuat instruktur kembali membuka aplikasi besok.

### Fase 4 — Uji dengan tim asli (1 minggu)
Satu atau dua instruktur, batch training nyata. Ukur waktu setup dan tingkat hafalan. **Jangan bangun apa pun yang baru di fase ini.**

### Fase 5 — Peningkatan akses tim (jika Fase 4 positif)
Kepemilikan per kelas (Opsi B di bagian 4a) kalau Opsi A terbukti tidak cukup, retensi otomatis, export terjadwal.

### Fase 6 — Peningkatan (opsional)
Spaced repetition sungguhan, canvas freeform, mnemonic berbasis LLM (teks saja), voice drill, mode offline.

---

## 13. Risiko teknis utama

| # | Risiko | Dampak | Mitigasi |
|---|---|---|---|
| 1 | **Kelelahan labeling** — instruktur menyerah di tengah | Fatal | Clustering, roster import, keyboard-first, progress bar, bisa dilanjutkan bertahap. Ukur di Fase 1 |
| 2 | Wajah kecil di foto grup menghasilkan embedding lemah | Tinggi | Pisahkan peran portrait vs foto grup, quality-weighted prototype, tiled inference |
| 3 | Bias demografis model publik pada wajah Indonesia | Tinggi, mudah tak terlihat | Kalibrasi threshold pada data sendiri; jangan pernah auto-assign; ukur eksplisit di Fase 0 |
| 4 | Ukuran model & first load di koneksi lambat | Sedang | Model kecil dulu, cache di Cache API/OPFS, lazy load, progress yang jujur |
| 5 | Performa browser di laptop instruktur yang lemah | Sedang | Web Worker, WASM SIMD, batch, jalur eskalasi ke server-side |
| 6 | False merge yang tidak disadari | Tinggi — merusak kepercayaan | Selalu konfirmasi manusia, threshold konservatif, riwayat merge yang bisa di-undo |
| 7 | Model akses tim salah desain (bagian 4a) | Sedang | Mulai dari Opsi A (organisasi datar), validasi kebutuhan sebelum bangun Opsi B |
| 8 | Masalah hukum/persetujuan data biometrik | Sedang (menurun karena peserta dewasa) | Consent attestation eksplisit, retensi pendek, transparansi dalam produk |
| 9 | Terkunci pada satu model wajah | Sedang | Simpan crop selamanya + embedding berversi — re-embedding selalu mungkin |
| 10 | Lisensi model/dataset pretrained | Sedang | Periksa lisensi setiap bobot model di Fase 0, catat di ADR. Beberapa bobot InsightFace hanya untuk riset non-komersial |
| 11 | Scope creep ke arah LMS/absensi penuh | Sedang | Definisi MVP di dokumen ini adalah kontrak |

---

## 14. Pertanyaan yang masih terbuka

1. Model akses tim: Opsi A (organisasi datar) atau Opsi B (kepemilikan per kelas) — lihat bagian 4a.
2. Berapa instruktur/anggota tim yang memakai produk ini bersamaan di MVP?
3. Bentuk consent: checkbox attestation saat pendaftaran, atau dokumen terpisah?
4. Retensi data default: berapa lama data batch training disimpan?
5. Lisensi kode repo — perlu diputuskan terpisah (lihat `LICENSE`).
6. Device saat mengajar — laptop, tablet, atau HP? (Mengubah desain denah secara signifikan.)
7. Perlu jalan tanpa internet di ruang training?

**Rekomendasi:** jawab #1 dan #5 dulu karena berdampak langsung ke skema database dan file yang perlu ditambahkan ke repo. Sisanya bisa menyusul selama Fase 1.

---

## Langkah berikutnya

1. Jawab #1 dan #5 di bagian 14.
2. ~~Rapikan repo: rename branch ke `main`, tambahkan `.gitignore` + `LICENSE`, ganti README, commit dokumen ini ke `docs/`.~~ Sedang dikerjakan.
3. Jalankan **Fase 0 spike** dengan foto training asli. Jangan pilih detail teknis tambahan sebelum angkanya keluar.
4. Setelah spike, kunci keputusan dalam bentuk ADR — bukan dalam bentuk kode.

Tidak ada keputusan yang tidak bisa dibatalkan yang diambil dalam dokumen ini.
