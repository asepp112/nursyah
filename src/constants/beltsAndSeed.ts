import { BeltLevel, Region } from '../types/org';

export const DEFAULT_BELT_LEVELS: Omit<BeltLevel, 'updatedAt'>[] = [
  {
    id: 'belt-01-kuning-mas',
    order: 1,
    name: 'Sabuk Kuning Mas',
    category: 'Sabuk Dasar',
    colorHex: '#D97706',
    stripeCount: 0,
    sejarah:
      'Tingkatan awal bagi calon pendekar Aliran Nursyah. Warna Kuning Mas melambangkan cahaya niat suci, keluhuran adab, dan kesiapan hati menimba ilmu lahir batin sebelum melangkah ke jurus inti.',
    kurikulum: 'Sikap pasang dasar, tata krama perguruan, pernapasan dasar, dan jurus pembuka 1–3.',
    orgCode: 'NURSYAH',
  },
  {
    id: 'belt-02-putih',
    order: 2,
    name: 'Sabuk Putih',
    category: 'Sabuk Dasar',
    colorHex: '#E2E8F0',
    stripeCount: 0,
    sejarah:
      'Melambangkan kesucian niat dan pemantapan karakter siswa setelah melewati masa pengenalan. Siswa mulai dibentuk kedisiplinan langkah kuda-kuda dan ketenangan batin.',
    kurikulum: 'Kuda-kuda pokok, tangkisan dasar, langkah segitiga, dan pengenalan jurus tunggal.',
    orgCode: 'NURSYAH',
  },
  ...Array.from({ length: 17 }, (_, idx) => {
    const strip = idx + 1;
    const order = strip + 2;
    let sejarah = '';
    let kurikulum = '';

    if (strip <= 4) {
      sejarah = `Tingkat Strip ${strip} menandai penguatan pondasi teknik bela diri Aliran Nursyah tahap awal. Anggota mulai dipercaya menjaga ketertiban latihan di ranting dan mengasah kepekaan gerak reflek.`;
      kurikulum = `Pemantapan jurus dasar lanjutan ke-${strip}, aplikasi belaan tangan kosong, dan penguasaan pola langkah.`;
    } else if (strip <= 9) {
      sejarah = `Tingkat Strip ${strip} merupakan fase menengah penempaan mental dan kelincahan. Dalam tradisi Aliran Nursyah, penyandang strip menengah mulai mendalami filosofi keseimbangan antara ketegasan dan welas asih.`;
      kurikulum = `Jurus ganda berpasangan, teknik kuncian & bantingan aman, serta persiapan asisten pelatih ranting.`;
    } else if (strip <= 13) {
      sejarah = `Tingkat Strip ${strip} adalah jenjang pelatih muda dan penggerak cabang. Sejarah tingkatan ini berakar pada para sesepuh perguruan yang ditugaskan membuka padepokan di wilayah-wilayah baru.`;
      kurikulum = `Kepelatihan ranting, aplikasi senjata tradisional PPSI (golok & toya), serta tata kelola ujian cabang.`;
    } else if (strip <= 16) {
      sejarah = `Tingkat Strip ${strip} merupakan tingkatan senior yang memadukan ketajaman jurus tingkat tinggi dan kebijaksanaan kepemimpinan organisasi di tingkat kabupaten hingga provinsi.`;
      kurikulum = `Jurus rahasia aliran tahap ${strip - 13}, pembinaan mental spiritual, dan penguji resmi kenaikan tingkat.`;
    } else {
      sejarah =
        'Tingkat Strip 17 adalah puncak jenjang strip dalam Aliran Nursyah — PPSI. Penyandang tingkat ini adalah Dewan Pendekar & Pembina Utama yang menjadi rujukan sanad keilmuan, sejarah perguruan, dan penjaga marwah organisasi.';
      kurikulum = 'Penguasaan paripurna seluruh jurus Aliran Nursyah, dewan penguji pusat, dan pemegang amanah sanad.';
    }

    return {
      id: `belt-${String(order).padStart(2, '0')}-strip-${strip}`,
      order,
      name: `Tingkat Strip ${strip}`,
      category: 'Tingkat Strip' as const,
      colorHex: strip >= 14 ? '#991B1B' : strip >= 10 ? '#B91C1C' : strip >= 5 ? '#1E293B' : '#334155',
      stripeCount: strip,
      sejarah,
      kurikulum,
      orgCode: 'NURSYAH' as const,
    };
  }),
];

export const DEFAULT_REGIONS: Omit<Region, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'prov-jawa-barat',
    level: 'provinsi',
    name: 'Jawa Barat',
    parentId: '',
    orgCode: 'NURSYAH',
  },
  {
    id: 'prov-dki-jakarta',
    level: 'provinsi',
    name: 'DKI Jakarta',
    parentId: '',
    orgCode: 'NURSYAH',
  },
  {
    id: 'kab-bandung',
    level: 'kabupaten',
    name: 'Kabupaten Bandung',
    parentId: 'prov-jawa-barat',
    provinsiName: 'Jawa Barat',
    orgCode: 'NURSYAH',
  },
  {
    id: 'kota-bandung',
    level: 'kabupaten',
    name: 'Kota Bandung',
    parentId: 'prov-jawa-barat',
    provinsiName: 'Jawa Barat',
    orgCode: 'NURSYAH',
  },
  {
    id: 'kota-jakarta-selatan',
    level: 'kabupaten',
    name: 'Kota Jakarta Selatan',
    parentId: 'prov-dki-jakarta',
    provinsiName: 'DKI Jakarta',
    orgCode: 'NURSYAH',
  },
  {
    id: 'kec-soreang',
    level: 'kecamatan',
    name: 'Kecamatan Soreang',
    parentId: 'kab-bandung',
    provinsiName: 'Jawa Barat',
    kabupatenName: 'Kabupaten Bandung',
    orgCode: 'NURSYAH',
  },
  {
    id: 'kec-baleendah',
    level: 'kecamatan',
    name: 'Kecamatan Baleendah',
    parentId: 'kab-bandung',
    provinsiName: 'Jawa Barat',
    kabupatenName: 'Kabupaten Bandung',
    orgCode: 'NURSYAH',
  },
  {
    id: 'kec-coblong',
    level: 'kecamatan',
    name: 'Kecamatan Coblong',
    parentId: 'kota-bandung',
    provinsiName: 'Jawa Barat',
    kabupatenName: 'Kota Bandung',
    orgCode: 'NURSYAH',
  },
  {
    id: 'kec-pasar-minggu',
    level: 'kecamatan',
    name: 'Kecamatan Pasar Minggu',
    parentId: 'kota-jakarta-selatan',
    provinsiName: 'DKI Jakarta',
    kabupatenName: 'Kota Jakarta Selatan',
    orgCode: 'NURSYAH',
  },
  {
    id: 'ranting-soreang-utama',
    level: 'ranting',
    name: 'Ranting Soreang Utama',
    parentId: 'kec-soreang',
    provinsiName: 'Jawa Barat',
    kabupatenName: 'Kabupaten Bandung',
    kecamatanName: 'Kecamatan Soreang',
    alamatSekretariat: 'Jl. Al-Fathu No. 18, Soreang, Kab. Bandung',
    pelatihUtama: 'Kang H. Rahmat Hidayat',
    jadwalLatihan: 'Selasa & Jumat, 19.30 WIB',
    orgCode: 'NURSYAH',
  },
  {
    id: 'ranting-baleendah-selatan',
    level: 'ranting',
    name: 'Ranting Baleendah Selatan',
    parentId: 'kec-baleendah',
    provinsiName: 'Jawa Barat',
    kabupatenName: 'Kabupaten Bandung',
    kecamatanName: 'Kecamatan Baleendah',
    alamatSekretariat: 'Jl. Siliwangi No. 45, Baleendah, Kab. Bandung',
    pelatihUtama: 'Kang Dedi Kurniawan',
    jadwalLatihan: 'Rabu & Sabtu, 19.00 WIB',
    orgCode: 'NURSYAH',
  },
  {
    id: 'ranting-dago-coblong',
    level: 'ranting',
    name: 'Ranting Dago Coblong',
    parentId: 'kec-coblong',
    provinsiName: 'Jawa Barat',
    kabupatenName: 'Kota Bandung',
    kecamatanName: 'Kecamatan Coblong',
    alamatSekretariat: 'Jl. Ir. H. Juanda No. 112, Coblong, Kota Bandung',
    pelatihUtama: 'Teh Siti Aminah',
    jadwalLatihan: 'Kamis & Minggu, 16.00 WIB',
    orgCode: 'NURSYAH',
  },
  {
    id: 'ranting-ragunan-pusat',
    level: 'ranting',
    name: 'Ranting Ragunan Pusat',
    parentId: 'kec-pasar-minggu',
    provinsiName: 'DKI Jakarta',
    kabupatenName: 'Kota Jakarta Selatan',
    kecamatanName: 'Kecamatan Pasar Minggu',
    alamatSekretariat: 'Jl. Harsono RM No. 22, Ragunan, Jakarta Selatan',
    pelatihUtama: 'Ust. Ahmad Fauzi',
    jadwalLatihan: 'Sabtu & Minggu, 08.00 WIB',
    orgCode: 'NURSYAH',
  },
];

export const SAMPLE_MEMBERS_SEED = [
  {
    id: 'member-nrs-001',
    nia: 'NRS-3204-001',
    namaLengkap: 'Ahmad Rizal Pratama',
    provinsi: 'Jawa Barat',
    kabupaten: 'Kabupaten Bandung',
    kecamatan: 'Kecamatan Soreang',
    ranting: 'Ranting Soreang Utama',
    alamatLengkap: 'Kp. Cingcin RT 02/RW 05, Desa Cingcin, Kec. Soreang, Kab. Bandung, Jawa Barat',
    sabuk: 'Tingkat Strip 7',
    sabukOrder: 9,
    statusAktif: 'Aktif' as const,
    riwayatTingkat: [
      {
        fromSabuk: 'Sabuk Kuning Mas',
        toSabuk: 'Sabuk Putih',
        tanggal: '2022-03-14',
        penguji: 'Dewan Penguji Kab. Bandung',
        catatan: 'Lulus ujian dasar dengan penguasaan kuda-kuda sangat baik.',
      },
      {
        fromSabuk: 'Tingkat Strip 6',
        toSabuk: 'Tingkat Strip 7',
        tanggal: '2025-11-10',
        penguji: 'Kang H. Rahmat Hidayat',
        catatan: 'Lulus UKT tingkat menengah dan aktif membantu melatih siswa baru.',
      },
    ],
    berkasChecklist: { formulir: true, ktpKk: true, suratSehat: true, foto: true },
    pii: {
      nomorWa: '081223456789',
      tempatLahir: 'Bandung',
      tanggalLahir: '2001-05-14',
      alamatDomisili: 'Kp. Cingcin RT 02/RW 05, Desa Cingcin, Kec. Soreang',
    },
  },
  {
    id: 'member-nrs-002',
    nia: 'NRS-3204-002',
    namaLengkap: 'Siti Nurhaliza Putri',
    provinsi: 'Jawa Barat',
    kabupaten: 'Kabupaten Bandung',
    kecamatan: 'Kecamatan Baleendah',
    ranting: 'Ranting Baleendah Selatan',
    alamatLengkap: 'Jl. Adipati Agung No. 19, Kel. Baleendah, Kec. Baleendah, Kab. Bandung, Jawa Barat',
    sabuk: 'Sabuk Putih',
    sabukOrder: 2,
    statusAktif: 'Aktif' as const,
    riwayatTingkat: [
      {
        fromSabuk: 'Sabuk Kuning Mas',
        toSabuk: 'Sabuk Putih',
        tanggal: '2026-01-20',
        penguji: 'Kang Dedi Kurniawan',
        catatan: 'Kenaikan tingkat reguler semester genap.',
      },
    ],
    berkasChecklist: { formulir: true, ktpKk: true, suratSehat: true, foto: true },
    pii: {
      nomorWa: '085611223344',
      tempatLahir: 'Bandung',
      tanggalLahir: '2006-08-22',
      alamatDomisili: 'Jl. Adipati Agung No. 19, Kel. Baleendah',
    },
  },
  {
    id: 'member-nrs-003',
    nia: 'NRS-3273-003',
    namaLengkap: 'Budi Santoso Wijaya',
    provinsi: 'Jawa Barat',
    kabupaten: 'Kota Bandung',
    kecamatan: 'Kecamatan Coblong',
    ranting: 'Ranting Dago Coblong',
    alamatLengkap: 'Jl. Tubagus Ismail VIII No. 14, Kec. Coblong, Kota Bandung, Jawa Barat',
    sabuk: 'Tingkat Strip 12',
    sabukOrder: 14,
    statusAktif: 'Aktif' as const,
    riwayatTingkat: [
      {
        fromSabuk: 'Tingkat Strip 11',
        toSabuk: 'Tingkat Strip 12',
        tanggal: '2025-08-17',
        penguji: 'Dewan Pendekar Pusat',
        catatan: 'Pengukuhan pelatih cabang wilayah Kota Bandung.',
      },
    ],
    berkasChecklist: { formulir: true, ktpKk: true, suratSehat: true, foto: true },
    pii: {
      nomorWa: '081398765432',
      tempatLahir: 'Cimahi',
      tanggalLahir: '1994-11-03',
      alamatDomisili: 'Jl. Tubagus Ismail VIII No. 14, Coblong, Kota Bandung',
    },
  },
  {
    id: 'member-nrs-004',
    nia: 'NRS-3174-004',
    namaLengkap: 'Muhammad Farhan',
    provinsi: 'DKI Jakarta',
    kabupaten: 'Kota Jakarta Selatan',
    kecamatan: 'Kecamatan Pasar Minggu',
    ranting: 'Ranting Ragunan Pusat',
    alamatLengkap: 'Jl. Kebagusan Raya No. 77, Kec. Pasar Minggu, Kota Jakarta Selatan, DKI Jakarta',
    sabuk: 'Sabuk Kuning Mas',
    sabukOrder: 1,
    statusAktif: 'Aktif' as const,
    riwayatTingkat: [],
    berkasChecklist: { formulir: true, ktpKk: true, suratSehat: false, foto: true },
    pii: {
      nomorWa: '087855667788',
      tempatLahir: 'Jakarta',
      tanggalLahir: '2008-02-19',
      alamatDomisili: 'Jl. Kebagusan Raya No. 77, Pasar Minggu, Jakarta Selatan',
    },
  },
];
