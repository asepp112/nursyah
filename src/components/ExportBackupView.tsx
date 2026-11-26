import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Upload,
} from 'lucide-react';
import {
  BackupLog,
  BeltLevel,
  Broadcast,
  Letter,
  Member,
  MemberPii,
  Region,
} from '../types/org';
import {
  downloadFullBackupJson,
  exportMembersToExcelOrCsv,
  FullBackupPayload,
  getLocalAutoBackupMeta,
  saveLocalAutoBackup,
} from '../lib/exportBackup';

interface ExportBackupViewProps {
  members: Member[];
  regions: Region[];
  beltLevels: BeltLevel[];
  broadcasts: Broadcast[];
  letters: Letter[];
  piiCache: Record<string, MemberPii>;
  backupLogs: BackupLog[];
  isAdmin: boolean;
  onLogCloudBackup: (triggerType: 'otomatis' | 'manual') => Promise<void>;
  onRestoreBackup: (payload: FullBackupPayload) => Promise<void>;
}

export const ExportBackupView: React.FC<ExportBackupViewProps> = ({
  members,
  regions,
  beltLevels,
  broadcasts,
  letters,
  piiCache,
  backupLogs,
  isAdmin,
  onLogCloudBackup,
  onRestoreBackup,
}) => {
  const [exportProv, setExportProv] = useState('');
  const [exportRanting, setExportRanting] = useState('');
  const [autoBackupMeta, setAutoBackupMeta] = useState(() => getLocalAutoBackupMeta());
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState('');

  const provinsiOptions = useMemo(
    () => Array.from(new Set(members.map((m) => m.provinsi))).sort(),
    [members]
  );

  const rantingOptions = useMemo(
    () =>
      Array.from(
        new Set(
          members
            .filter((m) => !exportProv || m.provinsi === exportProv)
            .map((m) => m.ranting)
        )
      ).sort(),
    [members, exportProv]
  );

  const scopedMembers = useMemo(() => {
    return members.filter((m) => {
      if (exportProv && m.provinsi !== exportProv) return false;
      if (exportRanting && m.ranting !== exportRanting) return false;
      return true;
    });
  }, [members, exportProv, exportRanting]);

  const scopeLabel = exportRanting || exportProv || 'Semua_Wilayah';

  const handleManualSnapshot = async () => {
    setSavingSnapshot(true);
    try {
      saveLocalAutoBackup({ regions, beltLevels, members, broadcasts, letters });
      setAutoBackupMeta(getLocalAutoBackupMeta());
      if (isAdmin) {
        await onLogCloudBackup('manual');
      }
    } finally {
      setSavingSnapshot(false);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreMsg('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as FullBackupPayload;
      if (!Array.isArray(parsed.members) || !Array.isArray(parsed.regions)) {
        throw new Error('Format berkas backup JSON tidak valid.');
      }
      await onRestoreBackup(parsed);
      setRestoreMsg(
        `Pemulihan selesai: ${parsed.regions.length} wilayah dan ${parsed.members.length} anggota disinkronkan.`
      );
    } catch (err) {
      setRestoreMsg(err instanceof Error ? err.message : 'Gagal memulihkan backup.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
          Ekspor Data & Sistem Backup Otomatis
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Unduh laporan anggota per wilayah atau seluruh organisasi dalam format Excel/CSV, serta kelola pencadangan otomatis agar data tetap aman.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* EKSPOR EXCEL / CSV */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Ekspor Data ke Excel / CSV</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pilih cakupan wilayah atau ranting tertentu, lalu ekspor langsung ke lembar kerja Excel (.xlsx) atau CSV.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Filter Provinsi</label>
              <select
                value={exportProv}
                onChange={(e) => {
                  setExportProv(e.target.value);
                  setExportRanting('');
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">Seluruh Provinsi</option>
                {provinsiOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Filter Ranting / Cabang
              </label>
              <select
                value={exportRanting}
                onChange={(e) => setExportRanting(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">Seluruh Ranting</option>
                {rantingOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 flex items-center justify-between">
            <span>Jumlah data siap diekspor:</span>
            <span className="font-mono font-bold text-slate-900 tabular-nums">
              {scopedMembers.length} anggota
            </span>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={scopedMembers.length === 0}
              onClick={() => exportMembersToExcelOrCsv(scopedMembers, piiCache, 'xlsx', scopeLabel)}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Ekspor Data ke Excel (.xlsx)</span>
            </button>
            <button
              type="button"
              disabled={scopedMembers.length === 0}
              onClick={() => exportMembersToExcelOrCsv(scopedMembers, piiCache, 'csv', scopeLabel)}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Ekspor Data ke CSV</span>
            </button>
          </div>
        </section>

        {/* BACKUP OTOMATIS & PEMULIHAN */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-slate-100 text-slate-800 rounded-lg border border-slate-200">
              <DatabaseBackup className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Sistem Backup Otomatis</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Database disinkronkan secara real-time di cloud Firestore dan dicadangkan otomatis secara lokal setiap terjadi pembaruan data.
              </p>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Status Backup Otomatis Lokal
              </span>
              <span className="font-semibold text-emerald-700">Aktif</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Cadangan Terakhir</span>
              <span className="font-mono tabular-nums text-slate-900">
                {autoBackupMeta
                  ? `${new Date(autoBackupMeta.savedAt).toLocaleString('id-ID')} (${autoBackupMeta.sizeKb} KB)`
                  : 'Menunggu sinkronisasi'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={savingSnapshot}
              onClick={handleManualSnapshot}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-lg cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{savingSnapshot ? 'Menyimpan...' : 'Perbarui Snapshot Sekarang'}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                downloadFullBackupJson({ regions, beltLevels, members, broadcasts, letters })
              }
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Unduh Arsip JSON Penuh</span>
            </button>
          </div>

          {isAdmin && (
            <div className="pt-3 border-t border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">
                  Pulihkan Data dari Berkas Backup JSON (Admin)
                </span>
              </div>
              <label className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>Pilih Berkas Backup (.json) untuk Dipulihkan</span>
                <input type="file" accept=".json" onChange={handleRestoreFile} className="hidden" />
              </label>
              {restoreMsg && <p className="text-xs text-emerald-700 font-medium">{restoreMsg}</p>}
            </div>
          )}

          {isAdmin && backupLogs.length > 0 && (
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <p className="text-xs font-semibold text-slate-700">Riwayat Audit Backup Cloud</p>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden text-xs">
                {backupLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="px-3 py-2 flex items-center justify-between bg-white">
                    <span className="capitalize text-slate-700">Backup {log.triggerType}</span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {log.totalMembers} anggota · {log.totalRegions} wilayah
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
