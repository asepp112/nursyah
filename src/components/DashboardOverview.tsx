import React from 'react';
import {
  Award,
  Database,
  FileText,
  ImagePlus,
  MapPin,
  Megaphone,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  Wrench,
} from 'lucide-react';
import { AppTab, BeltLevel, Broadcast, DocumentationItem, Letter, Member, Region, ToolSection } from '../types/org';
import { ORG_LOGO_PATH } from '../lib/firebase';
import { DEFAULT_BELT_LEVELS } from '../constants/beltsAndSeed';

interface DashboardOverviewProps {
  members: Member[];
  regions: Region[];
  beltLevels: BeltLevel[];
  broadcasts: Broadcast[];
  letters: Letter[];
  documentation: DocumentationItem[];
  isAdmin: boolean;
  seeding: boolean;
  onBootstrapData: () => void;
  onNavigateTab: (tab: AppTab) => void;
  onOpenSelfRegistration: () => void;
  onOpenAdminEmailsModal?: () => void;
  onOpenTool: (tool: ToolSection) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  members,
  regions,
  beltLevels,
  broadcasts,
  letters,
  documentation,
  isAdmin,
  seeding,
  onBootstrapData,
  onNavigateTab,
  onOpenSelfRegistration,
  onOpenAdminEmailsModal,
  onOpenTool,
}) => {
  const provinsiCount = React.useMemo(() => {
    const set = new Set<string>();
    regions.forEach((r) => {
      if (r.level === 'provinsi' && r.name.trim()) set.add(r.name.trim());
      if (r.provinsiName?.trim()) set.add(r.provinsiName.trim());
    });
    members.forEach((m) => {
      if (m.provinsi?.trim()) set.add(m.provinsi.trim());
    });
    return set.size;
  }, [regions, members]);

  const rantingCount = React.useMemo(() => {
    const set = new Set<string>();
    regions.forEach((r) => {
      if (r.level === 'ranting' && r.name.trim()) set.add(r.name.trim());
    });
    members.forEach((m) => {
      if (m.ranting?.trim()) set.add(m.ranting.trim());
    });
    return set.size;
  }, [regions, members]);

  const beltCount = beltLevels.length || DEFAULT_BELT_LEVELS.length;
  const activeCount = members.filter((m) => m.statusAktif === 'Aktif').length;

  const rantingStats = React.useMemo(() => {
    const counts = new Map<string, { ranting: string; wilayah: string; total: number }>();
    members.forEach((m) => {
      const key = `${m.ranting}__${m.kabupaten}`;
      const prev = counts.get(key);
      if (prev) {
        prev.total += 1;
      } else {
        counts.set(key, {
          ranting: m.ranting,
          wilayah: `${m.kecamatan} · ${m.kabupaten} · ${m.provinsi}`,
          total: 1,
        });
      }
    });
    return Array.from(counts.values()).sort((a, b) => b.total - a.total);
  }, [members]);

  return (
    <div className="space-y-6">
      {/* Clean Hero Welcome */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex items-start sm:items-center gap-4">
          <img
            src={ORG_LOGO_PATH}
            alt="Logo Aliran Nursyah PPSI"
            referrerPolicy="no-referrer"
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-contain border border-slate-200 bg-white p-1 shrink-0"
          />
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-semibold text-red-700">PPSI · Aliran Nursyah</p>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Perguruan Pencak Silat Aliran Nursyah
            </h1>
            <p className="text-sm text-slate-600 max-w-xl">
              Isi data anggota langsung tanpa login, cari anggota, bagikan foto kenangan, dan kirim pengumuman dalam satu tempat.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {isAdmin && (regions.length === 0 || beltLevels.length === 0) && (
            <button
              type="button"
              disabled={seeding}
              onClick={onBootstrapData}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <Database className="w-4 h-4" />
              <span>{seeding ? 'Memuat...' : 'Muat Data Awal'}</span>
            </button>
          )}
          {isAdmin && onOpenAdminEmailsModal && (
            <button
              type="button"
              onClick={onOpenAdminEmailsModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium bg-amber-50 text-amber-900 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              <ShieldCheck className="w-4 h-4 text-amber-700" />
              <span>3 Email Admin</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenSelfRegistration}
            className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] text-sm font-semibold bg-red-700 text-white rounded-lg hover:bg-red-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            <span>Isi Data Saya (Tanpa Login)</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('members')}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Search className="w-4 h-4" />
            <span>Cari Anggota</span>
          </button>
        </div>
      </section>

      {/* 3 Simple Shortcut Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <button
          type="button"
          onClick={onOpenSelfRegistration}
          className="p-4 bg-white hover:bg-red-50/40 border border-slate-200 hover:border-red-300 rounded-xl text-left transition-colors cursor-pointer space-y-1"
        >
          <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
            <UserPlus className="w-4 h-4 shrink-0" />
            <span>1. Isi Data Mandiri</span>
          </div>
          <p className="text-xs text-slate-600">
            Masukkan nama, alamat lengkap &amp; sabuk Anda sendiri langsung tanpa perlu izin akses.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('hub')}
          className="p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-left transition-colors cursor-pointer space-y-1"
        >
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <ImagePlus className="w-4 h-4 shrink-0 text-red-700" />
            <span>2. Kenangan &amp; Pengumuman</span>
          </div>
          <p className="text-xs text-slate-600">
            Upload foto kegiatan &amp; kirim pengumuman singkat ke seluruh anggota dalam satu tempat.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onOpenTool('kta')}
          className="p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-left transition-colors cursor-pointer space-y-1"
        >
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <Wrench className="w-4 h-4 shrink-0 text-slate-700" />
            <span>3. Cetak KTA &amp; Surat</span>
          </div>
          <p className="text-xs text-slate-600">
            Cetak KTA digital, buat surat resmi PDF, atau ekspor data Excel per wilayah.
          </p>
        </button>
      </section>

      {/* Compact Summary Numbers */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Anggota</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{members.length}</p>
          <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">{activeCount} aktif</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Ranting</span>
            <MapPin className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{rantingCount}</p>
          <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">{provinsiCount} provinsi</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Sabuk</span>
            <Award className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{beltCount}</p>
          <p className="text-xs text-slate-500 mt-0.5">Kuning Mas – Strip 17</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Arsip</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {letters.length + documentation.length}
          </p>
          <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
            {letters.length} surat · {documentation.length} foto
          </p>
        </div>
      </section>

      {/* Clean 2-Column Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 space-y-5">
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4">
              <h2 className="text-sm font-bold text-slate-900">Daftar Anggota Terbaru</h2>
              <button
                type="button"
                onClick={() => onNavigateTab('members')}
                className="text-xs font-semibold text-red-700 hover:underline whitespace-nowrap cursor-pointer"
              >
                Lihat Semua →
              </button>
            </div>

            {members.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Belum ada anggota. Klik <strong>Isi Data Saya</strong> di atas untuk memulai.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {members.slice(0, 6).map((m) => {
                  const fullAddress =
                    m.alamatLengkap ||
                    `${m.ranting}, Kec. ${m.kecamatan}, ${m.kabupaten}, ${m.provinsi}`;
                  return (
                    <div
                      key={m.id}
                      className="px-5 py-3 flex items-start justify-between gap-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {m.namaLengkap}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{fullAddress}</p>
                      </div>
                      <span className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded shrink-0">
                        {m.sabuk}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {rantingStats.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4">
                <h2 className="text-sm font-bold text-slate-900">Anggota per Ranting</h2>
                <button
                  type="button"
                  onClick={() => onNavigateTab('members')}
                  className="text-xs font-semibold text-red-700 hover:underline whitespace-nowrap cursor-pointer"
                >
                  Filter Wilayah →
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {rantingStats.slice(0, 5).map((item) => (
                  <div
                    key={`${item.ranting}-${item.wilayah}`}
                    className="px-5 py-3 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{item.ranting}</p>
                      <p className="text-xs text-slate-500 truncate">{item.wilayah}</p>
                    </div>
                    <span className="text-xs font-mono font-semibold text-slate-700 shrink-0 tabular-nums">
                      {item.total} orang
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Pengumuman Terbaru */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-red-700" />
              <h2 className="text-sm font-bold text-slate-900">Pengumuman Terbaru</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('hub')}
              className="text-xs font-semibold text-red-700 hover:underline whitespace-nowrap cursor-pointer"
            >
              Kirim Info →
            </button>
          </div>
          {broadcasts.length === 0 ? (
            <div className="p-6 text-sm text-slate-500 text-center">
              Belum ada pengumuman. Buka menu <strong>Kenangan &amp; Info</strong> untuk mengirim kabar.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {broadcasts.slice(0, 5).map((b) => (
                <div key={b.id} className="px-5 py-3.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 truncate">{b.judul}</p>
                    <span
                      className={`text-xs font-medium shrink-0 ${
                        b.prioritas === 'Mendesak'
                          ? 'text-red-700'
                          : b.prioritas === 'Penting'
                          ? 'text-amber-700'
                          : 'text-slate-500'
                      }`}
                    >
                      {b.prioritas}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2">{b.isiPesan}</p>
                  <p className="text-[11px] text-slate-400">Oleh {b.pengirimNama}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
