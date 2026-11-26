export interface IndoRegionItem {
  id: string;
  name: string;
  rawName: string;
}

const API_BASE = 'https://www.emsifa.com/api-wilayah-indonesia/api';
const CACHE_PREFIX = 'nursyah_indo_wilayah_v1_';

// Daftar lengkap provinsi di Indonesia (instan tanpa menunggu jaringan, sekaligus fallback offline)
export const STATIC_INDO_PROVINCES: IndoRegionItem[] = [
  { id: '11', rawName: 'ACEH', name: 'Aceh' },
  { id: '12', rawName: 'SUMATERA UTARA', name: 'Sumatera Utara' },
  { id: '13', rawName: 'SUMATERA BARAT', name: 'Sumatera Barat' },
  { id: '14', rawName: 'RIAU', name: 'Riau' },
  { id: '15', rawName: 'JAMBI', name: 'Jambi' },
  { id: '16', rawName: 'SUMATERA SELATAN', name: 'Sumatera Selatan' },
  { id: '17', rawName: 'BENGKULU', name: 'Bengkulu' },
  { id: '18', rawName: 'LAMPUNG', name: 'Lampung' },
  { id: '19', rawName: 'KEPULAUAN BANGKA BELITUNG', name: 'Kepulauan Bangka Belitung' },
  { id: '21', rawName: 'KEPULAUAN RIAU', name: 'Kepulauan Riau' },
  { id: '31', rawName: 'DKI JAKARTA', name: 'DKI Jakarta' },
  { id: '32', rawName: 'JAWA BARAT', name: 'Jawa Barat' },
  { id: '33', rawName: 'JAWA TENGAH', name: 'Jawa Tengah' },
  { id: '34', rawName: 'DI YOGYAKARTA', name: 'DI Yogyakarta' },
  { id: '35', rawName: 'JAWA TIMUR', name: 'Jawa Timur' },
  { id: '36', rawName: 'BANTEN', name: 'Banten' },
  { id: '51', rawName: 'BALI', name: 'Bali' },
  { id: '52', rawName: 'NUSA TENGGARA BARAT', name: 'Nusa Tenggara Barat' },
  { id: '53', rawName: 'NUSA TENGGARA TIMUR', name: 'Nusa Tenggara Timur' },
  { id: '61', rawName: 'KALIMANTAN BARAT', name: 'Kalimantan Barat' },
  { id: '62', rawName: 'KALIMANTAN TENGAH', name: 'Kalimantan Tengah' },
  { id: '63', rawName: 'KALIMANTAN SELATAN', name: 'Kalimantan Selatan' },
  { id: '64', rawName: 'KALIMANTAN TIMUR', name: 'Kalimantan Timur' },
  { id: '65', rawName: 'KALIMANTAN UTARA', name: 'Kalimantan Utara' },
  { id: '71', rawName: 'SULAWESI UTARA', name: 'Sulawesi Utara' },
  { id: '72', rawName: 'SULAWESI TENGAH', name: 'Sulawesi Tengah' },
  { id: '73', rawName: 'SULAWESI SELATAN', name: 'Sulawesi Selatan' },
  { id: '74', rawName: 'SULAWESI TENGGARA', name: 'Sulawesi Tenggara' },
  { id: '75', rawName: 'GORONTALO', name: 'Gorontalo' },
  { id: '76', rawName: 'SULAWESI BARAT', name: 'Sulawesi Barat' },
  { id: '81', rawName: 'MALUKU', name: 'Maluku' },
  { id: '82', rawName: 'MALUKU UTARA', name: 'Maluku Utara' },
  { id: '91', rawName: 'PAPUA BARAT', name: 'Papua Barat' },
  { id: '92', rawName: 'PAPUA BARAT DAYA', name: 'Papua Barat Daya' },
  { id: '94', rawName: 'PAPUA', name: 'Papua' },
  { id: '95', rawName: 'PAPUA SELATAN', name: 'Papua Selatan' },
  { id: '96', rawName: 'PAPUA TENGAH', name: 'Papua Tengah' },
  { id: '97', rawName: 'PAPUA PEGUNUNGAN', name: 'Papua Pegunungan' },
];

const memoryCache = new Map<string, IndoRegionItem[]>();

export function formatIndoRegionName(raw: string, prefix?: 'Kecamatan'): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  const words = cleaned.split(' ').map((word) => {
    const upper = word.toUpperCase();
    if (upper === 'DKI' || upper === 'DI' || upper === 'RI') return upper;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
  let formatted = words.join(' ');
  if (prefix === 'Kecamatan' && !/^kecamatan\s+/i.test(formatted)) {
    formatted = `Kecamatan ${formatted}`;
  }
  return formatted;
}

export function normalizeIndoKey(val: string): string {
  return val
    .toLowerCase()
    .replace(/^(provinsi|kecamatan|kec\.|kab\.|kota adm\.|kelurahan|kel\.|desa)\s+/gi, '')
    .replace(/[^a-z0-9]/g, '');
}

async function fetchWithCache(
  cacheKey: string,
  url: string,
  prefix?: 'Kecamatan'
): Promise<IndoRegionItem[]> {
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey)!;
  }

  try {
    const cachedRaw = localStorage.getItem(CACHE_PREFIX + cacheKey);
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw) as IndoRegionItem[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryCache.set(cacheKey, parsed);
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Gagal memuat data wilayah Indonesia (HTTP ${res.status}).`);
    }
    const json = (await res.json()) as Array<{ id: string; name: string }>;
    if (!Array.isArray(json)) {
      throw new Error('Format data wilayah Indonesia tidak valid.');
    }
    const items: IndoRegionItem[] = json
      .filter((item) => item && item.id && item.name)
      .map((item) => ({
        id: String(item.id),
        rawName: String(item.name),
        name: formatIndoRegionName(String(item.name), prefix),
      }));

    memoryCache.set(cacheKey, items);
    try {
      localStorage.setItem(CACHE_PREFIX + cacheKey, JSON.stringify(items));
    } catch {
      // ignore quota errors
    }
    return items;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchIndonesiaProvinces(): Promise<IndoRegionItem[]> {
  try {
    const remote = await fetchWithCache('provinces', `${API_BASE}/provinces.json`);
    if (remote.length > 0) return remote;
  } catch {
    // fallback cleanly to static provinces
  }
  return STATIC_INDO_PROVINCES;
}

export async function fetchIndonesiaRegencies(provinceId: string): Promise<IndoRegionItem[]> {
  if (!provinceId) return [];
  return fetchWithCache(`regencies_${provinceId}`, `${API_BASE}/regencies/${provinceId}.json`);
}

export async function fetchIndonesiaDistricts(regencyId: string): Promise<IndoRegionItem[]> {
  if (!regencyId) return [];
  return fetchWithCache(
    `districts_${regencyId}`,
    `${API_BASE}/districts/${regencyId}.json`,
    'Kecamatan'
  );
}

export async function fetchIndonesiaVillages(districtId: string): Promise<IndoRegionItem[]> {
  if (!districtId) return [];
  return fetchWithCache(`villages_${districtId}`, `${API_BASE}/villages/${districtId}.json`);
}

export function findRegionItemByName(
  list: IndoRegionItem[],
  targetName: string
): IndoRegionItem | undefined {
  if (!targetName.trim()) return undefined;
  const exact = list.find((i) => i.name.toLowerCase() === targetName.trim().toLowerCase());
  if (exact) return exact;
  const normalizedTarget = normalizeIndoKey(targetName);
  return list.find((i) => normalizeIndoKey(i.name) === normalizedTarget);
}

export function composeIndonesianAddress(parts: {
  detailJalan?: string;
  kelurahan?: string;
  kecamatan?: string;
  kabupaten?: string;
  provinsi?: string;
}): string {
  const segments: string[] = [];
  if (parts.detailJalan?.trim()) segments.push(parts.detailJalan.trim());
  if (parts.kelurahan?.trim()) segments.push(`Kel./Desa ${parts.kelurahan.trim()}`);
  if (parts.kecamatan?.trim()) segments.push(parts.kecamatan.trim());
  if (parts.kabupaten?.trim()) segments.push(parts.kabupaten.trim());
  if (parts.provinsi?.trim()) segments.push(parts.provinsi.trim());
  return segments.join(', ').slice(0, 350);
}
