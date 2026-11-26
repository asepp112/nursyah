import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  CreditCard,
  Download,
  FilePlus,
  Lock,
  LogIn,
  Megaphone,
  Printer,
  Send,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AdminVaultDoc,
  BeltLevel,
  Broadcast,
  DocumentationItem,
  Letter,
  LetterType,
  Member,
  Region,
  ToolSection,
  VaultCategory,
} from '../types/org';
import { downloadKtaPdfBatch, downloadKtaPng, renderKtaToDataUrl } from '../lib/ktaGenerator';
import { downloadOfficialLetterPdf } from '../lib/letterPdf';
import { readFileAsBoundedDataUrl } from '../lib/mediaUtils';
import { KenanganGalleryPanel, QuickBroadcastPanel } from './CommunityHubView';

interface ToolsHubViewProps {
  activeTool: ToolSection;
  onSelectTool: (tool: ToolSection) => void;
  members: Member[];
  regions: Region[];
  beltLevels: BeltLevel[];
  broadcasts: Broadcast[];
  letters: Letter[];
  documentation: DocumentationItem[];
  vaultDocs: AdminVaultDoc[];
  isAdmin: boolean;
  isSignedIn: boolean;
  currentUid: string;
  currentUserName: string;
  preselectedKtaMemberId?: string;
  onRequestSignIn: () => void;
  onOpenAdminEmailsModal?: () => void;
  onSendBroadcast: (data: Omit<Broadcast, 'id' | 'pengirimUid' | 'orgCode' | 'createdAt'>) => Promise<void>;
  onDeleteBroadcast: (id: string) => Promise<void>;
  onSaveLetter: (data: Omit<Letter, 'id' | 'authorUid' | 'orgCode' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onDistributeLetter: (letter: Letter) => Promise<void>;
  onDeleteLetter: (id: string) => Promise<void>;
  onUploadDocumentationBatch: (
    items: Omit<DocumentationItem, 'id' | 'uploaderUid' | 'uploaderName' | 'orgCode' | 'createdAt'>[]
  ) => Promise<void>;
  onDeleteDocumentation: (id: string) => Promise<void>;
  onUploadVaultDoc: (
    data: Omit<AdminVaultDoc, 'id' | 'uploadedByUid' | 'uploadedByEmail' | 'createdAt'>
  ) => Promise<void>;
  onDeleteVaultDoc: (id: string) => Promise<void>;
}

export const ToolsHubView: React.FC<ToolsHubViewProps> = ({
  activeTool,
  onSelectTool,
  members,
  regions,
  beltLevels,
  broadcasts,
  letters,
  documentation,
  vaultDocs,
  isAdmin,
  isSignedIn,
  currentUid,
  currentUserName,
  preselectedKtaMemberId,
  onRequestSignIn,
  onOpenAdminEmailsModal,
  onSendBroadcast,
  onDeleteBroadcast,
  onSaveLetter,
  onDistributeLetter,
  onDeleteLetter,
  onUploadDocumentationBatch,
  onDeleteDocumentation,
  onUploadVaultDoc,
  onDeleteVaultDoc,
}) => {

  const rantingList = useMemo(
    () =>
      Array.from(
        new Set([
          ...regions.filter((r) => r.level === 'ranting').map((r) => r.name),
          ...members.map((m) => m.ranting),
        ])
      ).sort(),
    [regions, members]
  );

  // 1. KTA DIGITAL STATE
  const [selectedKtaMemberId, setSelectedKtaMemberId] = useState(
    preselectedKtaMemberId || members[0]?.id || ''
  );
  const [ktaPreviewUrl, setKtaPreviewUrl] = useState<string>('');
  const [ktaRendering, setKtaRendering] = useState(false);
  const [batchRanting, setBatchRanting] = useState('');
  const [batchExporting, setBatchExporting] = useState(false);

  useEffect(() => {
    if (preselectedKtaMemberId) {
      setSelectedKtaMemberId(preselectedKtaMemberId);
    } else if (!selectedKtaMemberId && members[0]?.id) {
      setSelectedKtaMemberId(members[0].id);
    }
  }, [preselectedKtaMemberId, members, selectedKtaMemberId]);

  const selectedKtaMember = useMemo(
    () => members.find((m) => m.id === selectedKtaMemberId) || members[0] || null,
    [members, selectedKtaMemberId]
  );

  const handleGeneratePreview = async () => {
    if (!selectedKtaMember) return;
    setKtaRendering(true);
    try {
      const url = await renderKtaToDataUrl(selectedKtaMember);
      setKtaPreviewUrl(url);
    } finally {
      setKtaRendering(false);
    }
  };

  useEffect(() => {
    if (activeTool === 'kta' && selectedKtaMember) {
      handleGeneratePreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, selectedKtaMember?.id]);

  const batchMembers = useMemo(() => {
    if (!batchRanting) return members;
    return members.filter((m) => m.ranting === batchRanting);
  }, [members, batchRanting]);

  // 3. LETTERS STATE
  const [letNomor, setLetNomor] = useState(`001/PPSI-NRS/${new Date().getFullYear()}`);
  const [letJenis, setLetJenis] = useState<LetterType>('Surat Undangan');
  const [letPerihal, setLetPerihal] = useState('');
  const [letTargetRanting, setLetTargetRanting] = useState('');
  const [letTargetWilayah, setLetTargetWilayah] = useState('Seluruh Pengurus Cabang & Ranting');
  const [letTanggal, setLetTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [letPenandatangan, setLetPenandatangan] = useState(currentUserName);
  const [letIsi, setLetIsi] = useState('');
  const [letAttachmentName, setLetAttachmentName] = useState('');
  const [letAttachmentData, setLetAttachmentData] = useState('');
  const [letSaving, setLetSaving] = useState(false);
  const [letError, setLetError] = useState('');

  const handleLetterAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLetError('');
    try {
      const dataUrl = await readFileAsBoundedDataUrl(file, 360000);
      setLetAttachmentName(file.name);
      setLetAttachmentData(dataUrl);
    } catch (err) {
      setLetError(err instanceof Error ? err.message : 'Gagal membaca lampiran surat.');
    }
  };

  const handleCreateLetter = async (e: React.FormEvent, status: 'Draft' | 'Terkirim') => {
    e.preventDefault();
    setLetError('');
    if (!isSignedIn) {
      onRequestSignIn();
      return;
    }
    const cleanNomor = letNomor.trim();
    const cleanPerihal = letPerihal.trim();
    const cleanIsi = letIsi.trim();
    const cleanWilayah = letTargetWilayah.trim();
    const cleanPenandatangan = (letPenandatangan.trim() || currentUserName || 'Pengurus').slice(0, 120);

    if (cleanNomor.length < 3 || cleanNomor.length > 80) {
      setLetError('Nomor surat harus 3 sampai 80 karakter.');
      return;
    }
    if (cleanPerihal.length < 3 || cleanPerihal.length > 180) {
      setLetError('Perihal surat minimal 3 karakter.');
      return;
    }
    if (cleanIsi.length < 5 || cleanIsi.length > 5000) {
      setLetError('Isi surat minimal 5 karakter.');
      return;
    }
    if (cleanWilayah.length < 2) {
      setLetError('Alamat / Wilayah tujuan minimal 2 karakter.');
      return;
    }

    setLetSaving(true);
    try {
      await onSaveLetter({
        nomorSurat: cleanNomor,
        jenisSurat: letJenis,
        perihal: cleanPerihal,
        isiSurat: cleanIsi,
        targetWilayah: cleanWilayah.slice(0, 200),
        ...(letTargetRanting ? { targetRanting: letTargetRanting.slice(0, 120) } : {}),
        tanggalSurat: letTanggal || new Date().toISOString().slice(0, 10),
        penandatangan: cleanPenandatangan.length >= 2 ? cleanPenandatangan : 'Pengurus',
        ...(letAttachmentName ? { lampiranNama: letAttachmentName.slice(0, 160) } : {}),
        ...(letAttachmentData ? { lampiranDataUrl: letAttachmentData } : {}),
        statusDistribusi: status,
      });
      setLetPerihal('');
      setLetIsi('');
      setLetAttachmentName('');
      setLetAttachmentData('');
    } catch (err) {
      setLetError(err instanceof Error ? err.message : 'Gagal menyimpan surat resmi.');
    } finally {
      setLetSaving(false);
    }
  };

  // 5. ADMIN VAULT STATE
  const [vaultJudul, setVaultJudul] = useState('');
  const [vaultKategori, setVaultKategori] = useState<VaultCategory>('Legalitas & AD/ART');
  const [vaultNomor, setVaultNomor] = useState('');
  const [vaultKet, setVaultKet] = useState('');
  const [vaultFileName, setVaultFileName] = useState('');
  const [vaultFileType, setVaultFileType] = useState('');
  const [vaultFileData, setVaultFileData] = useState('');
  const [vaultSaving, setVaultSaving] = useState(false);
  const [vaultError, setVaultError] = useState('');

  const handleVaultFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVaultError('');
    try {
      const dataUrl = await readFileAsBoundedDataUrl(file, 420000);
      setVaultFileName(file.name);
      setVaultFileType(file.type || 'application/octet-stream');
      setVaultFileData(dataUrl);
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : 'Gagal membaca dokumen brankas.');
    }
  };

  const handleSaveVault = async (e: React.FormEvent) => {
    e.preventDefault();
    setVaultError('');
    if (!vaultFileData) {
      setVaultError('Pilih berkas dokumen penting terlebih dahulu.');
      return;
    }
    if (vaultJudul.trim().length < 3) {
      setVaultError('Judul dokumen minimal 3 karakter.');
      return;
    }
    setVaultSaving(true);
    try {
      await onUploadVaultDoc({
        judul: vaultJudul.trim().slice(0, 160),
        kategori: vaultKategori,
        ...(vaultNomor.trim() ? { nomorDokumen: vaultNomor.trim().slice(0, 80) } : {}),
        ...(vaultKet.trim() ? { keterangan: vaultKet.trim().slice(0, 1000) } : {}),
        fileName: vaultFileName.slice(0, 160),
        fileType: vaultFileType.slice(0, 80),
        fileDataUrl: vaultFileData,
      });
      setVaultJudul('');
      setVaultNomor('');
      setVaultKet('');
      setVaultFileName('');
      setVaultFileType('');
      setVaultFileData('');
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : 'Gagal menyimpan dokumen ke brankas.');
    } finally {
      setVaultSaving(false);
    }
  };

  const toolButtons: { id: ToolSection; label: string; sub: string; icon: React.ReactNode }[] = [
    {
      id: 'kta',
      label: 'Cetak KTA Digital',
      sub: 'Buat, Pratinjau & Cetak Massal',
      icon: <CreditCard className="w-4 h-4" />,
    },
    {
      id: 'broadcast',
      label: 'Broadcast Informasi',
      sub: 'Blast 1-Klik & Teruskan WA',
      icon: <Megaphone className="w-4 h-4" />,
    },
    {
      id: 'letters',
      label: 'Persuratan & SK',
      sub: 'Buat, Kirim & Unduh PDF',
      icon: <FilePlus className="w-4 h-4" />,
    },
    {
      id: 'docs',
      label: 'Upload Dokumentasi',
      sub: 'Folder Kegiatan & Lokasi',
      icon: <Camera className="w-4 h-4" />,
    },
    {
      id: 'vault',
      label: 'Brankas Dokumen Admin',
      sub: isAdmin ? 'Akses Admin Terbuka' : 'Terkunci (Admin Pusat)',
      icon: <Lock className="w-4 h-4" />,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Alat &amp; Surat</h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Cetak KTA digital, kirim pengumuman, buat surat resmi PDF, atau unggah dokumentasi.
        </p>
      </div>

      {/* Tool Selector Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {toolButtons.map((t) => {
          const active = activeTool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTool(t.id)}
              className={`p-4 text-left rounded-xl border transition-colors cursor-pointer ${
                active
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className={active ? 'text-amber-400' : 'text-red-700'}>{t.icon}</span>
              </div>
              <p className="text-sm font-semibold truncate">{t.label}</p>
              <p className={`text-xs mt-0.5 truncate ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                {t.sub}
              </p>
            </button>
          );
        })}
      </div>

      {/* TOOL 1: ALAT CETAK KTA DIGITAL */}
      {activeTool === 'kta' && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">Alat Cetak KTA Digital</h2>
              <p className="text-xs text-slate-500 mt-1">
                Mengambil data profil otomatis (Nama, NIA, Alamat Ranting, Sabuk/Strip saat ini, Foto, dan QR Code verifikasi).
              </p>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700">Pilih Anggota</label>
              <select
                value={selectedKtaMember?.id || ''}
                onChange={(e) => setSelectedKtaMemberId(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nia} — {m.namaLengkap} ({m.ranting})
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={!selectedKtaMember || ktaRendering}
                  onClick={handleGeneratePreview}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Buat & Pratinjau KTA</span>
                </button>

                <button
                  type="button"
                  disabled={!selectedKtaMember}
                  onClick={() => selectedKtaMember && downloadKtaPng(selectedKtaMember)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-red-700 text-white rounded-lg hover:bg-red-800 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh KTA (Gambar PNG)</span>
                </button>

                <button
                  type="button"
                  disabled={!selectedKtaMember}
                  onClick={() =>
                    selectedKtaMember &&
                    downloadKtaPdfBatch([selectedKtaMember], selectedKtaMember.nia)
                  }
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-white text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                >
                  <Printer className="w-4 h-4" />
                  <span>Unduh KTA (PDF)</span>
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Cetak Massal Per Ranting</h3>
              <p className="text-xs text-slate-500">
                Hasilkan berkas PDF siap cetak berisi seluruh kartu anggota pada ranting terpilih (8 kartu per lembar A4).
              </p>
              <select
                value={batchRanting}
                onChange={(e) => setBatchRanting(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">Semua Ranting ({members.length} anggota)</option>
                {rantingList.map((r) => (
                  <option key={r} value={r}>
                    {r} ({members.filter((m) => m.ranting === r).length} anggota)
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={batchMembers.length === 0 || batchExporting}
                onClick={async () => {
                  setBatchExporting(true);
                  try {
                    await downloadKtaPdfBatch(batchMembers, batchRanting || 'Semua_Ranting');
                  } finally {
                    setBatchExporting(false);
                  }
                }}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg cursor-pointer disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                <span>
                  {batchExporting
                    ? 'Menyusun PDF Massal...'
                    : `Cetak Massal Per Ranting (${batchMembers.length} KTA)`}
                </span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Pratinjau Kartu Tanda Anggota</h3>
              {selectedKtaMember && (
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {selectedKtaMember.nia}
                </span>
              )}
            </div>

            {ktaPreviewUrl ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-100 p-3">
                <img
                  src={ktaPreviewUrl}
                  alt="Pratinjau KTA Digital Aliran Nursyah"
                  className="w-full h-auto rounded-lg"
                />
              </div>
            ) : (
              <div className="h-64 border border-dashed border-slate-300 rounded-xl flex items-center justify-center text-sm text-slate-500">
                {members.length === 0
                  ? 'Tambahkan anggota terlebih dahulu untuk mencetak KTA.'
                  : 'Memuat pratinjau KTA...'}
              </div>
            )}
          </div>
        </section>
      )}

      {/* TOOL 2: ALAT BROADCAST INFORMASI (1-CLICK BLAST) */}
      {activeTool === 'broadcast' && (
        <QuickBroadcastPanel
          broadcasts={broadcasts}
          regions={regions}
          beltLevels={beltLevels}
          rantingList={rantingList}
          isAdmin={isAdmin}
          isSignedIn={isSignedIn}
          currentUid={currentUid}
          currentUserName={currentUserName}
          onRequestSignIn={onRequestSignIn}
          onSendBroadcast={onSendBroadcast}
          onDeleteBroadcast={onDeleteBroadcast}
        />
      )}

      {/* TOOL 3: PERSURATAN RESMI */}
      {activeTool === 'letters' && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Buat / Upload Surat Resmi</h2>
              <p className="text-xs text-slate-500 mt-1">
                Buat surat undangan, surat tugas, surat edaran, atau SK resmi dengan tujuan spesifik per alamat ranting/cabang.
              </p>
            </div>

            {!isSignedIn && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-amber-900">
                  Masuk Google 1-klik untuk menyimpan atau mengirim surat resmi.
                </p>
                <button
                  type="button"
                  onClick={onRequestSignIn}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Masuk Google</span>
                </button>
              </div>
            )}

            {letError && (
              <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
                {letError}
              </div>
            )}

            <form className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor Surat *</label>
                  <input
                    type="text"
                    required
                    value={letNomor}
                    onChange={(e) => setLetNomor(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis Surat *</label>
                  <select
                    value={letJenis}
                    onChange={(e) => setLetJenis(e.target.value as LetterType)}
                    className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm border border-slate-300 rounded-lg"
                  >
                    <option value="Surat Undangan">Surat Undangan</option>
                    <option value="Surat Tugas">Surat Tugas</option>
                    <option value="SK Resmi">SK Resmi</option>
                    <option value="Surat Edaran">Surat Edaran</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Perihal *</label>
                <input
                  type="text"
                  required
                  value={letPerihal}
                  onChange={(e) => setLetPerihal(e.target.value)}
                  placeholder="Undangan Musyawarah Cabang & UKT"
                  className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ranting Tujuan Spesifik
                  </label>
                  <select
                    value={letTargetRanting}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLetTargetRanting(val);
                      const found = regions.find((r) => r.level === 'ranting' && r.name === val);
                      if (found) {
                        setLetTargetWilayah(
                          found.alamatSekretariat ||
                            [found.kecamatanName, found.kabupatenName, found.provinsiName]
                              .filter(Boolean)
                              .join(', ')
                        );
                      }
                    }}
                    className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm border border-slate-300 rounded-lg"
                  >
                    <option value="">Semua Ranting</option>
                    {rantingList.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Surat *</label>
                  <input
                    type="date"
                    required
                    value={letTanggal}
                    onChange={(e) => setLetTanggal(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alamat / Wilayah Tujuan *
                </label>
                <input
                  type="text"
                  required
                  value={letTargetWilayah}
                  onChange={(e) => setLetTargetWilayah(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Isi Surat *</label>
                <textarea
                  required
                  rows={4}
                  value={letIsi}
                  onChange={(e) => setLetIsi(e.target.value)}
                  placeholder="Dengan hormat, bersama surat ini kami mengundang..."
                  className="w-full px-3 py-2.5 text-base sm:text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Penandatangan *</label>
                  <input
                    type="text"
                    required
                    value={letPenandatangan}
                    onChange={(e) => setLetPenandatangan(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Upload Scan Surat (Opsional)
                  </label>
                  <label className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg cursor-pointer">
                    <Upload className="w-4 h-4 text-slate-600" />
                    <span className="truncate">{letAttachmentName || 'Pilih PDF/Gambar'}</span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={handleLetterAttachment}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  disabled={letSaving || !letPerihal || !letIsi}
                  onClick={(e) => handleCreateLetter(e, 'Terkirim')}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-red-700 hover:bg-red-800 text-white rounded-lg cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>Kirim & Arsipkan Surat</span>
                </button>
                <button
                  type="button"
                  disabled={letSaving || !letPerihal || !letIsi}
                  onClick={(e) => handleCreateLetter(e, 'Draft')}
                  className="px-4 py-2.5 text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  Simpan Draft
                </button>
              </div>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">Arsip Persuratan & SK Resmi</h3>
            </div>
            {letters.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                Belum ada surat atau SK resmi yang dibuat.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {letters.map((ltr) => (
                  <div key={ltr.id} className="p-5 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono font-semibold text-slate-800">{ltr.nomorSurat}</span>
                          <span aria-hidden="true">·</span>
                          <span>{ltr.jenisSurat}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`font-semibold ${
                              ltr.statusDistribusi === 'Terkirim' ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {ltr.statusDistribusi}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 mt-1">{ltr.perihal}</h4>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Tujuan: {ltr.targetRanting ? `${ltr.targetRanting} — ` : ''}
                          {ltr.targetWilayah} · Tgl {ltr.tanggalSurat}
                        </p>
                      </div>
                      {(isAdmin || ltr.authorUid === currentUid) && (
                        <button
                          type="button"
                          onClick={() => onDeleteLetter(ltr.id)}
                          className="p-1.5 text-slate-400 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => downloadOfficialLetterPdf(ltr)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-lg cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Unduh Surat (PDF Resmi)</span>
                      </button>
                      {ltr.statusDistribusi === 'Draft' && (isAdmin || ltr.authorUid === currentUid) && (
                        <button
                          type="button"
                          onClick={() => onDistributeLetter(ltr)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-700 hover:bg-red-800 text-white rounded-lg cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Kirim Sekarang</span>
                        </button>
                      )}
                      {ltr.lampiranDataUrl && (
                        <a
                          href={ltr.lampiranDataUrl}
                          download={ltr.lampiranNama || 'lampiran-surat'}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Unduh Lampiran</span>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* TOOL 4: UPLOAD DOKUMENTASI KEGIATAN */}
      {activeTool === 'docs' && (
        <KenanganGalleryPanel
          documentation={documentation}
          regions={regions}
          rantingList={rantingList}
          isAdmin={isAdmin}
          isSignedIn={isSignedIn}
          currentUid={currentUid}
          onRequestSignIn={onRequestSignIn}
          onUploadDocumentationBatch={onUploadDocumentationBatch}
          onDeleteDocumentation={onDeleteDocumentation}
        />
      )}

      {/* TOOL 5: BRANKAS DOKUMEN ADMIN */}
      {activeTool === 'vault' && (
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          {!isAdmin ? (
            <div className="py-12 text-center max-w-md mx-auto space-y-3">
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mx-auto">
                <ShieldAlert className="w-6 h-6 text-red-700" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Brankas Dokumen Admin Terkunci</h2>
              <p className="text-sm text-slate-600">
                Penyimpanan dokumen penting organisasi (AD/ART, SK Pengurus Pusat, Legalitas, dan Arsip Keuangan) hanya dapat diakses oleh Admin Utama dan 3 Email Admin Premium terverifikasi.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Unggah Dokumen Penting ke Brankas Admin
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Dokumen terproteksi khusus Admin Utama &amp; 3 Email Admin Premium.
                    </p>
                  </div>
                  {onOpenAdminEmailsModal && (
                    <button
                      type="button"
                      onClick={onOpenAdminEmailsModal}
                      className="px-3 py-1.5 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg cursor-pointer"
                    >
                      Kelola 3 Email Admin
                    </button>
                  )}
                </div>

                {vaultError && (
                  <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
                    {vaultError}
                  </div>
                )}

                <form onSubmit={handleSaveVault} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Judul Dokumen *
                    </label>
                    <input
                      type="text"
                      required
                      value={vaultJudul}
                      onChange={(e) => setVaultJudul(e.target.value)}
                      placeholder="Akta Pendirian & AD/ART Aliran Nursyah"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori *</label>
                      <select
                        value={vaultKategori}
                        onChange={(e) => setVaultKategori(e.target.value as VaultCategory)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      >
                        <option value="Legalitas & AD/ART">Legalitas & AD/ART</option>
                        <option value="Keuangan Pusat">Keuangan Pusat</option>
                        <option value="SK Pengurus">SK Pengurus</option>
                        <option value="Arsip Rahasia">Arsip Rahasia</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor Dokumen</label>
                      <input
                        type="text"
                        value={vaultNomor}
                        onChange={(e) => setVaultNomor(e.target.value)}
                        placeholder="SK-01/PUSAT/2026"
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Keterangan</label>
                    <textarea
                      rows={2}
                      value={vaultKet}
                      onChange={(e) => setVaultKet(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Pilih Berkas (PDF / Gambar, Maks 400KB) *
                    </label>
                    <label className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg cursor-pointer">
                      <Upload className="w-4 h-4 text-slate-600" />
                      <span className="truncate">{vaultFileName || 'Unggah Dokumen Brankas'}</span>
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        onChange={handleVaultFile}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={vaultSaving}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-lg cursor-pointer disabled:opacity-60"
                  >
                    <Lock className="w-4 h-4" />
                    <span>{vaultSaving ? 'Menyimpan...' : 'Simpan ke Brankas Admin'}</span>
                  </button>
                </form>
              </div>

              <div className="lg:col-span-7 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Daftar Dokumen Tersimpan ({vaultDocs.length})
                </h3>
                {vaultDocs.length === 0 ? (
                  <div className="p-8 border border-dashed border-slate-300 rounded-xl text-center text-sm text-slate-500">
                    Brankas masih kosong. Unggah dokumen legalitas atau SK penting organisasi di sebelah kiri.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {vaultDocs.map((v) => (
                      <div key={v.id} className="p-4 flex items-center justify-between gap-4 bg-white">
                        <div className="min-w-0">
                          <p className="text-xs text-slate-500">
                            {v.kategori}
                            {v.nomorDokumen ? ` · ${v.nomorDokumen}` : ''}
                          </p>
                          <p className="text-sm font-bold text-slate-900 truncate">{v.judul}</p>
                          {v.keterangan && (
                            <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">{v.keterangan}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a
                            href={v.fileDataUrl}
                            download={v.fileName}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Unduh</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => onDeleteVaultDoc(v.id)}
                            className="p-1.5 text-slate-400 hover:text-red-700 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
