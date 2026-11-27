export type RegionLevel = 'provinsi' | 'kabupaten' | 'kecamatan' | 'ranting';

export interface Region {
  id: string;
  level: RegionLevel;
  name: string;
  parentId?: string;
  provinsiName?: string;
  kabupatenName?: string;
  kecamatanName?: string;
  alamatSekretariat?: string;
  pelatihUtama?: string;
  jadwalLatihan?: string;
  orgCode: 'NURSYAH';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BeltLevel {
  id: string;
  order: number;
  name: string;
  category: 'Sabuk Dasar' | 'Tingkat Strip';
  colorHex: string;
  stripeCount: number;
  sejarah: string;
  kurikulum?: string;
  orgCode: 'NURSYAH';
  updatedAt?: unknown;
}

export interface PromotionRecord {
  fromSabuk: string;
  toSabuk: string;
  tanggal: string;
  penguji: string;
  catatan: string;
}

export interface BerkasChecklist {
  formulir: boolean;
  ktpKk: boolean;
  suratSehat: boolean;
  foto: boolean;
}

export interface Member {
  id: string;
  nia: string;
  namaLengkap: string;
  provinsi: string;
  kabupaten: string;
  kecamatan: string;
  ranting: string;
  alamatLengkap?: string;
  sabuk: string;
  sabukOrder: number;
  tahunDilantikPutih?: string;
  fotoProfil?: string;
  statusAktif: 'Aktif' | 'Cuti' | 'Alumni';
  riwayatTingkat: PromotionRecord[];
  berkasChecklist: BerkasChecklist;
  ownerUid: string;
  orgCode: 'NURSYAH';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MemberPii {
  nomorWa: string;
  tempatLahir: string;
  tanggalLahir: string;
  alamatDomisili: string;
  berkasNama?: string;
  berkasDataUrl?: string;
  ownerUid: string;
  updatedAt?: unknown;
}

export interface Broadcast {
  id: string;
  judul: string;
  isiPesan: string;
  pengirimNama: string;
  pengirimUid: string;
  targetScope: 'Semua' | 'Wilayah' | 'Sabuk';
  targetProvinsi?: string;
  targetKabupaten?: string;
  targetKecamatan?: string;
  targetRanting?: string;
  targetSabuk?: string;
  prioritas: 'Normal' | 'Penting' | 'Mendesak';
  orgCode: 'NURSYAH';
  createdAt?: unknown;
}

export type LetterType = 'Surat Undangan' | 'Surat Tugas' | 'SK Resmi' | 'Surat Edaran';

export interface Letter {
  id: string;
  nomorSurat: string;
  jenisSurat: LetterType;
  perihal: string;
  isiSurat: string;
  targetWilayah: string;
  targetRanting?: string;
  tanggalSurat: string;
  penandatangan: string;
  lampiranNama?: string;
  lampiranDataUrl?: string;
  statusDistribusi: 'Draft' | 'Terkirim';
  authorUid: string;
  orgCode: 'NURSYAH';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type DocCategory =
  | 'Kenangan'
  | 'Acara/Kegiatan'
  | 'Ujian Kenaikan Tingkat'
  | 'Dokumentasi Lainnya';

export interface DocumentationItem {
  id: string;
  judul: string;
  kategori: DocCategory;
  deskripsi?: string;
  tanggalKegiatan: string;
  provinsi: string;
  kabupaten?: string;
  kecamatan?: string;
  ranting?: string;
  lokasiDetail: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  uploaderUid: string;
  uploaderName: string;
  orgCode: 'NURSYAH';
  createdAt?: unknown;
}

export type VaultCategory = 'Legalitas & AD/ART' | 'Keuangan Pusat' | 'SK Pengurus' | 'Arsip Rahasia';

export interface AdminVaultDoc {
  id: string;
  judul: string;
  kategori: VaultCategory;
  nomorDokumen?: string;
  keterangan?: string;
  fileName: string;
  fileType: string;
  fileDataUrl: string;
  uploadedByUid: string;
  uploadedByEmail: string;
  createdAt?: unknown;
}

export interface BackupLog {
  id: string;
  triggerType: 'otomatis' | 'manual';
  totalMembers: number;
  totalRegions: number;
  totalLetters: number;
  createdByUid: string;
  createdAt?: unknown;
}

export interface RegionFilterState {
  provinsi: string;
  kabupaten: string;
  kecamatan: string;
  ranting: string;
  sabuk: string;
  search: string;
}

export interface AdminEmailRecord {
  id: string;
  slot: 1 | 2 | 3;
  email: string;
  nama: string;
  jabatan: string;
  addedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AppTab = 'dashboard' | 'members' | 'hub' | 'belts' | 'tools' | 'backup';
export type ToolSection = 'kta' | 'broadcast' | 'letters' | 'docs' | 'vault';
