import * as XLSX from 'xlsx';
import { BeltLevel, Broadcast, Letter, Member, MemberPii, Region } from '../types/org';

const AUTO_BACKUP_STORAGE_KEY = 'nursyah_auto_backup_snapshot_v1';

export interface FullBackupPayload {
  version: string;
  exportedAt: string;
  organization: 'Aliran Nursyah - PPSI';
  regions: Region[];
  beltLevels: BeltLevel[];
  members: Member[];
  broadcasts: Broadcast[];
  letters: Letter[];
}

export function exportMembersToExcelOrCsv(
  members: Member[],
  piiMap: Record<string, MemberPii>,
  format: 'xlsx' | 'csv',
  scopeLabel: string
): void {
  const rows = members.map((m, idx) => {
    const pii = piiMap[m.id];
    const lastPromo = m.riwayatTingkat?.[m.riwayatTingkat.length - 1];
    return {
      No: idx + 1,
      NIA: m.nia,
      'Nama Lengkap': m.namaLengkap,
      'Tingkatan Sabuk': m.sabuk,
      Status: m.statusAktif,
      Provinsi: m.provinsi,
      'Kabupaten/Kota': m.kabupaten,
      Kecamatan: m.kecamatan,
      'Ranting/Cabang': m.ranting,
      'No. WhatsApp': pii?.nomorWa || '(Akses Terbatas)',
      'Tempat Lahir': pii?.tempatLahir || '-',
      'Tanggal Lahir': pii?.tanggalLahir || '-',
      'Alamat Lengkap': m.alamatLengkap || pii?.alamatDomisili || '-',
      'Kenaikan Terakhir': lastPromo ? `${lastPromo.tanggal} (${lastPromo.toSabuk})` : '-',
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Anggota');

  const safeScope = scopeLabel.replace(/[^a-zA-Z0-9_-]+/g, '_');
  const dateStamp = new Date().toISOString().slice(0, 10);

  if (format === 'xlsx') {
    XLSX.writeFile(wb, `Anggota_Aliran_Nursyah_${safeScope}_${dateStamp}.xlsx`);
  } else {
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Anggota_Aliran_Nursyah_${safeScope}_${dateStamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export function saveLocalAutoBackup(payload: Omit<FullBackupPayload, 'version' | 'exportedAt' | 'organization'>): {
  savedAt: string;
  sizeKb: number;
} {
  const full: FullBackupPayload = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    organization: 'Aliran Nursyah - PPSI',
    ...payload,
  };
  const json = JSON.stringify(full);
  localStorage.setItem(AUTO_BACKUP_STORAGE_KEY, json);
  return {
    savedAt: full.exportedAt,
    sizeKb: Math.max(1, Math.round(json.length / 1024)),
  };
}

export function getLocalAutoBackupMeta(): { savedAt: string; totalMembers: number; sizeKb: number } | null {
  try {
    const raw = localStorage.getItem(AUTO_BACKUP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FullBackupPayload;
    return {
      savedAt: parsed.exportedAt,
      totalMembers: parsed.members?.length || 0,
      sizeKb: Math.max(1, Math.round(raw.length / 1024)),
    };
  } catch {
    return null;
  }
}

export function downloadFullBackupJson(payload: Omit<FullBackupPayload, 'version' | 'exportedAt' | 'organization'>): void {
  const full: FullBackupPayload = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    organization: 'Aliran Nursyah - PPSI',
    ...payload,
  };
  const blob = new Blob([JSON.stringify(full, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Backup_Aliran_Nursyah_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
