# Provenance Formulir Master Data Santri dan Wali

Tanggal pemeriksaan sumber: 2026-11-08  
Status: baseline sumber hukum dan kontrol privasi; **belum merupakan legal opinion, pemetaan pasal-per-field final, atau sertifikasi kepatuhan**.

## Sumber primer yang diperiksa

| Sumber | Status pada JDIH | Relevansi produk |
|---|---|---|
| [UU 18 Tahun 2019 tentang Pesantren](https://peraturan.bpk.go.id/Details/122743/uu-no-18-tahun-2019) | Berlaku | Kerangka pengakuan, penyelenggaraan, fungsi, tata kelola, dan kekhasan pesantren. Tidak otomatis menetapkan seluruh field profil santri pada aplikasi. |
| [UU 27 Tahun 2022 tentang Pelindungan Data Pribadi](https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022) | Berlaku | Dasar desain tujuan dan dasar pemrosesan, transparansi, pembatasan akses, keamanan, hak subjek data, retensi, serta perlakuan khusus untuk data anak dan kesehatan. |

Sumber pendukung Kementerian Agama: [JDIH Kemenag – dokumen analisis dan evaluasi PMA 30/2020](https://jdih.kemenag.go.id/yzxkthpo/dokumen-puu/260129130115_1aig2.pdf). Dokumen evaluasi ini bukan pengganti naskah konsolidasi peraturan atau keputusan pejabat berwenang. Pemetaan PMA/Keputusan Dirjen/EMIS dan formulir daerah harus diverifikasi per jalur pendidikan sebelum dijadikan persyaratan sistem.

## Aturan penerapan formulir

1. **Tidak semua field wajib untuk semua lembaga.** Applicability ditentukan oleh bentuk lembaga, izin/program yang benar-benar diselenggarakan, tujuan pemrosesan, usia santri, kebijakan resmi, dan sumber dokumen.
2. **UU 18/2019 adalah kerangka penyelenggaraan**, bukan dasar untuk menyebut NISN, NIK, golongan darah, atau seluruh rincian alamat sebagai field wajib universal pesantren.
3. **UU 27/2022 menjadi dasar kontrol privasi.** Data anak dan informasi kesehatan merupakan data pribadi spesifik menurut UU PDP; data identitas, kontak keluarga, relasi wali, dan dokumen perlu klasifikasi serta akses proporsional.
4. Hubungan biologis, wali utama administratif, wali sah, penanggung biaya, kontak darurat, dan otoritas penjemput adalah atribut terpisah. Kewenangan hukum tidak boleh disimpulkan dari pilihan hubungan keluarga.
5. Sinkronisasi EMIS, Dapodik, atau sistem instansi lain tidak boleh diaktifkan sebelum spesifikasi resmi, otorisasi, format, dan mekanisme pertukaran data terkini diverifikasi.

## Matriks metadata implementasi

| Resource | Kelompok field | Klasifikasi | Sumber / peran | Applicability dan batasan |
|---|---|---|---|---|
| Master Santri | Identitas induk | Restricted | UU 18/2019 (kerangka); UU 27/2022 (privasi) | Nomor induk internal adalah kebutuhan operasional. NISN hanya bila tersedia dan diverifikasi sesuai jalur. |
| Master Santri | Alamat dan kontak | Restricted | UU 27/2022 (privasi) | Isi komponen yang diperlukan; bedakan domisili, alamat dokumen, dan kontak wali. |
| Master Santri | Pendidikan dan status | General / internal | UU 18/2019 (kerangka) | Jenjang, program, dan atribut pelaporan mengikuti izin/jalur lembaga. |
| Wali | Identitas, relasi, alamat, kontak | Restricted | UU 27/2022 (privasi) | Catat data minimum yang diperlukan; hubungan tidak membuktikan kuasa hukum. |
| Relasi Santri–Wali | Peran dan masa berlaku | Restricted | UU 27/2022 (privasi) | Verifikasi wali sah dan izin jemput melalui alur petugas khusus dan bukti sumber. |
| Dokumen Identitas | Nomor dan metadata dokumen | Restricted | UU 27/2022 (privasi) | Nomor terenkripsi, daftar dimasking, operasi fail-closed jika kunci tidak tersedia. |
| Kesehatan | Golongan darah, alergi, riwayat, obat, instruksi darurat | Restricted | UU 27/2022 (data spesifik) | Hanya data relevan untuk keselamatan; enkripsi, least privilege, audit baca/tulis, retensi. |

## Implementasi dan gap yang masih terbuka

- apps/web/src/student-form-metadata.ts menyimpan urutan section, catatan pengisian, klasifikasi, applicability, dan rujukan resmi untuk lima resource Master Santri/Wali.
- ModuleWorkspace.tsx menampilkan metadata tersebut pada formulir; resource lain masih menggunakan grouping fallback dan belum memiliki metadata legal per field.
- module-records.ts memvalidasi struktur alamat: hanya key alamat yang diizinkan, nilai harus string, panjang dibatasi, dan kode negara harus dua huruf.
- Unit test API menutup input alamat dengan key asing, tipe data salah, masa berlaku relasi terbalik, dan tanggal masuk sebelum tanggal lahir.
- Endpoint khusus dokumen identitas dan kesehatan tetap menggunakan enkripsi serta permission khusus. Konfigurasi kunci identitas yang belum tersedia tetap menjadi blocker fail-closed; tidak boleh diatasi dengan mengirim secret melalui chat.
- Belum ada verifikasi legal field-per-field oleh penasihat hukum/pemilik proses, attachment privat dan checklist verifikasi dokumen, halaman detail record, audit timeline UI, retensi otomatis, atau UAT tenant nyata.

## Kriteria sebelum label “sesuai regulasi”

Setiap field perlu memiliki: instansi penerbit, instrumen dan pasal/standar/form versi yang tepat, URL sumber resmi, tanggal pemeriksaan, jenis lembaga/program yang berlaku, required/conditional/optional, tujuan dan dasar pemrosesan, klasifikasi, retensi, permission, skema API/DB, serta test positif dan negatif. Perubahan regulasi harus memiliki versioning dan review sebelum form diperbarui.
