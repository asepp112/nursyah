import React, { useMemo, useState } from 'react';
import {
  Camera,
  Check,
  Copy,
  FolderOpen,
  ImagePlus,
  LogIn,
  MapPin,
  Megaphone,
  Search,
  Send,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import {
  BeltLevel,
  Broadcast,
  DocCategory,
  DocumentationItem,
  Region,
} from '../types/org';
import { DEFAULT_BELT_LEVELS } from '../constants/beltsAndSeed';
import { compressImageToDataUrl, readFileAsBoundedDataUrl } from '../lib/mediaUtils';
import { STATIC_INDO_PROVINCES } from '../lib/indonesiaRegions';

export const DOC_CATEGORIES: DocCategory[] = [
  'Kenangan',
  'Acara/Kegiatan',
  'Ujian Kenaikan Tingkat',
  'Dokumentasi Lainnya',
];

interface QuickBroadcastPanelProps {
  broadcasts: Broadcast[];
  regions: Region[];
  beltLevels: BeltLevel[];
  rantingList: string[];
  isAdmin: boolean;
  isSignedIn: boolean;
  currentUid: string;
  currentUserName: string;
  onRequestSignIn: () => void;
  onSendBroadcast: (
    data: Omit<Broadcast, 'id' | 'pengirimUid' | 'orgCode' | 'createdAt'>
  ) => Promise<void>;
  onDeleteBroadcast: (id: string) => Promise<void>;
}

export const QuickBroadcastPanel: React.FC<QuickBroadcastPanelProps> = ({
  broadcasts,
  regions,
  beltLevels,
  rantingList,
  isAdmin,
  isSignedIn,
  currentUid,
  currentUserName,
  onRequestSignIn,
  onSendBroadcast,
  onDeleteBroadcast,
}) => {
  const orderedBelts = useMemo(() => {
    const src = beltLevels.length > 0 ? beltLevels : (DEFAULT_BELT_LEVELS as BeltLevel[]);
    return [...src].sort((a, b) => a.order - b.order);
  }, [beltLevels]);

  const [blastJudul, setBlastJudul] = useState('');
  const [blastPesan, setBlastPesan] = useState('');
  const [blastPengirim, setBlastPengirim] = useState(currentUserName || '');
  const [blastPrioritas, setBlastPrioritas] = useState<'Normal' | 'Penting' | 'Mendesak'>('Normal');
  const [blastScope, setBlastScope] = useState<'Semua' | 'Wilayah' | 'Sabuk'>('Semua');
  const [blastProv, setBlastProv] = useState('');
  const [blastKab, setBlastKab] = useState('');
  const [blastKec, setBlastKec] = useState('');
  const [blastRanting, setBlastRanting] = useState('');
  const [blastSabuk, setBlastSabuk] = useState('');
  const [showAdvancedTarget, setShowAdvancedTarget] = useState(false);
  const [blastSending, setBlastSending] = useState(false);
  const [blastError, setBlastError] = useState('');
  const [lastSentWaText, setLastSentWaText] = useState('');
  const [copiedId, setCopiedId] = useState('');

  const handleSendBlast = async (e: React.FormEvent) => {
    e.preventDefault();
    setBlastError('');
    if (!isSignedIn) {
      onRequestSignIn();
      return;
    }

    const cleanPesan = blastPesan.trim();
    if (cleanPesan.length < 5) {
      setBlastError('Tulis isi pesan singkat minimal 5 karakter.');
      return;
    }

    const cleanPreview = cleanPesan.replace(/\s+/g, ' ').trim().slice(0, 60);
    const derivedJudul =
      blastJudul.trim().length >= 3
        ? blastJudul.trim().slice(0, 150)
        : cleanPreview.length >= 3
        ? cleanPreview
        : cleanPreview.padEnd(3, '.');

    const rawSender = (blastPengirim.trim() || currentUserName || 'Anggota Nursyah').slice(0, 120);
    const senderName = rawSender.length >= 2 ? rawSender : 'Anggota';

    setBlastSending(true);
    try {
      await onSendBroadcast({
        judul: derivedJudul,
        isiPesan: cleanPesan.slice(0, 3000),
        pengirimNama: senderName,
        targetScope: blastScope,
        ...(blastScope === 'Wilayah' && blastProv.trim() ? { targetProvinsi: blastProv.trim().slice(0, 120) } : {}),
        ...(blastScope === 'Wilayah' && blastKab.trim() ? { targetKabupaten: blastKab.trim().slice(0, 120) } : {}),
        ...(blastScope === 'Wilayah' && blastKec.trim() ? { targetKecamatan: blastKec.trim().slice(0, 120) } : {}),
        ...(blastScope === 'Wilayah' && blastRanting.trim() ? { targetRanting: blastRanting.trim().slice(0, 120) } : {}),
        ...(blastScope === 'Sabuk' && blastSabuk.trim() ? { targetSabuk: blastSabuk.trim().slice(0, 60) } : {}),
        prioritas: blastPrioritas,
      });

      const targetLabel =
        blastScope === 'Semua'
          ? 'Semua Anggota Aliran Nursyah'
          : blastScope === 'Sabuk'
          ? `Khusus ${blastSabuk || 'Tingkatan Sabuk'}`
          : [blastRanting, blastKec, blastKab, blastProv].filter(Boolean).join(', ') ||
            'Wilayah Terpilih';

      const formattedWa = `*INFO ALIRAN NURSYAH (PPSI)*\nTarget: ${targetLabel}\n${
        blastJudul.trim() ? `*${blastJudul.trim()}*\n` : ''
      }\n${cleanPesan}\n\n_Pengirim: ${senderName}_`;

      setLastSentWaText(formattedWa);
      setBlastJudul('');
      setBlastPesan('');
    } catch (err) {
      setBlastError(err instanceof Error ? err.message : 'Gagal mengirim informasi ke semua anggota.');
    } finally {
      setBlastSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Form Kirim Info Singkat */}
      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Kirim Info Singkat ke Semua Anggota
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Siapa saja bisa langsung menulis kabar latihan, pengumuman kegiatan, atau info penting ke seluruh anggota dalam satu tempat.
          </p>
        </div>

        {!isSignedIn && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-amber-900">
              Masuk Google 1-klik agar pesan dapat dikirim ke semua anggota.
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

        {blastError && (
          <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
            {blastError}
          </div>
        )}

        <form onSubmit={handleSendBlast} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tulis Informasi Singkat *
            </label>
            <textarea
              required
              rows={3}
              value={blastPesan}
              onChange={(e) => setBlastPesan(e.target.value)}
              placeholder="Contoh: Info latihan malam ini jam 19.30 di sekretariat, harap bawa seragam lengkap."
              className="w-full px-3.5 py-2.5 text-base sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Judul Singkat (Opsional)
              </label>
              <input
                type="text"
                value={blastJudul}
                onChange={(e) => setBlastJudul(e.target.value)}
                placeholder="Otomatis dari pesan jika kosong"
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Pengirim
              </label>
              <input
                type="text"
                value={blastPengirim}
                onChange={(e) => setBlastPengirim(e.target.value)}
                placeholder={currentUserName || 'Nama Anda'}
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* Toggle Opsi Target Lanjutan (default langsung Semua Anggota) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvancedTarget((v) => !v)}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 underline cursor-pointer"
            >
              {showAdvancedTarget
                ? 'Sembunyikan filter target & prioritas (Default: Semua Anggota)'
                : 'Atur target wilayah / sabuk atau prioritas khusus (Opsional)'}
            </button>
          </div>

          {showAdvancedTarget && (
            <div className="space-y-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Penerima
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Semua', 'Wilayah', 'Sabuk'] as const).map((sc) => (
                    <button
                      key={sc}
                      type="button"
                      onClick={() => setBlastScope(sc)}
                      className={`min-h-[40px] py-2 px-2 text-xs font-medium rounded-lg border cursor-pointer ${
                        blastScope === sc
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {sc === 'Semua'
                        ? 'Semua Anggota'
                        : sc === 'Wilayah'
                        ? 'Per Alamat'
                        : 'Per Sabuk'}
                    </button>
                  ))}
                </div>
              </div>

              {blastScope === 'Wilayah' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={blastRanting}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBlastRanting(val);
                      const found = regions.find((r) => r.level === 'ranting' && r.name === val);
                      if (found) {
                        if (found.provinsiName) setBlastProv(found.provinsiName);
                        if (found.kabupatenName) setBlastKab(found.kabupatenName);
                        if (found.kecamatanName) setBlastKec(found.kecamatanName);
                      }
                    }}
                    className="sm:col-span-2 min-h-[40px] px-3 py-2 text-base sm:text-xs bg-white border border-slate-300 rounded-md"
                  >
                    <option value="">Semua Ranting</option>
                    {rantingList.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={blastProv}
                    onChange={(e) => setBlastProv(e.target.value)}
                    placeholder="Provinsi"
                    className="min-h-[40px] px-3 py-2 text-base sm:text-xs bg-white border border-slate-300 rounded-md"
                  />
                  <input
                    type="text"
                    value={blastKab}
                    onChange={(e) => setBlastKab(e.target.value)}
                    placeholder="Kabupaten/Kota"
                    className="min-h-[40px] px-3 py-2 text-base sm:text-xs bg-white border border-slate-300 rounded-md"
                  />
                </div>
              )}

              {blastScope === 'Sabuk' && (
                <select
                  value={blastSabuk}
                  onChange={(e) => setBlastSabuk(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg"
                >
                  <option value="">-- Pilih Tingkatan Sabuk --</option>
                  {orderedBelts.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Prioritas</label>
                <select
                  value={blastPrioritas}
                  onChange={(e) =>
                    setBlastPrioritas(e.target.value as 'Normal' | 'Penting' | 'Mendesak')
                  }
                  className="w-full min-h-[40px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg"
                >
                  <option value="Normal">Normal</option>
                  <option value="Penting">Penting</option>
                  <option value="Mendesak">Mendesak</option>
                </select>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={blastSending}
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-red-700 hover:bg-red-800 text-white rounded-lg cursor-pointer disabled:opacity-60"
          >
            <Send className="w-4 h-4" />
            <span>
              {blastSending
                ? 'Mengirim...'
                : blastScope === 'Semua'
                ? 'Kirim ke Semua Anggota (1-Klik)'
                : 'Kirim Informasi Sekarang (1-Klik)'}
            </span>
          </button>
        </form>

        {lastSentWaText && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2.5">
            <p className="text-xs font-semibold text-emerald-900">
              Informasi berhasil dikirim ke semua anggota!
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(lastSentWaText)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Teruskan ke Grup WhatsApp</span>
              </a>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(lastSentWaText)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-emerald-300 text-emerald-900 rounded-lg cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Teks</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Feed Informasi Semua Anggota */}
      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-red-700" />
            <h3 className="text-base font-semibold text-slate-900">
              Papan Informasi Anggota ({broadcasts.length})
            </h3>
          </div>
          <span className="text-xs text-slate-500">Terlihat oleh semua orang</span>
        </div>

        {broadcasts.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Belum ada informasi yang dikirim. Jadilah yang pertama menulis pengumuman singkat di sebelah kiri.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {broadcasts.map((b) => {
              const targetLabel =
                b.targetScope === 'Semua'
                  ? 'Semua Anggota'
                  : [b.targetRanting, b.targetKecamatan, b.targetKabupaten, b.targetProvinsi, b.targetSabuk]
                      .filter(Boolean)
                      .join(', ') || b.targetScope;

              const waText = `*${b.judul}*\nTarget: ${targetLabel}\n\n${b.isiPesan}\n\n_Pengirim: ${b.pengirimNama}_`;

              return (
                <article key={b.id} className="p-5 space-y-2.5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span
                          className={`font-semibold ${
                            b.prioritas === 'Mendesak'
                              ? 'text-red-700'
                              : b.prioritas === 'Penting'
                              ? 'text-amber-700'
                              : 'text-slate-600'
                          }`}
                        >
                          {b.prioritas}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Kepada: {targetLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>Oleh {b.pengirimNama}</span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 mt-0.5">{b.judul}</h4>
                    </div>
                    {(isAdmin || (isSignedIn && b.pengirimUid === currentUid)) && (
                      <button
                        type="button"
                        onClick={() => onDeleteBroadcast(b.id)}
                        className="p-1.5 text-slate-400 hover:text-red-700 cursor-pointer shrink-0"
                        title="Hapus pesan"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-line">{b.isiPesan}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(waText)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Teruskan WA</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(waText);
                        setCopiedId(b.id);
                        setTimeout(() => setCopiedId(''), 1500);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg cursor-pointer"
                    >
                      {copiedId === b.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedId === b.id ? 'Tersalin' : 'Salin'}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

interface SelectedMediaDraft {
  id: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  name: string;
}

interface KenanganGalleryPanelProps {
  documentation: DocumentationItem[];
  regions: Region[];
  rantingList: string[];
  isAdmin: boolean;
  isSignedIn: boolean;
  currentUid: string;
  onRequestSignIn: () => void;
  onUploadDocumentationBatch: (
    items: Omit<DocumentationItem, 'id' | 'uploaderUid' | 'uploaderName' | 'orgCode' | 'createdAt'>[]
  ) => Promise<void>;
  onDeleteDocumentation: (id: string) => Promise<void>;
}

export const KenanganGalleryPanel: React.FC<KenanganGalleryPanelProps> = ({
  documentation,
  regions,
  rantingList,
  isAdmin,
  isSignedIn,
  currentUid,
  onRequestSignIn,
  onUploadDocumentationBatch,
  onDeleteDocumentation,
}) => {
  const [docFolder, setDocFolder] = useState<DocCategory | 'Semua'>('Semua');
  const [docSearch, setDocSearch] = useState('');
  const [docJudul, setDocJudul] = useState('');
  const [docKategori, setDocKategori] = useState<DocCategory>('Kenangan');
  const [docTanggal, setDocTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [docProv, setDocProv] = useState('Jawa Barat');
  const [docRanting, setDocRanting] = useState('');
  const [docLokasi, setDocLokasi] = useState('');
  const [docDeskripsi, setDocDeskripsi] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState<SelectedMediaDraft[]>([]);
  const [videoLink, setVideoLink] = useState('');
  const [docSaving, setDocSaving] = useState(false);
  const [docError, setDocError] = useState('');
  const [lightboxItem, setLightboxItem] = useState<DocumentationItem | null>(null);

  const handleFilesSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setDocError('');

    const processed: SelectedMediaDraft[] = [];
    for (const file of files.slice(0, 12)) {
      try {
        if (file.type.startsWith('image/')) {
          const compressed = await compressImageToDataUrl(file, 960, 0.74, 360000);
          processed.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            mediaType: 'image',
            mediaUrl: compressed,
            name: file.name,
          });
        } else {
          const bounded = await readFileAsBoundedDataUrl(file, 360000);
          processed.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            mediaType: 'video',
            mediaUrl: bounded,
            name: file.name,
          });
        }
      } catch (err) {
        setDocError(
          err instanceof Error
            ? err.message
            : `Berkas "${file.name}" terlalu besar. Gunakan foto atau tautan video.`
        );
      }
    }

    setSelectedPhotos((prev) => [...prev, ...processed].slice(0, 12));
    e.target.value = '';
  };

  const handleSubmitDocs = async (e: React.FormEvent) => {
    e.preventDefault();
    setDocError('');
    if (!isSignedIn) {
      onRequestSignIn();
      return;
    }

    const mediaToUpload: { mediaType: 'image' | 'video'; mediaUrl: string }[] = [
      ...selectedPhotos.map((p) => ({ mediaType: p.mediaType, mediaUrl: p.mediaUrl })),
      ...(videoLink.trim() ? [{ mediaType: 'video' as const, mediaUrl: videoLink.trim() }] : []),
    ];

    if (mediaToUpload.length === 0) {
      setDocError('Pilih minimal satu foto kenangan/dokumentasi atau masukkan tautan video.');
      return;
    }

    const rawJudul = docJudul.trim() || `Kenangan ${docKategori}`;
    const baseJudul = (rawJudul.length >= 3 ? rawJudul : rawJudul.padEnd(3, '.')).slice(0, 140);
    const rawProv = docProv.trim() || 'Indonesia';
    const cleanProv = (rawProv.length >= 2 ? rawProv : 'Indonesia').slice(0, 120);
    const rawLokasi = docLokasi.trim() || docRanting.trim() || cleanProv;
    const cleanLokasi = (rawLokasi.length >= 2 ? rawLokasi : cleanProv).slice(0, 200);

    setDocSaving(true);
    try {
      const batchItems = mediaToUpload.map((m, idx) => ({
        judul:
          mediaToUpload.length > 1
            ? `${baseJudul} (${idx + 1}/${mediaToUpload.length})`.slice(0, 150)
            : baseJudul,
        kategori: docKategori,
        deskripsi: docDeskripsi.trim().slice(0, 800),
        tanggalKegiatan: docTanggal || new Date().toISOString().slice(0, 10),
        provinsi: cleanProv,
        ...(docRanting ? { ranting: docRanting.slice(0, 120) } : {}),
        lokasiDetail: cleanLokasi,
        mediaType: m.mediaType,
        mediaUrl: m.mediaUrl,
      }));

      await onUploadDocumentationBatch(batchItems);
      setDocJudul('');
      setDocLokasi('');
      setDocDeskripsi('');
      setSelectedPhotos([]);
      setVideoLink('');
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Gagal mengunggah foto kenangan/dokumentasi.');
    } finally {
      setDocSaving(false);
    }
  };

  const filteredDocs = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    return documentation.filter((d) => {
      if (docFolder !== 'Semua' && d.kategori !== docFolder) return false;
      if (q) {
        const text = `${d.judul} ${d.lokasiDetail} ${d.ranting || ''} ${d.provinsi} ${
          d.uploaderName
        } ${d.deskripsi || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [documentation, docFolder, docSearch]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Multi-Photo Upload Form */}
      <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Tambah Foto Kenangan & Dokumentasi
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Semua orang dapat mengunggah banyak foto kenangan, latihan, atau ujian sekaligus dalam satu tempat.
          </p>
        </div>

        {!isSignedIn && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-amber-900">
              Masuk Google 1-klik untuk mengunggah foto ke galeri bersama.
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

        {docError && (
          <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
            {docError}
          </div>
        )}

        <form onSubmit={handleSubmitDocs} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Pilih Banyak Foto Sekaligus (Maks 12 Foto) *
            </label>
            <label className="flex flex-col items-center justify-center gap-1.5 min-h-[88px] px-4 py-3 text-xs font-medium bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 rounded-lg cursor-pointer text-center">
              <ImagePlus className="w-5 h-5 text-red-700" />
              <span className="text-slate-800 font-semibold">
                {selectedPhotos.length > 0
                  ? `${selectedPhotos.length} media terpilih · Klik untuk tambah lagi`
                  : 'Ketuk untuk pilih 1 atau banyak foto kenangan'}
              </span>
              <span className="text-[11px] text-slate-500">
                Mendukung pilihan banyak foto dari galeri HP maupun komputer
              </span>
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={handleFilesSelect}
                className="hidden"
              />
            </label>

            {selectedPhotos.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-2.5">
                {selectedPhotos.map((item) => (
                  <div
                    key={item.id}
                    className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-100"
                  >
                    {item.mediaType === 'image' ? (
                      <img
                        src={item.mediaUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] font-mono bg-slate-900 text-white p-1 text-center">
                        VIDEO
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedPhotos((prev) => prev.filter((p) => p.id !== item.id))
                      }
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-900/80 text-white flex items-center justify-center cursor-pointer"
                      aria-label="Hapus foto pilihan"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Judul Momen / Kegiatan <span className="font-normal text-slate-400">(Opsional)</span>
            </label>
            <input
              type="text"
              value={docJudul}
              onChange={(e) => setDocJudul(e.target.value)}
              placeholder="Otomatis jika dikosongkan · mis. Latihan Gabungan"
              className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori *</label>
              <select
                value={docKategori}
                onChange={(e) => setDocKategori(e.target.value as DocCategory)}
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg"
              >
                {DOC_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal *</label>
              <input
                type="date"
                required
                value={docTanggal}
                onChange={(e) => setDocTanggal(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ranting / Wilayah
              </label>
              <select
                value={docRanting}
                onChange={(e) => {
                  const val = e.target.value;
                  setDocRanting(val);
                  const found = regions.find((r) => r.level === 'ranting' && r.name === val);
                  if (found) {
                    if (found.provinsiName) setDocProv(found.provinsiName);
                    if (!docLokasi && found.alamatSekretariat) setDocLokasi(found.alamatSekretariat);
                  }
                }}
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg"
              >
                <option value="">Umum / Semua Ranting</option>
                {rantingList.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Provinsi <span className="font-normal text-slate-400">(Opsional)</span>
              </label>
              <input
                type="text"
                list="hub-indo-prov-list"
                value={docProv}
                onChange={(e) => setDocProv(e.target.value)}
                placeholder="Pilih atau ketik provinsi di Indonesia"
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm border border-slate-300 rounded-lg"
              />
              <datalist id="hub-indo-prov-list">
                {STATIC_INDO_PROVINCES.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Lokasi / Alamat Acara <span className="font-normal text-slate-400">(Opsional)</span>
            </label>
            <input
              type="text"
              value={docLokasi}
              onChange={(e) => setDocLokasi(e.target.value)}
              placeholder="GOR / Lapangan / Sekretariat Ranting"
              className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tautan Video (Opsional)
            </label>
            <input
              type="url"
              value={videoLink}
              onChange={(e) => setVideoLink(e.target.value)}
              placeholder="https://youtube.com/... atau link Google Drive"
              className="w-full min-h-[40px] px-3 py-2 text-base sm:text-xs border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Cerita / Keterangan (Opsional)
            </label>
            <textarea
              rows={2}
              value={docDeskripsi}
              onChange={(e) => setDocDeskripsi(e.target.value)}
              placeholder="Catatan singkat tentang foto atau momen ini..."
              className="w-full px-3 py-2 text-base sm:text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <button
            type="submit"
            disabled={docSaving}
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-red-700 hover:bg-red-800 text-white rounded-lg cursor-pointer disabled:opacity-60"
          >
            <Camera className="w-4 h-4" />
            <span>
              {docSaving
                ? 'Mengunggah...'
                : selectedPhotos.length > 1
                ? `Unggah ${selectedPhotos.length} Foto Sekaligus`
                : 'Simpan ke Galeri Bersama'}
            </span>
          </button>
        </form>
      </div>

      {/* Unified Gallery View */}
      <div className="lg:col-span-8 space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(['Semua', ...DOC_CATEGORIES] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setDocFolder(cat)}
                  className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    docFolder === cat
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5 inline mr-1.5" />
                  {cat}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                placeholder="Cari judul / lokasi..."
                className="w-full min-h-[40px] pl-9 pr-3 py-1.5 text-base sm:text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </div>
        </div>

        {filteredDocs.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
            Belum ada foto atau dokumentasi pada kategori ini. Tambahkan foto kenangan di formulir sebelah kiri.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredDocs.map((item) => (
              <article
                key={item.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col"
              >
                {item.mediaType === 'image' ? (
                  <button
                    type="button"
                    onClick={() => setLightboxItem(item)}
                    className="block w-full text-left cursor-pointer focus:outline-none"
                  >
                    <img
                      src={item.mediaUrl}
                      alt={item.judul}
                      referrerPolicy="no-referrer"
                      className="w-full h-52 object-cover bg-slate-100 hover:opacity-95 transition-opacity"
                    />
                  </button>
                ) : (
                  <div className="w-full h-52 bg-slate-900 text-white flex flex-col items-center justify-center p-4 text-center gap-2">
                    <span className="text-xs font-mono text-amber-400">VIDEO DOKUMENTASI</span>
                    <a
                      href={item.mediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3.5 py-2 text-xs font-medium bg-red-700 hover:bg-red-800 rounded-lg"
                    >
                      Buka Video Kegiatan
                    </a>
                  </div>
                )}

                <div className="p-4 space-y-1.5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-red-700">{item.kategori}</span>
                      <span className="font-mono tabular-nums">{item.tanggalKegiatan}</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mt-1">{item.judul}</h3>
                    <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">
                        {item.lokasiDetail} · {item.ranting || item.provinsi}
                      </span>
                    </p>
                    {item.deskripsi && (
                      <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{item.deskripsi}</p>
                    )}
                  </div>

                  <div className="pt-2.5 mt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-400 truncate">Oleh: {item.uploaderName}</span>
                    {(isAdmin || (isSignedIn && item.uploaderUid === currentUid)) && (
                      <button
                        type="button"
                        onClick={() => onDeleteDocumentation(item.id)}
                        className="text-red-600 hover:text-red-800 font-medium cursor-pointer shrink-0"
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {lightboxItem && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-4"
          onClick={() => setLightboxItem(null)}
        >
          <div
            className="bg-white rounded-xl max-w-3xl w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{lightboxItem.judul}</p>
                <p className="text-xs text-slate-500 truncate">
                  {lightboxItem.kategori} · {lightboxItem.lokasiDetail} ·{' '}
                  {lightboxItem.tanggalKegiatan}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLightboxItem(null)}
                className="p-2 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-slate-900 flex items-center justify-center max-h-[75vh]">
              <img
                src={lightboxItem.mediaUrl}
                alt={lightboxItem.judul}
                referrerPolicy="no-referrer"
                className="max-h-[75vh] w-auto object-contain"
              />
            </div>
            {(lightboxItem.deskripsi || lightboxItem.uploaderName) && (
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-700 space-y-1">
                {lightboxItem.deskripsi && <p>{lightboxItem.deskripsi}</p>}
                <p className="text-slate-400">Diunggah oleh {lightboxItem.uploaderName}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface CommunityHubViewProps {
  broadcasts: Broadcast[];
  documentation: DocumentationItem[];
  regions: Region[];
  beltLevels: BeltLevel[];
  isAdmin: boolean;
  isSignedIn: boolean;
  currentUid: string;
  currentUserName: string;
  onRequestSignIn: () => void;
  onSendBroadcast: (
    data: Omit<Broadcast, 'id' | 'pengirimUid' | 'orgCode' | 'createdAt'>
  ) => Promise<void>;
  onDeleteBroadcast: (id: string) => Promise<void>;
  onUploadDocumentationBatch: (
    items: Omit<DocumentationItem, 'id' | 'uploaderUid' | 'uploaderName' | 'orgCode' | 'createdAt'>[]
  ) => Promise<void>;
  onDeleteDocumentation: (id: string) => Promise<void>;
}

export const CommunityHubView: React.FC<CommunityHubViewProps> = ({
  broadcasts,
  documentation,
  regions,
  beltLevels,
  isAdmin,
  isSignedIn,
  currentUid,
  currentUserName,
  onRequestSignIn,
  onSendBroadcast,
  onDeleteBroadcast,
  onUploadDocumentationBatch,
  onDeleteDocumentation,
}) => {
  const [hubMode, setHubMode] = useState<'all' | 'docs' | 'info'>('all');

  const rantingList = useMemo(
    () =>
      Array.from(new Set(regions.filter((r) => r.level === 'ranting').map((r) => r.name))).sort(),
    [regions]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Ruang Kenangan, Dokumentasi & Info Anggota
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Satu tempat terbuka bagi semua orang untuk menambahkan banyak foto kenangan dan mengirim informasi singkat ke semua anggota.
          </p>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 rounded-xl shrink-0">
          {(
            [
              ['all', 'Semua dalam 1 Tempat'],
              ['info', 'Kirim Info Singkat'],
              ['docs', 'Foto Kenangan'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setHubMode(id)}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
                hubMode === id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {(hubMode === 'all' || hubMode === 'info') && (
        <section className="space-y-3">
          {hubMode === 'all' && (
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-red-700" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Bagian 1 · Kirim Informasi Singkat ke Semua Anggota
              </h2>
            </div>
          )}
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
        </section>
      )}

      {(hubMode === 'all' || hubMode === 'docs') && (
        <section className="space-y-3 pt-2">
          {hubMode === 'all' && (
            <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
              <Camera className="w-4 h-4 text-red-700" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Bagian 2 · Galeri Foto Kenangan & Dokumentasi Lainnya
              </h2>
            </div>
          )}
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
        </section>
      )}
    </div>
  );
};
