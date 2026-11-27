import { BeltLevel } from '../types/org';

export const DEFAULT_BELT_LEVELS: Omit<BeltLevel, 'updatedAt'>[] = [
  {
    id: 'belt-01-kuning-mas',
    order: 1,
    name: 'Sabuk Kuning Mas',
    category: 'Sabuk Dasar',
    colorHex: '#D97706',
    stripeCount: 0,
    sejarah:
      'Tingkatan awal bagi calon pendekar Aliran Nursyah. Warna Kuning Mas melambangkan cahaya niat suci, keluhuran adab, dan kesiapan hati menimba ilmu lahir batin sebelum dilantik menjadi warga Sabuk Putih.',
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
      'Melambangkan kesucian niat dan pelantikan resmi sebagai anggota Aliran Nursyah. Pada tingkatan inilah Nomor KTA mulai dicatat sesuai tahun dilantik dan anggota berhak mencetak KTA resmi.',
    kurikulum: 'Kuda-kuda pokok, tangkisan dasar, langkah segitiga, pengucapan Catur Satya, dan jurus tunggal.',
    orgCode: 'NURSYAH',
  },
  {
    id: 'belt-03-hitam',
    order: 3,
    name: 'Sabuk Hitam',
    category: 'Sabuk Dasar',
    colorHex: '#0F172A',
    stripeCount: 0,
    sejarah:
      'Tingkatan pemantapan jiwa pendekar setelah Sabuk Putih sebelum memasuki jenjang Tingkat Strip. Warna hitam melambangkan keteguhan prinsip, penguasaan diri, dan kesetiaan menjaga marwah perguruan.',
    kurikulum: 'Pendalaman jurus inti Aliran Nursyah, pengendalian tenaga dalam, serta dasar pembinaan adik tingkat.',
    orgCode: 'NURSYAH',
  },
  ...Array.from({ length: 17 }, (_, idx) => {
    const strip = idx + 1;
    const order = strip + 3;
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

/**
 * Merges canonical DEFAULT_BELT_LEVELS (including Sabuk Hitam at order 3) with any
 * customized notes/curriculums stored in Firestore `belt_levels`.
 */
export function resolveOrderedBelts(beltLevels: BeltLevel[]): BeltLevel[] {
  const byName = new Map<string, BeltLevel>();
  beltLevels.forEach((b) => {
    byName.set(b.name.trim().toLowerCase(), b);
  });

  const merged: BeltLevel[] = DEFAULT_BELT_LEVELS.map((def) => {
    const stored = byName.get(def.name.trim().toLowerCase());
    if (!stored) return def as BeltLevel;
    return {
      ...def,
      sejarah: stored.sejarah || def.sejarah,
      kurikulum: stored.kurikulum ?? def.kurikulum,
      updatedAt: stored.updatedAt,
    };
  });

  const canonicalNames = new Set(DEFAULT_BELT_LEVELS.map((b) => b.name.trim().toLowerCase()));
  beltLevels.forEach((b) => {
    if (!canonicalNames.has(b.name.trim().toLowerCase())) {
      merged.push(b);
    }
  });

  return merged.sort((a, b) => a.order - b.order);
}

export function getCanonicalBeltOrder(sabuk: string): number {
  const found = DEFAULT_BELT_LEVELS.find(
    (b) => b.name.trim().toLowerCase() === sabuk.trim().toLowerCase()
  );
  return found ? found.order : 1;
}

/**
 * KTA printing is strictly available from Sabuk Putih upwards
 * (Sabuk Putih, Sabuk Hitam, and Tingkat Strip 1–17).
 */
export function isBeltEligibleForKta(sabuk: string, sabukOrder?: number): boolean {
  const lower = sabuk.trim().toLowerCase();
  if (lower.includes('kuning')) return false;
  const canonical = DEFAULT_BELT_LEVELS.find((b) => b.name.trim().toLowerCase() === lower);
  if (canonical) return canonical.order >= 2;
  return typeof sabukOrder === 'number' ? sabukOrder >= 2 : false;
}
