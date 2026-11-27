import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpCircle,
  CheckCircle2,
  CreditCard,
  Edit3,
  Eye,
  FileCheck,
  Filter,
  Globe,
  Loader2,
  LogIn,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import {
  BeltLevel,
  BerkasChecklist,
  Member,
  MemberPii,
  PromotionRecord,
  Region,
  RegionFilterState,
  RegionLevel,
} from '../types/org';
import { isBeltEligibleForKta, resolveOrderedBelts } from '../constants/beltsAndSeed';
import { compressImageToDataUrl, readFileAsBoundedDataUrl } from '../lib/mediaUtils';
import {
  composeIndonesianAddress,
  fetchIndonesiaDistricts,
  fetchIndonesiaProvinces,
  fetchIndonesiaRegencies,
  fetchIndonesiaVillages,
  findRegionItemByName,
  IndoRegionItem,
  STATIC_INDO_PROVINCES,
} from '../lib/indonesiaRegions';

interface MemberManagementViewProps {
  members: Member[];
  regions: Region[];
  beltLevels: BeltLevel[];
  piiCache: Record<string, MemberPii>;
  isAdmin: boolean;
  isSignedIn: boolean;
  currentUid: string;
  filter: RegionFilterState;
  openAddSignal?: number;
  onChangeFilter: (next: RegionFilterState) => void;
  onRequestSignIn: () => void;
  onCreateMember: (
    memberData: Omit<Member, 'id' | 'ownerUid' | 'orgCode' | 'createdAt' | 'updatedAt'>,
    piiData: Omit<MemberPii, 'ownerUid' | 'updatedAt'> | null
  ) => Promise<void>;
  onUpdateMember: (
    member: Member,
    memberUpdates: {
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
      riwayatTingkat?: PromotionRecord[];
      berkasChecklist: BerkasChecklist;
    },
    piiData: Omit<MemberPii, 'ownerUid' | 'updatedAt'> | null
  ) => Promise<void>;
  onPromoteMember: (
    member: Member,
    toSabuk: string,
    toSabukOrder: number,
    tanggal: string,
    penguji: string,
    catatan: string,
    options?: { tahunDilantikPutih?: string; newNia?: string }
  ) => Promise<void>;
  onDeleteMember: (memberId: string) => Promise<void>;
  onLoadMemberPii: (memberId: string) => Promise<MemberPii | null>;
  onSaveRegion: (region: Omit<Region, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  onDeleteRegion: (regionId: string) => Promise<void>;
  onOpenKtaPreview: (member: Member) => void;
}

const PAGE_SIZE = 20;
const MEMBER_DRAFT_KEY = 'nursyah_member_form_draft_v1';

const HighlightMatch: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  const clean = query.trim();
  if (!clean) return <>{text}</>;
  const tokens = Array.from(
    new Set(
      clean
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    )
  );
  if (tokens.length === 0) return <>{text}</>;
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        tokens.some((t) => part.toLowerCase() === t.toLowerCase()) ? (
          <mark key={i} className="bg-amber-200/80 text-slate-950 rounded px-0.5 font-semibold">
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
};

export const MemberManagementView: React.FC<MemberManagementViewProps> = ({
  members,
  regions,
  beltLevels,
  piiCache,
  isAdmin,
  isSignedIn,
  currentUid,
  filter,
  openAddSignal,
  onChangeFilter,
  onRequestSignIn,
  onCreateMember,
  onUpdateMember,
  onPromoteMember,
  onDeleteMember,
  onLoadMemberPii,
  onSaveRegion,
  onDeleteRegion,
  onOpenKtaPreview,
}) => {
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [showCustomNia, setShowCustomNia] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<Member | null>(null);
  const [detailTarget, setDetailTarget] = useState<Member | null>(null);
  const [detailPii, setDetailPii] = useState<MemberPii | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showRegionModal, setShowRegionModal] = useState(false);
  const [liveSearchCrossRegion, setLiveSearchCrossRegion] = useState(true);
  const [page, setPage] = useState(1);

  const namaInputRef = useRef<HTMLInputElement | null>(null);
  const liveSearchInputRef = useRef<HTMLInputElement | null>(null);
  const deferredSearch = useDeferredValue(filter.search);

  const orderedBelts = useMemo(() => resolveOrderedBelts(beltLevels), [beltLevels]);

  // Hierarchical region lists (aggregated from explicit region docs, child metadata, and existing members)
  const allProvinsiNames = useMemo(() => {
    const set = new Set<string>();
    regions.forEach((r) => {
      if (r.level === 'provinsi' && r.name.trim()) set.add(r.name.trim());
      if (r.provinsiName?.trim()) set.add(r.provinsiName.trim());
    });
    members.forEach((m) => {
      if (m.provinsi?.trim()) set.add(m.provinsi.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [regions, members]);

  const allRantingRegions = useMemo(
    () => regions.filter((r) => r.level === 'ranting').sort((a, b) => a.name.localeCompare(b.name)),
    [regions]
  );

  const kabupatenFilterNames = useMemo(() => {
    const set = new Set<string>();
    regions.forEach((r) => {
      if (filter.provinsi && r.provinsiName !== filter.provinsi) return;
      if (r.level === 'kabupaten' && r.name.trim()) set.add(r.name.trim());
      if (r.kabupatenName?.trim()) set.add(r.kabupatenName.trim());
    });
    members.forEach((m) => {
      if (filter.provinsi && m.provinsi !== filter.provinsi) return;
      if (m.kabupaten?.trim()) set.add(m.kabupaten.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [regions, members, filter.provinsi]);

  const kecamatanFilterNames = useMemo(() => {
    const set = new Set<string>();
    regions.forEach((r) => {
      if (filter.provinsi && r.provinsiName !== filter.provinsi) return;
      if (filter.kabupaten && r.kabupatenName !== filter.kabupaten) return;
      if (r.level === 'kecamatan' && r.name.trim()) set.add(r.name.trim());
      if (r.kecamatanName?.trim()) set.add(r.kecamatanName.trim());
    });
    members.forEach((m) => {
      if (filter.provinsi && m.provinsi !== filter.provinsi) return;
      if (filter.kabupaten && m.kabupaten !== filter.kabupaten) return;
      if (m.kecamatan?.trim()) set.add(m.kecamatan.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [regions, members, filter.provinsi, filter.kabupaten]);

  const rantingFilterNames = useMemo(() => {
    const set = new Set<string>();
    allRantingRegions.forEach((r) => {
      if (filter.provinsi && r.provinsiName !== filter.provinsi) return;
      if (filter.kabupaten && r.kabupatenName !== filter.kabupaten) return;
      if (filter.kecamatan && r.kecamatanName !== filter.kecamatan) return;
      if (r.name.trim()) set.add(r.name.trim());
    });
    members.forEach((m) => {
      if (filter.provinsi && m.provinsi !== filter.provinsi) return;
      if (filter.kabupaten && m.kabupaten !== filter.kabupaten) return;
      if (filter.kecamatan && m.kecamatan !== filter.kecamatan) return;
      if (m.ranting?.trim()) set.add(m.ranting.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allRantingRegions, members, filter.provinsi, filter.kabupaten, filter.kecamatan]);

  const getDisplayAddress = (m: Member) =>
    m.alamatLengkap ||
    piiCache[m.id]?.alamatDomisili ||
    `${m.ranting}, ${m.kecamatan}, ${m.kabupaten}, ${m.provinsi}`;

  const hasRegionOrBeltFilter = Boolean(
    filter.provinsi || filter.kabupaten || filter.kecamatan || filter.ranting || filter.sabuk
  );

  const filteredMembers = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    const applyRegionFilters = !q || !liveSearchCrossRegion;

    const scored: { member: Member; score: number }[] = [];

    for (const m of members) {
      if (applyRegionFilters) {
        if (filter.provinsi && m.provinsi !== filter.provinsi) continue;
        if (filter.kabupaten && m.kabupaten !== filter.kabupaten) continue;
        if (filter.kecamatan && m.kecamatan !== filter.kecamatan) continue;
        if (filter.ranting && m.ranting !== filter.ranting) continue;
        if (filter.sabuk && m.sabuk !== filter.sabuk) continue;
      }

      if (tokens.length === 0) {
        scored.push({ member: m, score: 0 });
        continue;
      }

      const namaLower = m.namaLengkap.toLowerCase();
      const niaLower = m.nia.toLowerCase();
      const pii = piiCache[m.id];
      const nameNiaTarget = `${namaLower} ${niaLower}`;
      const fullTarget = `${nameNiaTarget} ${m.ranting} ${m.kecamatan} ${m.kabupaten} ${m.provinsi} ${
        m.alamatLengkap || ''
      } ${pii?.alamatDomisili || ''}`.toLowerCase();

      const allMatchFull = tokens.every((t) => fullTarget.includes(t));
      if (!allMatchFull) continue;

      let score = 10;
      if (niaLower === q) score = 100;
      else if (niaLower.startsWith(q)) score = 85;
      else if (namaLower.startsWith(q)) score = 75;
      else if (niaLower.includes(q)) score = 65;
      else if (namaLower.includes(q)) score = 55;
      else if (tokens.every((t) => nameNiaTarget.includes(t))) score = 45;

      scored.push({ member: m, score });
    }

    if (tokens.length > 0) {
      scored.sort((a, b) => b.score - a.score || a.member.nia.localeCompare(b.member.nia));
    }

    return scored.map((s) => s.member);
  }, [members, filter, deferredSearch, liveSearchCrossRegion, piiCache]);

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  const pagedMembers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredMembers.slice(start, start + PAGE_SIZE);
  }, [filteredMembers, page]);

  // Add / Edit Member Form State
  const [formNia, setFormNia] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formTempatLahir, setFormTempatLahir] = useState('');
  const [formTanggalLahir, setFormTanggalLahir] = useState('');
  const [formWa, setFormWa] = useState('');
  const [formProv, setFormProv] = useState('');
  const [formKab, setFormKab] = useState('');
  const [formKec, setFormKec] = useState('');
  const [formRanting, setFormRanting] = useState('');
  const [addressInputMode, setAddressInputMode] = useState<'auto' | 'manual'>('auto');
  const [formDetailJalan, setFormDetailJalan] = useState('');
  const [formDomisili, setFormDomisili] = useState('');
  const [indoProvinces, setIndoProvinces] = useState<IndoRegionItem[]>(STATIC_INDO_PROVINCES);
  const [indoRegencies, setIndoRegencies] = useState<IndoRegionItem[]>([]);
  const [indoDistricts, setIndoDistricts] = useState<IndoRegionItem[]>([]);
  const [indoVillages, setIndoVillages] = useState<IndoRegionItem[]>([]);
  const [selectedIndoProvId, setSelectedIndoProvId] = useState('');
  const [selectedIndoRegencyId, setSelectedIndoRegencyId] = useState('');
  const [selectedIndoDistrictId, setSelectedIndoDistrictId] = useState('');
  const [selectedIndoVillageName, setSelectedIndoVillageName] = useState('');
  const [indoLoading, setIndoLoading] = useState<'kab' | 'kec' | 'kel' | ''>('');
  const [indoApiError, setIndoApiError] = useState('');
  const [formSabuk, setFormSabuk] = useState('Sabuk Kuning Mas');
  const [formTahunPutih, setFormTahunPutih] = useState(String(new Date().getFullYear()));
  const [customNiaTouched, setCustomNiaTouched] = useState(false);
  const [formRiwayat, setFormRiwayat] = useState<PromotionRecord[]>([]);
  const [histFromSabuk, setHistFromSabuk] = useState('Sabuk Kuning Mas');
  const [histToSabuk, setHistToSabuk] = useState('Sabuk Putih');
  const [histTanggal, setHistTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [histPenguji, setHistPenguji] = useState('Dewan Penguji Cabang');
  const [histCatatan, setHistCatatan] = useState('');
  const [formStatus, setFormStatus] = useState<'Aktif' | 'Cuti' | 'Alumni'>('Aktif');
  const [formFoto, setFormFoto] = useState('');
  const [formBerkasNama, setFormBerkasNama] = useState('');
  const [formBerkasData, setFormBerkasData] = useState('');
  const [formChecklist, setFormChecklist] = useState<BerkasChecklist>({
    formulir: true,
    ktpKk: true,
    suratSehat: false,
    foto: false,
  });
  const [formError, setFormError] = useState('');
  const [formSuccessBanner, setFormSuccessBanner] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);

  useEffect(() => {
    fetchIndonesiaProvinces().then(setIndoProvinces).catch(() => {});
  }, []);

  const loadIndoVillagesForDistrict = async (districtId: string) => {
    if (!districtId) {
      setIndoVillages([]);
      return;
    }
    setIndoLoading('kel');
    setIndoApiError('');
    try {
      const list = await fetchIndonesiaVillages(districtId);
      setIndoVillages(list);
    } catch {
      setIndoVillages([]);
    } finally {
      setIndoLoading('');
    }
  };

  const loadIndoDistrictsForRegency = async (regencyId: string, prefillKecName?: string) => {
    if (!regencyId) {
      setIndoDistricts([]);
      setIndoVillages([]);
      return;
    }
    setIndoLoading('kec');
    setIndoApiError('');
    try {
      const list = await fetchIndonesiaDistricts(regencyId);
      setIndoDistricts(list);
      if (prefillKecName) {
        const matched = findRegionItemByName(list, prefillKecName);
        if (matched) {
          setSelectedIndoDistrictId(matched.id);
          await loadIndoVillagesForDistrict(matched.id);
        }
      }
    } catch {
      setIndoDistricts([]);
      setIndoApiError('Gagal memuat daftar Kecamatan Indonesia. Cek koneksi atau pilih opsi Manual.');
    } finally {
      setIndoLoading('');
    }
  };

  const loadIndoRegenciesForProv = async (
    provId: string,
    prefillKabName?: string,
    prefillKecName?: string
  ) => {
    if (!provId) {
      setIndoRegencies([]);
      setIndoDistricts([]);
      setIndoVillages([]);
      return;
    }
    setIndoLoading('kab');
    setIndoApiError('');
    try {
      const list = await fetchIndonesiaRegencies(provId);
      setIndoRegencies(list);
      if (prefillKabName) {
        const matched = findRegionItemByName(list, prefillKabName);
        if (matched) {
          setSelectedIndoRegencyId(matched.id);
          await loadIndoDistrictsForRegency(matched.id, prefillKecName);
        }
      }
    } catch {
      setIndoRegencies([]);
      setIndoApiError('Gagal memuat daftar Kabupaten/Kota Indonesia. Cek koneksi atau pilih opsi Manual.');
    } finally {
      setIndoLoading('');
    }
  };

  const syncAutoDomisiliAddress = (parts: {
    detailJalan?: string;
    kelurahan?: string;
    kecamatan?: string;
    kabupaten?: string;
    provinsi?: string;
  }) => {
    const composed = composeIndonesianAddress(parts);
    if (composed) {
      setFormDomisili(composed);
    }
  };

  const formProvNames = useMemo(() => {
    const set = new Set<string>(allProvinsiNames);
    if (formProv.trim()) set.add(formProv.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allProvinsiNames, formProv]);

  const formKabNames = useMemo(() => {
    const set = new Set<string>();
    regions.forEach((r) => {
      if (formProv && r.provinsiName && r.provinsiName !== formProv) return;
      if (r.level === 'kabupaten' && r.name.trim()) set.add(r.name.trim());
      if (r.kabupatenName?.trim()) set.add(r.kabupatenName.trim());
    });
    members.forEach((m) => {
      if (formProv && m.provinsi !== formProv) return;
      if (m.kabupaten?.trim()) set.add(m.kabupaten.trim());
    });
    if (formKab.trim()) set.add(formKab.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [regions, members, formProv, formKab]);

  const formKecNames = useMemo(() => {
    const set = new Set<string>();
    regions.forEach((r) => {
      if (formProv && r.provinsiName && r.provinsiName !== formProv) return;
      if (formKab && r.kabupatenName && r.kabupatenName !== formKab) return;
      if (r.level === 'kecamatan' && r.name.trim()) set.add(r.name.trim());
      if (r.kecamatanName?.trim()) set.add(r.kecamatanName.trim());
    });
    members.forEach((m) => {
      if (formProv && m.provinsi !== formProv) return;
      if (formKab && m.kabupaten !== formKab) return;
      if (m.kecamatan?.trim()) set.add(m.kecamatan.trim());
    });
    if (formKec.trim()) set.add(formKec.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [regions, members, formProv, formKab, formKec]);

  const formRantingNames = useMemo(() => {
    const set = new Set<string>();
    allRantingRegions.forEach((r) => {
      if (formProv && r.provinsiName && r.provinsiName !== formProv) return;
      if (formKab && r.kabupatenName && r.kabupatenName !== formKab) return;
      if (formKec && r.kecamatanName && r.kecamatanName !== formKec) return;
      if (r.name.trim()) set.add(r.name.trim());
    });
    members.forEach((m) => {
      if (formProv && m.provinsi !== formProv) return;
      if (formKab && m.kabupaten !== formKab) return;
      if (formKec && m.kecamatan !== formKec) return;
      if (m.ranting?.trim()) set.add(m.ranting.trim());
    });
    if (formRanting.trim()) set.add(formRanting.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allRantingRegions, members, formProv, formKab, formKec, formRanting]);

  // Auto-save form draft while adding new member
  useEffect(() => {
    if (!showMemberModal || editingMember) return;
    const hasContent =
      formNama.trim() ||
      formWa.trim() ||
      formTempatLahir.trim() ||
      formDomisili.trim() ||
      formRiwayat.length > 0;
    if (!hasContent) return;
    try {
      sessionStorage.setItem(
        MEMBER_DRAFT_KEY,
        JSON.stringify({
          formNia,
          formNama,
          formTempatLahir,
          formTanggalLahir,
          formWa,
          formProv,
          formKab,
          formKec,
          formRanting,
          formDomisili,
          formSabuk,
          formTahunPutih,
          formRiwayat,
          formStatus,
          formChecklist,
        })
      );
      setHasSavedDraft(true);
    } catch {
      // ignore storage quota errors
    }
  }, [
    showMemberModal,
    editingMember,
    formNia,
    formNama,
    formTempatLahir,
    formTanggalLahir,
    formWa,
    formProv,
    formKab,
    formKec,
    formRanting,
    formDomisili,
    formSabuk,
    formTahunPutih,
    formRiwayat,
    formStatus,
    formChecklist,
  ]);

  const generateNextNiaForBelt = (sabuk: string, tahunPutih: string, offset = 1) => {
    const eligible = isBeltEligibleForKta(sabuk);
    const currentYear = String(new Date().getFullYear());
    const year = eligible && /^[0-9]{4}$/.test(tahunPutih.trim()) ? tahunPutih.trim() : currentYear;
    const prefix = eligible ? 'NRS' : 'CALON';
    const existingNias = new Set(members.map((m) => m.nia));
    let maxSeq = members.length;
    members.forEach((m) => {
      const match = m.nia.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!Number.isNaN(num) && num > maxSeq) maxSeq = num;
      }
    });
    let seq = maxSeq + offset;
    let candidate = `${prefix}-${year}-${String(seq).padStart(3, '0')}`;
    while (existingNias.has(candidate)) {
      seq += 1;
      candidate = `${prefix}-${year}-${String(seq).padStart(3, '0')}`;
    }
    return candidate;
  };

  const applyQuickRanting = (rantingName: string) => {
    if (!rantingName) {
      setFormRanting('');
      return;
    }
    const found = allRantingRegions.find((r) => r.name === rantingName);
    if (found) {
      const pName = found.provinsiName || '';
      const kName = found.kabupatenName || '';
      const cName = found.kecamatanName || '';
      setFormProv(pName);
      setFormKab(kName);
      setFormKec(cName);
      setFormRanting(found.name);
      const matchedProv = findRegionItemByName(indoProvinces, pName);
      if (matchedProv) {
        setSelectedIndoProvId(matchedProv.id);
        setSelectedIndoRegencyId('');
        setSelectedIndoDistrictId('');
        setSelectedIndoVillageName('');
        void loadIndoRegenciesForProv(matchedProv.id, kName, cName);
      }
      if (!formDomisili.trim() || addressInputMode === 'auto') {
        syncAutoDomisiliAddress({
          detailJalan: formDetailJalan,
          kelurahan: selectedIndoVillageName,
          kecamatan: cName,
          kabupaten: kName,
          provinsi: pName,
        });
      }
    } else {
      setFormRanting(rantingName);
    }
  };

  const resetPersonalFieldsForNext = (nextNia: string) => {
    setFormNia(nextNia);
    setCustomNiaTouched(false);
    setFormNama('');
    setFormTempatLahir('');
    setFormTanggalLahir('');
    setFormWa('');
    setFormDetailJalan('');
    setFormDomisili('');
    setFormFoto('');
    setFormBerkasNama('');
    setFormBerkasData('');
    setFormRiwayat([]);
    setHistCatatan('');
    setFormChecklist({ formulir: true, ktpKk: true, suratSehat: false, foto: false });
    setFormError('');
    try {
      sessionStorage.removeItem(MEMBER_DRAFT_KEY);
      setHasSavedDraft(false);
    } catch {
      // ignore
    }
  };

  const openAddModal = () => {
    setEditingMember(null);
    setFormSuccessBanner('');
    setFormError('');
    setIndoApiError('');
    setFormDetailJalan('');
    setSelectedIndoVillageName('');
    setCustomNiaTouched(false);

    let initProv = filter.provinsi || '';
    let initKab = filter.kabupaten || '';
    let initKec = filter.kecamatan || '';
    const defaultYear = String(new Date().getFullYear());
    let initSabuk = filter.sabuk || orderedBelts[0]?.name || 'Sabuk Kuning Mas';

    // Check if there is a saved draft first
    let restored = false;
    try {
      const raw = sessionStorage.getItem(MEMBER_DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.formNama || d.formWa || d.formDomisili || (Array.isArray(d.formRiwayat) && d.formRiwayat.length > 0)) {
          initProv = d.formProv || filter.provinsi || '';
          initKab = d.formKab || filter.kabupaten || '';
          initKec = d.formKec || filter.kecamatan || '';
          initSabuk = d.formSabuk || orderedBelts[0]?.name || 'Sabuk Kuning Mas';
          const restoredYear =
            typeof d.formTahunPutih === 'string' && /^\d{4}$/.test(d.formTahunPutih)
              ? d.formTahunPutih
              : defaultYear;
          setFormTahunPutih(restoredYear);
          setFormNia(d.formNia || generateNextNiaForBelt(initSabuk, restoredYear));
          setFormNama(d.formNama || '');
          setFormTempatLahir(d.formTempatLahir || '');
          setFormTanggalLahir(d.formTanggalLahir || '');
          setFormWa(d.formWa || '');
          setFormProv(initProv);
          setFormKab(initKab);
          setFormKec(initKec);
          setFormRanting(d.formRanting || filter.ranting || '');
          setFormDomisili(d.formDomisili || '');
          setFormSabuk(initSabuk);
          setFormStatus(d.formStatus || 'Aktif');
          setFormRiwayat(Array.isArray(d.formRiwayat) ? d.formRiwayat : []);
          setFormChecklist(
            d.formChecklist || { formulir: true, ktpKk: true, suratSehat: false, foto: false }
          );
          setHasSavedDraft(true);
          restored = true;
        }
      }
    } catch {
      // ignore
    }

    if (!restored) {
      setFormTahunPutih(defaultYear);
      setFormNia(generateNextNiaForBelt(initSabuk, defaultYear));
      setFormNama('');
      setFormTempatLahir('');
      setFormTanggalLahir('');
      setFormWa('');
      if (filter.ranting) {
        const foundR = allRantingRegions.find((r) => r.name === filter.ranting);
        if (foundR) {
          initProv = foundR.provinsiName || initProv;
          initKab = foundR.kabupatenName || initKab;
          initKec = foundR.kecamatanName || initKec;
        }
        setFormProv(initProv);
        setFormKab(initKab);
        setFormKec(initKec);
        setFormRanting(filter.ranting);
      } else {
        setFormProv(initProv);
        setFormKab(initKab);
        setFormKec(initKec);
        setFormRanting('');
      }
      setFormDomisili('');
      setFormSabuk(initSabuk);
      setFormStatus('Aktif');
      setFormRiwayat([]);
      setFormFoto('');
      setFormBerkasNama('');
      setFormBerkasData('');
      setFormChecklist({ formulir: true, ktpKk: true, suratSehat: false, foto: false });
      setHasSavedDraft(false);
    }

    setHistFromSabuk('Sabuk Kuning Mas');
    setHistToSabuk('Sabuk Putih');
    setHistTanggal(new Date().toISOString().slice(0, 10));
    setHistPenguji('Dewan Penguji Cabang');
    setHistCatatan('');

    setAddressInputMode('auto');
    const matchedProv = findRegionItemByName(indoProvinces, initProv);
    if (matchedProv) {
      setSelectedIndoProvId(matchedProv.id);
      setSelectedIndoRegencyId('');
      setSelectedIndoDistrictId('');
      void loadIndoRegenciesForProv(matchedProv.id, initKab, initKec);
    } else {
      setSelectedIndoProvId('');
      setSelectedIndoRegencyId('');
      setSelectedIndoDistrictId('');
      setIndoRegencies([]);
      setIndoDistricts([]);
      setIndoVillages([]);
    }

    setShowOptionalFields(false);
    setShowCustomNia(false);
    setShowMemberModal(true);
    setTimeout(() => namaInputRef.current?.focus(), 120);
  };

  useEffect(() => {
    if (openAddSignal && openAddSignal > 0) {
      openAddModal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAddSignal]);

  const canEditPrivatePii =
    !editingMember || isAdmin || (isSignedIn && editingMember.ownerUid === currentUid);

  const isSelfServiceMandiriEdit = Boolean(
    editingMember && !isSignedIn && editingMember.ownerUid === 'mandiri'
  );

  const openEditModal = async (member: Member) => {
    setEditingMember(member);
    setFormSuccessBanner('');
    setFormError('');
    setIndoApiError('');
    setFormDetailJalan('');
    setSelectedIndoVillageName('');
    setCustomNiaTouched(false);
    setFormNia(member.nia);
    setFormNama(member.namaLengkap);
    setFormProv(member.provinsi);
    setFormKab(member.kabupaten);
    setFormKec(member.kecamatan);
    setFormRanting(member.ranting);
    setFormSabuk(member.sabuk);
    const derivedTahunPutih =
      member.tahunDilantikPutih ||
      member.nia.match(/^NRS-(\d{4})-/)?.[1] ||
      String(new Date().getFullYear());
    setFormTahunPutih(derivedTahunPutih);
    setFormRiwayat(member.riwayatTingkat || []);
    setHistFromSabuk(member.sabuk);
    const nextBeltForHist =
      orderedBelts.find((b) => b.order === member.sabukOrder + 1) ||
      orderedBelts[orderedBelts.length - 1];
    setHistToSabuk(nextBeltForHist.name);
    setHistTanggal(new Date().toISOString().slice(0, 10));
    setHistPenguji('Dewan Penguji Cabang');
    setHistCatatan('');
    setFormStatus(member.statusAktif);
    setFormFoto(member.fotoProfil || '');
    setFormChecklist(
      member.berkasChecklist || { formulir: true, ktpKk: true, suratSehat: false, foto: false }
    );

    const matchedProv = findRegionItemByName(indoProvinces, member.provinsi);
    if (matchedProv) {
      setAddressInputMode('auto');
      setSelectedIndoProvId(matchedProv.id);
      setSelectedIndoRegencyId('');
      setSelectedIndoDistrictId('');
      void loadIndoRegenciesForProv(matchedProv.id, member.kabupaten, member.kecamatan);
    } else {
      setAddressInputMode('manual');
      setSelectedIndoProvId('');
      setSelectedIndoRegencyId('');
      setSelectedIndoDistrictId('');
      setIndoRegencies([]);
      setIndoDistricts([]);
      setIndoVillages([]);
    }

    const canLoadPii = isAdmin || (isSignedIn && member.ownerUid === currentUid);
    const cached = canLoadPii ? piiCache[member.id] || (await onLoadMemberPii(member.id)) : null;
    setFormTempatLahir(cached?.tempatLahir || '');
    setFormTanggalLahir(cached?.tanggalLahir || '');
    setFormWa(cached?.nomorWa || '');
    setFormDomisili(cached?.alamatDomisili || member.alamatLengkap || '');
    setFormBerkasNama(cached?.berkasNama || '');
    setFormBerkasData(cached?.berkasDataUrl || '');

    setShowOptionalFields(
      Boolean(cached?.nomorWa || cached?.tempatLahir || cached?.tanggalLahir || cached?.berkasDataUrl)
    );
    setShowCustomNia(isAdmin);
    setShowMemberModal(true);
  };

  const handleAddHistoryEntry = () => {
    if (!histTanggal) {
      setFormError('Pilih tanggal kenaikan tingkat terlebih dahulu.');
      return;
    }
    const newRec: PromotionRecord = {
      fromSabuk: histFromSabuk,
      toSabuk: histToSabuk,
      tanggal: histTanggal,
      penguji: histPenguji.trim() || 'Dewan Penguji Cabang',
      catatan: histCatatan.trim() || `Kenaikan tingkat dari ${histFromSabuk} ke ${histToSabuk}.`,
    };
    setFormRiwayat((prev) => [...prev, newRec].slice(0, 25));

    // Automatically sync Sabuk Putih inauguration year if user added Sabuk Putih promotion history
    if (histToSabuk === 'Sabuk Putih' && /^\d{4}/.test(histTanggal)) {
      const yr = histTanggal.slice(0, 4);
      setFormTahunPutih(yr);
      if (
        !customNiaTouched &&
        isBeltEligibleForKta(formSabuk) &&
        (!editingMember || editingMember.sabuk === 'Sabuk Kuning Mas')
      ) {
        setFormNia(generateNextNiaForBelt(formSabuk, yr));
      }
    }

    setHistFromSabuk(histToSabuk);
    const toIdx = orderedBelts.findIndex((b) => b.name === histToSabuk);
    if (toIdx >= 0 && toIdx + 1 < orderedBelts.length) {
      setHistToSabuk(orderedBelts[toIdx + 1].name);
    }
    setHistCatatan('');
    setFormError('');
  };

  const handleBeltChangeInForm = (nextSabuk: string) => {
    setFormSabuk(nextSabuk);
    if (!customNiaTouched) {
      if (!editingMember) {
        setFormNia(generateNextNiaForBelt(nextSabuk, formTahunPutih));
      } else if (
        editingMember.sabuk === 'Sabuk Kuning Mas' &&
        isBeltEligibleForKta(nextSabuk)
      ) {
        setFormNia(generateNextNiaForBelt(nextSabuk, formTahunPutih));
      } else if (
        editingMember.sabuk === 'Sabuk Kuning Mas' &&
        !isBeltEligibleForKta(nextSabuk)
      ) {
        setFormNia(editingMember.nia);
      }
    }
  };

  const handleTahunPutihChangeInForm = (rawVal: string) => {
    const clean = rawVal.replace(/\D/g, '').slice(0, 4);
    setFormTahunPutih(clean);
    if (clean.length === 4 && !customNiaTouched && isBeltEligibleForKta(formSabuk)) {
      if (!editingMember || editingMember.sabuk === 'Sabuk Kuning Mas') {
        setFormNia(generateNextNiaForBelt(formSabuk, clean));
      }
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file, 480, 0.78, 230000);
      setFormFoto(compressed);
      setFormChecklist((prev) => ({ ...prev, foto: true }));
      setFormError('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal memproses foto.');
    }
  };

  const handleBerkasUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsBoundedDataUrl(file, 320000);
      setFormBerkasNama(file.name);
      setFormBerkasData(dataUrl);
      setFormError('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal membaca berkas persyaratan.');
    }
  };

  const niaValid = /^[a-zA-Z0-9_\-.]{3,40}$/.test(formNia.trim());
  const waClean = formWa.replace(/[\s\-()]/g, '');
  const waValid = waClean.length === 0 || (waClean.length >= 8 && waClean.length <= 24);

  const saveMemberAction = async (addAnother: boolean) => {
    setFormError('');
    setFormSuccessBanner('');
    if (editingMember && !isSignedIn && editingMember.ownerUid !== 'mandiri') {
      onRequestSignIn();
      return;
    }
    const cleanNama = formNama.trim();
    const cleanProv = formProv.trim();
    const cleanKab = formKab.trim();
    const cleanKec = formKec.trim();
    const cleanRanting = formRanting.trim();
    const cleanDomisili = formDomisili.trim();

    if (cleanNama.length < 2) {
      setFormError('Nama lengkap anggota minimal 2 karakter.');
      return;
    }
    if (!niaValid) {
      setFormError('NIA / Nomor KTA minimal 3 karakter dan hanya boleh berisi huruf, angka, titik, atau tanda hubung (-/_).');
      return;
    }
    if (cleanProv.length < 2 || cleanKab.length < 2 || cleanKec.length < 2 || cleanRanting.length < 2) {
      setFormError('Lengkapi seluruh jenjang wilayah minimal 2 karakter (Provinsi, Kabupaten/Kota, Kecamatan, dan Ranting).');
      return;
    }
    if (cleanDomisili.length < 4) {
      setFormError('Isi alamat lengkap anggota minimal 4 karakter.');
      return;
    }

    const selectedBelt = orderedBelts.find((b) => b.name === formSabuk) || orderedBelts[0];
    const beltEligibleForKta = isBeltEligibleForKta(selectedBelt.name, selectedBelt.order);
    const cleanTahunPutih = formTahunPutih.trim();
    if (beltEligibleForKta && !/^[0-9]{4}$/.test(cleanTahunPutih)) {
      setFormError('Masukkan Tahun Dilantik Sabuk Putih (4 digit, contoh: 2024) untuk penulisan Nomor KTA.');
      return;
    }

    const hasAnyPiiInput = Boolean(
      waClean || formTempatLahir.trim() || formTanggalLahir || formBerkasData
    );
    let piiPayload: Omit<MemberPii, 'ownerUid' | 'updatedAt'> | null = null;
    if (canEditPrivatePii && hasAnyPiiInput) {
      if (waClean.length < 8 || waClean.length > 24) {
        setFormError('Nomor WhatsApp minimal 8 digit angka aktif (atau kosongkan jika belum ada).');
        return;
      }
      if (formTempatLahir.trim().length < 2 || formTempatLahir.trim().length > 80) {
        setFormError('Isi Tempat Lahir minimal 2 karakter jika ingin menyimpan data pribadi.');
        return;
      }
      if (formTanggalLahir.length < 4) {
        setFormError('Pilih Tanggal Lahir jika ingin menyimpan data pribadi.');
        return;
      }
      piiPayload = {
        nomorWa: waClean,
        tempatLahir: formTempatLahir.trim().slice(0, 80),
        tanggalLahir: formTanggalLahir.slice(0, 20),
        alamatDomisili: cleanDomisili.slice(0, 350),
        ...(formBerkasNama ? { berkasNama: formBerkasNama.slice(0, 160) } : {}),
        ...(formBerkasData ? { berkasDataUrl: formBerkasData } : {}),
      };
    }

    setFormSubmitting(true);
    try {
      if (editingMember) {
        await onUpdateMember(
          editingMember,
          {
            nia: formNia.trim().slice(0, 40),
            namaLengkap: cleanNama.slice(0, 120),
            provinsi: cleanProv.slice(0, 120),
            kabupaten: cleanKab.slice(0, 120),
            kecamatan: cleanKec.slice(0, 120),
            ranting: cleanRanting.slice(0, 120),
            alamatLengkap: cleanDomisili.slice(0, 350),
            sabuk: selectedBelt.name.slice(0, 60),
            sabukOrder: Math.round(Number(selectedBelt.order)),
            ...(beltEligibleForKta ? { tahunDilantikPutih: cleanTahunPutih } : {}),
            ...(formFoto ? { fotoProfil: formFoto } : {}),
            statusAktif: formStatus,
            riwayatTingkat: formRiwayat,
            berkasChecklist: formChecklist,
          },
          piiPayload
        );
        setShowMemberModal(false);
      } else {
        await onCreateMember(
          {
            nia: formNia.trim().slice(0, 40),
            namaLengkap: cleanNama.slice(0, 120),
            provinsi: cleanProv.slice(0, 120),
            kabupaten: cleanKab.slice(0, 120),
            kecamatan: cleanKec.slice(0, 120),
            ranting: cleanRanting.slice(0, 120),
            alamatLengkap: cleanDomisili.slice(0, 350),
            sabuk: selectedBelt.name.slice(0, 60),
            sabukOrder: Math.round(Number(selectedBelt.order)),
            ...(beltEligibleForKta ? { tahunDilantikPutih: cleanTahunPutih } : {}),
            ...(formFoto ? { fotoProfil: formFoto } : {}),
            statusAktif: formStatus,
            riwayatTingkat: formRiwayat,
            berkasChecklist: formChecklist,
          },
          piiPayload
        );

        if (addAnother) {
          resetPersonalFieldsForNext(
            generateNextNiaForBelt(selectedBelt.name, cleanTahunPutih, 2)
          );
          setFormSuccessBanner(`Anggota "${cleanNama}" tersimpan. Silakan lanjut isi anggota berikutnya di ${cleanRanting}.`);
          setTimeout(() => namaInputRef.current?.focus(), 80);
        } else {
          resetPersonalFieldsForNext(
            generateNextNiaForBelt(selectedBelt.name, cleanTahunPutih, 2)
          );
          setShowMemberModal(false);
        }
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan data anggota.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Promote Belt State
  const [promoTargetSabuk, setPromoTargetSabuk] = useState('');
  const [promoTanggal, setPromoTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [promoPenguji, setPromoPenguji] = useState('');
  const [promoCatatan, setPromoCatatan] = useState('');
  const [promoTahunPutih, setPromoTahunPutih] = useState(String(new Date().getFullYear()));
  const [promoNewNia, setPromoNewNia] = useState('');
  const [promoSaving, setPromoSaving] = useState(false);
  const [promoError, setPromoError] = useState('');

  const openPromoteModal = (member: Member) => {
    const nextBelt =
      orderedBelts.find((b) => b.order === member.sabukOrder + 1) ||
      orderedBelts[orderedBelts.length - 1];
    const todayStr = new Date().toISOString().slice(0, 10);
    const defaultYr =
      member.tahunDilantikPutih ||
      member.nia.match(/^NRS-(\d{4})-/)?.[1] ||
      todayStr.slice(0, 4);
    setPromoteTarget(member);
    setPromoTargetSabuk(nextBelt.name);
    setPromoTanggal(todayStr);
    setPromoPenguji('Dewan Penguji Cabang');
    setPromoCatatan(`Lulus Ujian Kenaikan Tingkat dari ${member.sabuk} ke ${nextBelt.name}.`);
    setPromoTahunPutih(defaultYr);
    if (member.sabuk === 'Sabuk Kuning Mas' && isBeltEligibleForKta(nextBelt.name, nextBelt.order)) {
      setPromoNewNia(generateNextNiaForBelt(nextBelt.name, defaultYr));
    } else {
      setPromoNewNia(member.nia);
    }
    setPromoError('');
  };

  const handleConfirmPromote = async (e: React.FormEvent) => {
    e.preventDefault();
    setPromoError('');
    if (!promoteTarget) return;
    if (!isSignedIn && promoteTarget.ownerUid !== 'mandiri') {
      onRequestSignIn();
      return;
    }
    const targetBeltObj = orderedBelts.find((b) => b.name === promoTargetSabuk);
    if (!targetBeltObj) return;
    const eligibleNext = isBeltEligibleForKta(targetBeltObj.name, targetBeltObj.order);
    if (eligibleNext && !/^[0-9]{4}$/.test(promoTahunPutih.trim())) {
      setPromoError('Masukkan Tahun Dilantik Sabuk Putih (4 digit angka) untuk penulisan Nomor KTA.');
      return;
    }

    setPromoSaving(true);
    try {
      await onPromoteMember(
        promoteTarget,
        targetBeltObj.name,
        targetBeltObj.order,
        promoTanggal,
        promoPenguji.trim() || 'Dewan Penguji',
        promoCatatan.trim() || `Naik tingkat ke ${targetBeltObj.name}`,
        {
          ...(eligibleNext ? { tahunDilantikPutih: promoTahunPutih.trim() } : {}),
          ...(promoteTarget.sabuk === 'Sabuk Kuning Mas' && eligibleNext && promoNewNia.trim()
            ? { newNia: promoNewNia.trim() }
            : {}),
        }
      );
      setPromoteTarget(null);
    } catch (err) {
      setPromoError(err instanceof Error ? err.message : 'Gagal mencatat kenaikan tingkat.');
    } finally {
      setPromoSaving(false);
    }
  };

  // Detail Drawer
  const openDetail = async (member: Member) => {
    setDetailTarget(member);
    setDetailPii(null);
    setDetailLoading(true);
    try {
      const pii = await onLoadMemberPii(member.id);
      setDetailPii(pii);
    } finally {
      setDetailLoading(false);
    }
  };

  // Region Management Modal State (Admin Pusat)
  const [regLevel, setRegLevel] = useState<RegionLevel>('ranting');
  const [regInputMode, setRegInputMode] = useState<'auto' | 'manual'>('auto');
  const [regName, setRegName] = useState('');
  const [regProvName, setRegProvName] = useState('');
  const [regKabName, setRegKabName] = useState('');
  const [regKecName, setRegKecName] = useState('');
  const [regIndoProvId, setRegIndoProvId] = useState('');
  const [regIndoRegId, setRegIndoRegId] = useState('');
  const [regIndoRegencies, setRegIndoRegencies] = useState<IndoRegionItem[]>([]);
  const [regIndoDistricts, setRegIndoDistricts] = useState<IndoRegionItem[]>([]);
  const [regIndoLoading, setRegIndoLoading] = useState(false);
  const [regSekretariat, setRegSekretariat] = useState('');
  const [regPelatih, setRegPelatih] = useState('');
  const [regJadwal, setRegJadwal] = useState('');
  const [regEditingId, setRegEditingId] = useState<string | undefined>(undefined);
  const [regSaving, setRegSaving] = useState(false);
  const [regError, setRegError] = useState('');

  const handleRegIndoProvSelect = async (provId: string) => {
    setRegIndoProvId(provId);
    setRegIndoRegId('');
    setRegIndoRegencies([]);
    setRegIndoDistricts([]);
    const prov = indoProvinces.find((p) => p.id === provId);
    const pName = prov?.name || '';
    if (regLevel === 'provinsi') {
      setRegName(pName);
    } else {
      setRegProvName(pName);
      if (regLevel === 'kabupaten') setRegName('');
      setRegKabName('');
      setRegKecName('');
    }
    if (!provId || regLevel === 'provinsi') return;
    setRegIndoLoading(true);
    try {
      const regs = await fetchIndonesiaRegencies(provId);
      setRegIndoRegencies(regs);
    } catch {
      setRegIndoRegencies([]);
    } finally {
      setRegIndoLoading(false);
    }
  };

  const handleRegIndoRegSelect = async (regId: string) => {
    setRegIndoRegId(regId);
    setRegIndoDistricts([]);
    const reg = regIndoRegencies.find((r) => r.id === regId);
    const kName = reg?.name || '';
    if (regLevel === 'kabupaten') {
      setRegName(kName);
      return;
    }
    setRegKabName(kName);
    if (regLevel === 'kecamatan') setRegName('');
    setRegKecName('');
    if (!regId) return;
    setRegIndoLoading(true);
    try {
      const dists = await fetchIndonesiaDistricts(regId);
      setRegIndoDistricts(dists);
    } catch {
      setRegIndoDistricts([]);
    } finally {
      setRegIndoLoading(false);
    }
  };

  const handleSaveRegionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    if (regName.trim().length < 2) {
      setRegError('Nama wilayah atau ranting minimal 2 karakter.');
      return;
    }
    if (regLevel !== 'provinsi' && regProvName.trim().length < 2) {
      setRegError('Isi nama Provinsi minimal 2 karakter.');
      return;
    }
    if ((regLevel === 'kecamatan' || regLevel === 'ranting') && regKabName.trim().length < 2) {
      setRegError('Isi nama Kabupaten/Kota minimal 2 karakter.');
      return;
    }
    if (regLevel === 'ranting' && regKecName.trim().length < 2) {
      setRegError('Isi nama Kecamatan minimal 2 karakter.');
      return;
    }
    setRegSaving(true);
    try {
      await onSaveRegion({
        id: regEditingId,
        level: regLevel,
        name: regName.trim(),
        provinsiName: regLevel !== 'provinsi' ? regProvName.trim() : undefined,
        kabupatenName: regLevel === 'kecamatan' || regLevel === 'ranting' ? regKabName.trim() : undefined,
        kecamatanName: regLevel === 'ranting' ? regKecName.trim() : undefined,
        alamatSekretariat: regLevel === 'ranting' ? regSekretariat.trim() : undefined,
        pelatihUtama: regLevel === 'ranting' ? regPelatih.trim() : undefined,
        jadwalLatihan: regLevel === 'ranting' ? regJadwal.trim() : undefined,
        orgCode: 'NURSYAH',
      });
      setRegName('');
      setRegSekretariat('');
      setRegPelatih('');
      setRegJadwal('');
      setRegEditingId(undefined);
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Gagal menyimpan data wilayah.');
    } finally {
      setRegSaving(false);
    }
  };

  const editableMembersForPromo = filteredMembers;

  return (
    <div className="space-y-6">
      {/* Page Title & Primary Action Commands */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Data Anggota</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Isi data diri langsung tanpa login, atau cari anggota berdasarkan nama, NIA, dan wilayah.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold bg-red-700 text-white rounded-lg hover:bg-red-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            <span>Isi Data Saya (Tanpa Login)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowFilterPanel((v) => !v)}
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 min-h-[44px] text-sm font-medium border rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              showFilterPanel || hasRegionOrBeltFilter
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>Filter Wilayah{hasRegionOrBeltFilter ? ' (Aktif)' : ''}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const target = editableMembersForPromo[0] || filteredMembers[0];
              if (target) openPromoteModal(target);
            }}
            disabled={editableMembersForPromo.length === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 min-h-[44px] text-sm font-medium bg-white text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <ArrowUpCircle className="w-4 h-4 text-amber-600" />
            <span>Naikkan Tingkat</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowRegionModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 min-h-[44px] text-sm font-medium bg-white text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <MapPin className="w-4 h-4 text-red-700" />
              <span>Kelola Wilayah</span>
            </button>
          )}
        </div>
      </div>

      {/* Always-Visible Real-Time Live Search Bar */}
      <section className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
            <input
              ref={liveSearchInputRef}
              type="text"
              inputMode="search"
              aria-label="Cari anggota berdasarkan nama atau nomor NIA"
              value={filter.search}
              onChange={(e) => {
                setPage(1);
                onChangeFilter({ ...filter, search: e.target.value });
              }}
              placeholder="Cari cepat: ketik Nama Anggota atau Nomor NIA..."
              className="w-full min-h-[44px] pl-10 pr-10 py-2 text-base sm:text-sm bg-slate-50 focus:bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700 transition-colors"
            />
            {filter.search && (
              <button
                type="button"
                onClick={() => {
                  setPage(1);
                  onChangeFilter({ ...filter, search: '' });
                  liveSearchInputRef.current?.focus();
                }}
                aria-label="Hapus kata pencarian"
                className="absolute right-2 top-1.5 p-2 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {filter.search.trim() && hasRegionOrBeltFilter && (
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setLiveSearchCrossRegion((v) => !v);
              }}
              className={`min-h-[44px] px-3 py-2 text-xs font-semibold border rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
                liveSearchCrossRegion
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
              }`}
            >
              {liveSearchCrossRegion ? 'Semua Wilayah' : 'Wilayah Terpilih'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          {filter.search.trim() ? (
            <span>
              Ditemukan <strong className="text-red-700 font-mono tabular-nums">{filteredMembers.length}</strong> anggota untuk &ldquo;{filter.search.trim()}&rdquo;
            </span>
          ) : (
            <span>
              Total <strong className="font-mono tabular-nums text-slate-700">{members.length}</strong> anggota terdaftar
            </span>
          )}
          {filter.search.trim() && (
            <button
              type="button"
              onClick={() => {
                setPage(1);
                onChangeFilter({ ...filter, search: '' });
              }}
              className="text-red-700 hover:underline font-medium cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </section>

      {/* Hierarchical Filter Bar */}
      {showFilterPanel && (
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Penyaringan Berjenjang Wilayah & Tingkatan Sabuk
            </h2>
            <button
              type="button"
              onClick={() => {
                setPage(1);
                onChangeFilter({
                  provinsi: '',
                  kabupaten: '',
                  kecamatan: '',
                  ranting: '',
                  sabuk: '',
                  search: '',
                });
              }}
              className="text-xs font-medium text-red-700 hover:text-red-800 cursor-pointer py-1 px-2"
            >
              Reset Filter
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">1. Provinsi</label>
              <select
                value={filter.provinsi}
                onChange={(e) => {
                  setPage(1);
                  onChangeFilter({
                    ...filter,
                    provinsi: e.target.value,
                    kabupaten: '',
                    kecamatan: '',
                    ranting: '',
                  });
                }}
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700"
              >
                <option value="">Semua Provinsi</option>
                {allProvinsiNames.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">2. Kabupaten / Kota</label>
              <select
                value={filter.kabupaten}
                onChange={(e) => {
                  setPage(1);
                  onChangeFilter({
                    ...filter,
                    kabupaten: e.target.value,
                    kecamatan: '',
                    ranting: '',
                  });
                }}
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700"
              >
                <option value="">Semua Kab/Kota</option>
                {kabupatenFilterNames.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">3. Kecamatan</label>
              <select
                value={filter.kecamatan}
                onChange={(e) => {
                  setPage(1);
                  onChangeFilter({
                    ...filter,
                    kecamatan: e.target.value,
                    ranting: '',
                  });
                }}
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700"
              >
                <option value="">Semua Kecamatan</option>
                {kecamatanFilterNames.map((kec) => (
                  <option key={kec} value={kec}>
                    {kec}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">4. Ranting / Cabang</label>
              <select
                value={filter.ranting}
                onChange={(e) => {
                  setPage(1);
                  onChangeFilter({ ...filter, ranting: e.target.value });
                }}
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700"
              >
                <option value="">Semua Ranting</option>
                {rantingFilterNames.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">5. Tingkatan Sabuk</label>
              <select
                value={filter.sabuk}
                onChange={(e) => {
                  setPage(1);
                  onChangeFilter({ ...filter, sabuk: e.target.value });
                }}
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700"
              >
                <option value="">Semua Sabuk</option>
                {orderedBelts.map((b) => (
                  <option key={b.id} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
      )}

      {/* Results Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span className="font-mono tabular-nums">
          Menampilkan {pagedMembers.length} dari {filteredMembers.length} anggota terdaftar
        </span>
        <span>
          Terbuka untuk umum: Nama, Alamat Lengkap &amp; Tingkatan Sabuk dapat dilihat dan diperbarui semua orang
        </span>
      </div>

      {/* Desktop Data Grid */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">NIA</th>
                <th className="py-3 px-4">Nama Anggota</th>
                <th className="py-3 px-4">Wilayah & Ranting</th>
                <th className="py-3 px-4">Tingkatan Sabuk</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Perintah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {pagedMembers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 space-y-2">
                    <p>
                      {filter.search.trim()
                        ? `Tidak ada anggota yang cocok dengan pencarian "${filter.search.trim()}".`
                        : 'Tidak ada anggota yang cocok dengan filter wilayah atau sabuk saat ini.'}
                    </p>
                    {filter.search.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setPage(1);
                          onChangeFilter({ ...filter, search: '' });
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 cursor-pointer"
                      >
                        Hapus Kata Pencarian
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                pagedMembers.map((m) => {
                  const canDelete = isAdmin || (isSignedIn && m.ownerUid === currentUid);
                  const canPrintKta = isBeltEligibleForKta(m.sabuk, m.sabukOrder);
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono tabular-nums text-xs font-medium text-slate-700 whitespace-nowrap">
                        <HighlightMatch text={m.nia} query={deferredSearch} />
                        {m.tahunDilantikPutih && (
                          <span className="block text-[10px] text-slate-400">
                            Putih {m.tahunDilantikPutih}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3 min-w-0">
                          {m.fotoProfil ? (
                            <img
                              src={m.fotoProfil}
                              alt={m.namaLengkap}
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-slate-900 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                              {m.namaLengkap.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">
                              <HighlightMatch text={m.namaLengkap} query={deferredSearch} />
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              Riwayat naik tingkat:{' '}
                              <span className="font-mono tabular-nums">{m.riwayatTingkat?.length || 0}x</span>
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <p className="font-medium text-slate-900 text-xs leading-snug">
                          {getDisplayAddress(m)}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {m.ranting} · {m.kecamatan} · {m.kabupaten} · {m.provinsi}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-semibold text-xs ${
                            m.sabuk.includes('Kuning')
                              ? 'text-amber-700'
                              : m.sabuk.includes('Putih')
                              ? 'text-slate-700'
                              : m.sabuk.includes('Hitam')
                              ? 'text-slate-950'
                              : 'text-red-700'
                          }`}
                        >
                          {m.sabuk}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs font-medium ${
                            m.statusAktif === 'Aktif'
                              ? 'text-emerald-700'
                              : m.statusAktif === 'Cuti'
                              ? 'text-amber-700'
                              : 'text-slate-500'
                          }`}
                        >
                          {m.statusAktif}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openDetail(m)}
                            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-md cursor-pointer"
                            title="Detail & Riwayat"
                          >
                            <Eye className="w-3.5 h-3.5 inline mr-1" />
                            Detail
                          </button>
                          <button
                            type="button"
                            disabled={!canPrintKta}
                            onClick={() => canPrintKta && onOpenKtaPreview(m)}
                            className={`px-2.5 py-1.5 text-xs font-medium border rounded-md ${
                              canPrintKta
                                ? 'text-slate-700 hover:bg-slate-100 border-slate-200 cursor-pointer'
                                : 'text-slate-400 bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                            }`}
                            title={
                              canPrintKta
                                ? 'Pratinjau KTA Digital'
                                : 'Cetak KTA hanya untuk Sabuk Putih ke atas'
                            }
                          >
                            <CreditCard className="w-3.5 h-3.5 inline mr-1" />
                            {canPrintKta ? 'KTA' : 'Belum KTA'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(m)}
                            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-md cursor-pointer"
                            title="Edit Data Anggota"
                          >
                            <Edit3 className="w-3.5 h-3.5 inline mr-1" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => openPromoteModal(m)}
                            className="px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md cursor-pointer"
                          >
                            Naikkan Tingkat
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => onDeleteMember(m.id)}
                              className="p-1.5 text-slate-400 hover:text-red-700 rounded-md cursor-pointer"
                              title="Hapus anggota"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card List */}
      <div className="md:hidden space-y-3">
        {pagedMembers.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500 space-y-2">
            <p>
              {filter.search.trim()
                ? `Tidak ada anggota yang cocok dengan pencarian "${filter.search.trim()}".`
                : 'Tidak ada anggota yang cocok dengan filter saat ini.'}
            </p>
            {filter.search.trim() && (
              <button
                type="button"
                onClick={() => {
                  setPage(1);
                  onChangeFilter({ ...filter, search: '' });
                }}
                className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 cursor-pointer"
              >
                Hapus Kata Pencarian
              </button>
            )}
          </div>
        ) : (
          pagedMembers.map((m) => {
            const canDelete = isAdmin || (isSignedIn && m.ownerUid === currentUid);
            const canPrintKta = isBeltEligibleForKta(m.sabuk, m.sabukOrder);
            return (
              <article key={m.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {m.fotoProfil ? (
                      <img
                        src={m.fotoProfil}
                        alt={m.namaLengkap}
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-slate-900 text-white text-sm font-semibold flex items-center justify-center shrink-0">
                        {m.namaLengkap.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">
                        <HighlightMatch text={m.namaLengkap} query={deferredSearch} />
                      </p>
                      <p className="text-xs font-mono tabular-nums text-slate-500">
                        <HighlightMatch text={m.nia} query={deferredSearch} /> · {m.statusAktif}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold shrink-0 ${
                      m.sabuk.includes('Kuning')
                        ? 'text-amber-700'
                        : m.sabuk.includes('Hitam')
                        ? 'text-slate-950'
                        : 'text-red-700'
                    }`}
                  >
                    {m.sabuk}
                  </span>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-0.5">
                  <p className="text-xs font-medium text-slate-900">{getDisplayAddress(m)}</p>
                  <p className="text-[11px] text-slate-500">
                    {m.ranting} · {m.kecamatan} · {m.kabupaten} · {m.provinsi}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => openDetail(m)}
                    className="min-h-[44px] px-3 py-2 text-xs font-medium bg-slate-50 text-slate-800 border border-slate-200 rounded-lg cursor-pointer"
                  >
                    Detail
                  </button>
                  <button
                    type="button"
                    disabled={!canPrintKta}
                    onClick={() => canPrintKta && onOpenKtaPreview(m)}
                    className={`min-h-[44px] px-3 py-2 text-xs font-medium border rounded-lg ${
                      canPrintKta
                        ? 'bg-slate-50 text-slate-800 border-slate-200 cursor-pointer'
                        : 'bg-slate-50 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed'
                    }`}
                    title={canPrintKta ? 'Cetak KTA' : 'Cetak KTA hanya untuk Sabuk Putih ke atas'}
                  >
                    {canPrintKta ? 'Cetak KTA' : 'Belum KTA'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(m)}
                    className="min-h-[44px] px-3 py-2 text-xs font-medium bg-slate-50 text-slate-800 border border-slate-200 rounded-lg cursor-pointer"
                  >
                    Edit Data
                  </button>
                  <button
                    type="button"
                    onClick={() => openPromoteModal(m)}
                    className="min-h-[44px] px-3 py-2 text-xs font-medium bg-amber-50 text-amber-900 border border-amber-200 rounded-lg cursor-pointer"
                  >
                    Naikkan Tingkat
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => onDeleteMember(m.id)}
                      className="col-span-2 min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus Anggota</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="min-h-[40px] px-3.5 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg disabled:opacity-50 cursor-pointer"
          >
            Sebelumnya
          </button>
          <span className="text-xs font-mono tabular-nums text-slate-600">
            Halaman {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="min-h-[40px] px-3.5 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg disabled:opacity-50 cursor-pointer"
          >
            Berikutnya
          </button>
        </div>
      )}

      {/* Responsive Sheet Modal: Tambah / Edit Anggota Baru */}
      {showMemberModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMemberAction(false);
            }}
            className="bg-white w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:rounded-xl sm:border sm:border-slate-200 flex flex-col overflow-hidden"
          >
            {/* Sticky Header */}
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-white shrink-0">
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                  {editingMember ? 'Perbarui Data Anggota' : 'Isi Data Mandiri Anggota'}
                </h2>
                <p className="text-xs text-slate-500 truncate">
                  {editingMember
                    ? `Mengubah profil ${editingMember.namaLengkap} (${editingMember.nia})`
                    : hasSavedDraft
                    ? 'Draf isian sebelumnya dipulihkan otomatis · Siap dilanjutkan'
                    : 'Cukup isi Nama, Tingkatan Sabuk, Ranting & Alamat Lengkap Anda'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {!editingMember && hasSavedDraft && (
                  <button
                    type="button"
                    onClick={() =>
                      resetPersonalFieldsForNext(
                        generateNextNiaForBelt(formSabuk, formTahunPutih)
                      )
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 rounded-lg cursor-pointer"
                    title="Bersihkan draf isian"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Reset Isian</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowMemberModal(false)}
                  className="p-2 text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer"
                  aria-label="Tutup formulir"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 3-Step Visual Guide */}
            <div className="px-4 sm:px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-600 shrink-0">
              <span className="text-red-700 font-semibold">1. Nama, Sabuk &amp; Tahun KTA</span>
              <span aria-hidden="true">→</span>
              <span className="text-slate-800 font-semibold">2. Ranting &amp; Alamat Lengkap</span>
              <span aria-hidden="true">→</span>
              <span>3. Foto &amp; Riwayat Sabuk</span>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">
              {!editingMember ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>
                    Pengisian data &amp; riwayat kenaikan tingkat sabuk dapat dilakukan langsung secara mandiri tanpa perlu login.
                  </span>
                </div>
              ) : isSelfServiceMandiriEdit ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-emerald-900">
                    Mode Mandiri: Anda dapat langsung memperbarui Tingkatan Sabuk, Tahun Dilantik Sabuk Putih, dan menambah Riwayat Naik Tingkat tanpa login.
                  </p>
                  <button
                    type="button"
                    onClick={onRequestSignIn}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-emerald-300 text-emerald-900 rounded-lg cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Masuk Google (Ubah Nama/Alamat)</span>
                  </button>
                </div>
              ) : (
                !isSignedIn && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-amber-900">
                      Masuk Google 1-klik untuk menyimpan perubahan pada data anggota yang sudah terdaftar.
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
                )
              )}

              {formSuccessBanner && (
                <div className="p-3 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>{formSuccessBanner}</span>
                </div>
              )}

              {formError && (
                <div className="p-3 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-lg">
                  {formError}
                </div>
              )}

              {/* Bagian 1: Identitas Pokok */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-800">1. Identitas &amp; Tingkatan Sabuk</p>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="font-mono">
                      {isBeltEligibleForKta(formSabuk) ? 'No. KTA:' : 'ID Calon:'} {formNia}
                    </span>
                    {(!editingMember ||
                      isAdmin ||
                      (editingMember.sabuk === 'Sabuk Kuning Mas' && isBeltEligibleForKta(formSabuk))) && (
                      <button
                        type="button"
                        onClick={() => setShowCustomNia((v) => !v)}
                        className="text-red-700 hover:underline font-medium cursor-pointer"
                      >
                        {showCustomNia ? 'Tutup' : 'Ubah Nomor'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nama Lengkap *
                    </label>
                    <input
                      ref={namaInputRef}
                      type="text"
                      required
                      disabled={isSelfServiceMandiriEdit}
                      autoComplete="name"
                      enterKeyHint="next"
                      value={formNama}
                      onChange={(e) => setFormNama(e.target.value)}
                      placeholder="Masukkan nama lengkap Anda"
                      className="w-full min-h-[44px] px-3.5 py-2.5 text-base sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700 disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Tingkatan Sabuk *
                      </label>
                      <select
                        value={formSabuk}
                        onChange={(e) => handleBeltChangeInForm(e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700"
                      >
                        {orderedBelts.map((b) => (
                          <option key={b.id} value={b.name}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Status
                      </label>
                      <select
                        disabled={isSelfServiceMandiriEdit}
                        value={formStatus}
                        onChange={(e) => setFormStatus(e.target.value as 'Aktif' | 'Cuti' | 'Alumni')}
                        className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700 disabled:bg-slate-100 disabled:text-slate-600"
                      >
                        <option value="Aktif">Aktif</option>
                        <option value="Cuti">Cuti</option>
                        <option value="Alumni">Alumni</option>
                      </select>
                    </div>
                  </div>

                  {isBeltEligibleForKta(formSabuk) ? (
                    <div className="sm:col-span-2 p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                      <div>
                        <label className="block text-xs font-semibold text-emerald-950 mb-1">
                          Tahun Dilantik Sabuk Putih (Nomor KTA) *
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={4}
                          value={formTahunPutih}
                          onChange={(e) => handleTahunPutihChangeInForm(e.target.value)}
                          placeholder="Contoh: 2024"
                          className="w-full min-h-[42px] px-3 py-2 text-base sm:text-sm font-mono bg-white border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                        />
                      </div>
                      <div className="text-xs text-emerald-900 space-y-0.5">
                        <p className="font-semibold">Siap Cetak KTA Resmi</p>
                        <p className="text-[11px] text-emerald-800">
                          Nomor KTA ditulis otomatis sesuai tahun dilantik menjadi Sabuk Putih:{' '}
                          <span className="font-mono font-bold">{formNia}</span>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="sm:col-span-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                      <p className="font-semibold">Sabuk Kuning Mas · Belum Memiliki Nomor &amp; Cetak KTA</p>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        Nomor KTA resmi baru ditulis saat anggota dilantik menjadi Sabuk Putih, dan cetak KTA hanya berlaku untuk Sabuk Putih ke atas.
                      </p>
                    </div>
                  )}

                  {showCustomNia && (
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nomor KTA / Induk Anggota (NIA) *
                      </label>
                      <input
                        type="text"
                        required
                        disabled={Boolean(
                          editingMember &&
                            !isAdmin &&
                            !(editingMember.sabuk === 'Sabuk Kuning Mas' && isBeltEligibleForKta(formSabuk))
                        )}
                        value={formNia}
                        onChange={(e) => {
                          setCustomNiaTouched(true);
                          setFormNia(e.target.value);
                        }}
                        placeholder="NRS-2026-001"
                        className={`w-full min-h-[44px] px-3.5 py-2.5 text-base sm:text-sm font-mono border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700 disabled:bg-slate-100 disabled:text-slate-500 ${
                          formNia && !niaValid ? 'border-red-400 bg-red-50/40' : 'border-slate-300'
                        }`}
                      />
                    </div>
                  )}
                </div>
                {!canEditPrivatePii && (
                  <p className="text-[11px] text-slate-500">
                    Anda dapat memperbarui Tingkatan Sabuk dan Riwayat Naik Tingkat secara langsung. Untuk mengubah Nama Lengkap, Alamat, atau Data Kontak pribadi, gunakan akun Google pendaftar atau Admin.
                  </p>
                )}
              </div>

              {/* Bagian 2: 2 Opsi Alamat (Otomatis Wilayah Indonesia vs Manual) */}
              <div className="pt-4 border-t border-slate-100 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      2. Alamat Lengkap &amp; Wilayah Ranting *
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {isSelfServiceMandiriEdit
                        ? 'Wilayah & alamat dikunci pada Mode Mandiri. Masuk Google untuk mengubahnya.'
                        : addressInputMode === 'auto'
                        ? 'Otomatis: pilih Provinsi, Kab/Kota, Kecamatan & Kelurahan se-Indonesia.'
                        : 'Manual: ketik langsung nama wilayah dan alamat domisili Anda.'}
                    </p>
                  </div>

                  {/* 2-Option Mode Switcher */}
                  <fieldset disabled={isSelfServiceMandiriEdit} className="contents">
                  <div
                    role="group"
                    aria-label="Pilih metode pengisian alamat"
                    className="inline-flex p-1 bg-slate-100 border border-slate-200 rounded-lg self-start"
                  >
                    <button
                      type="button"
                      disabled={isSelfServiceMandiriEdit}
                      onClick={() => {
                        setAddressInputMode('auto');
                        setIndoApiError('');
                        if (formProv && !selectedIndoProvId) {
                          const matched = findRegionItemByName(indoProvinces, formProv);
                          if (matched) {
                            setSelectedIndoProvId(matched.id);
                            void loadIndoRegenciesForProv(matched.id, formKab, formKec);
                          }
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                        addressInputMode === 'auto'
                          ? 'bg-red-700 text-white'
                          : 'text-slate-700 hover:bg-white'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>Otomatis (Indonesia)</span>
                    </button>
                    <button
                      type="button"
                      disabled={isSelfServiceMandiriEdit}
                      onClick={() => {
                        setAddressInputMode('manual');
                        setIndoApiError('');
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                        addressInputMode === 'manual'
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-700 hover:bg-white'
                      }`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Manual (Ketik)</span>
                    </button>
                  </div>
                  </fieldset>
                </div>

                <fieldset disabled={isSelfServiceMandiriEdit} className="space-y-3.5 disabled:opacity-70">
                {addressInputMode === 'auto' ? (
                  <div className="space-y-3">
                    {allRantingRegions.length > 0 && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                        <label className="block text-[11px] font-semibold text-slate-700">
                          Isi Cepat dari Ranting Terdaftar <span className="font-normal text-slate-500">(Opsional)</span>
                        </label>
                        <select
                          value={
                            allRantingRegions.some((r) => r.name === formRanting) ? formRanting : ''
                          }
                          onChange={(e) => applyQuickRanting(e.target.value)}
                          className="w-full min-h-[42px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700"
                        >
                          <option value="">-- Pilih cepat ranting terdaftar atau pilih provinsi di bawah --</option>
                          {allRantingRegions.map((r) => (
                            <option key={r.id} value={r.name}>
                              {r.name} ({[r.kecamatanName, r.kabupatenName, r.provinsiName].filter(Boolean).join(', ')})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {indoApiError && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
                        <span>{indoApiError}</span>
                        <div className="flex items-center gap-2">
                          {selectedIndoProvId && (
                            <button
                              type="button"
                              onClick={() => void loadIndoRegenciesForProv(selectedIndoProvId, formKab, formKec)}
                              className="px-2.5 py-1 font-semibold bg-white border border-amber-300 rounded cursor-pointer"
                            >
                              Coba Lagi
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setAddressInputMode('manual')}
                            className="px-2.5 py-1 font-semibold bg-slate-900 text-white rounded cursor-pointer"
                          >
                            Ganti ke Manual
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          1. Provinsi (Indonesia) *
                        </label>
                        <select
                          required
                          value={selectedIndoProvId}
                          onChange={(e) => {
                            const provId = e.target.value;
                            const provObj = indoProvinces.find((p) => p.id === provId);
                            const pName = provObj?.name || '';
                            setSelectedIndoProvId(provId);
                            setSelectedIndoRegencyId('');
                            setSelectedIndoDistrictId('');
                            setSelectedIndoVillageName('');
                            setIndoDistricts([]);
                            setIndoVillages([]);
                            setFormProv(pName);
                            setFormKab('');
                            setFormKec('');
                            syncAutoDomisiliAddress({
                              detailJalan: formDetailJalan,
                              provinsi: pName,
                            });
                            void loadIndoRegenciesForProv(provId);
                          }}
                          className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700"
                        >
                          <option value="">-- Pilih Provinsi di Indonesia --</option>
                          {indoProvinces.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        {!selectedIndoProvId && formProv && (
                          <p className="text-[11px] text-slate-500 mt-1">Saat ini: {formProv}</p>
                        )}
                      </div>

                      <div>
                        <label className="flex items-center justify-between text-xs font-medium text-slate-700 mb-1">
                          <span>2. Kabupaten / Kota *</span>
                          {indoLoading === 'kab' && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-red-700" />
                          )}
                        </label>
                        <select
                          required={indoRegencies.length > 0}
                          disabled={!selectedIndoProvId || indoLoading === 'kab'}
                          value={selectedIndoRegencyId}
                          onChange={(e) => {
                            const regId = e.target.value;
                            const regObj = indoRegencies.find((r) => r.id === regId);
                            const kName = regObj?.name || '';
                            setSelectedIndoRegencyId(regId);
                            setSelectedIndoDistrictId('');
                            setSelectedIndoVillageName('');
                            setIndoVillages([]);
                            setFormKab(kName);
                            setFormKec('');
                            syncAutoDomisiliAddress({
                              detailJalan: formDetailJalan,
                              kabupaten: kName,
                              provinsi: formProv,
                            });
                            void loadIndoDistrictsForRegency(regId);
                          }}
                          className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-700"
                        >
                          <option value="">
                            {indoLoading === 'kab'
                              ? 'Memuat Kab/Kota...'
                              : selectedIndoProvId
                              ? '-- Pilih Kabupaten / Kota --'
                              : 'Pilih Provinsi terlebih dahulu'}
                          </option>
                          {indoRegencies.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        {!selectedIndoRegencyId && formKab && (
                          <p className="text-[11px] text-slate-500 mt-1">Saat ini: {formKab}</p>
                        )}
                      </div>

                      <div>
                        <label className="flex items-center justify-between text-xs font-medium text-slate-700 mb-1">
                          <span>3. Kecamatan *</span>
                          {indoLoading === 'kec' && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-red-700" />
                          )}
                        </label>
                        <select
                          required={indoDistricts.length > 0}
                          disabled={!selectedIndoRegencyId || indoLoading === 'kec'}
                          value={selectedIndoDistrictId}
                          onChange={(e) => {
                            const distId = e.target.value;
                            const distObj = indoDistricts.find((d) => d.id === distId);
                            const kecName = distObj?.name || '';
                            setSelectedIndoDistrictId(distId);
                            setSelectedIndoVillageName('');
                            setFormKec(kecName);
                            syncAutoDomisiliAddress({
                              detailJalan: formDetailJalan,
                              kecamatan: kecName,
                              kabupaten: formKab,
                              provinsi: formProv,
                            });
                            void loadIndoVillagesForDistrict(distId);
                          }}
                          className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-700"
                        >
                          <option value="">
                            {indoLoading === 'kec'
                              ? 'Memuat Kecamatan...'
                              : selectedIndoRegencyId
                              ? '-- Pilih Kecamatan --'
                              : 'Pilih Kab/Kota terlebih dahulu'}
                          </option>
                          {indoDistricts.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                        {!selectedIndoDistrictId && formKec && (
                          <p className="text-[11px] text-slate-500 mt-1">Saat ini: {formKec}</p>
                        )}
                      </div>

                      <div>
                        <label className="flex items-center justify-between text-xs font-medium text-slate-700 mb-1">
                          <span>4. Desa / Kelurahan</span>
                          {indoLoading === 'kel' && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-red-700" />
                          )}
                        </label>
                        <select
                          disabled={!selectedIndoDistrictId || indoLoading === 'kel'}
                          value={selectedIndoVillageName}
                          onChange={(e) => {
                            const kel = e.target.value;
                            setSelectedIndoVillageName(kel);
                            syncAutoDomisiliAddress({
                              detailJalan: formDetailJalan,
                              kelurahan: kel,
                              kecamatan: formKec,
                              kabupaten: formKab,
                              provinsi: formProv,
                            });
                          }}
                          className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-700"
                        >
                          <option value="">
                            {indoLoading === 'kel'
                              ? 'Memuat Desa/Kelurahan...'
                              : selectedIndoDistrictId
                              ? '-- Pilih Desa / Kelurahan (Opsional) --'
                              : 'Pilih Kecamatan terlebih dahulu'}
                          </option>
                          {indoVillages.map((v) => (
                            <option key={v.id} value={v.name}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label className="block text-xs font-medium text-slate-700">
                            Ranting / Cabang Latihan *
                          </label>
                          {formKec && !formRanting && (
                            <button
                              type="button"
                              onClick={() =>
                                setFormRanting(
                                  `Ranting ${formKec.replace(/^Kecamatan\s+/i, '')}`
                                )
                              }
                              className="text-[11px] font-medium text-red-700 hover:underline cursor-pointer"
                            >
                              + Pakai nama Kecamatan
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          required
                          list="member-ranting-auto-datalist"
                          value={formRanting}
                          onChange={(e) => setFormRanting(e.target.value)}
                          placeholder="Contoh: Ranting Utama / Cabang Latihan"
                          className="w-full min-h-[44px] px-3.5 py-2 text-base sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700"
                        />
                        <datalist id="member-ranting-auto-datalist">
                          {formRantingNames.map((r) => (
                            <option key={r} value={r} />
                          ))}
                        </datalist>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Detail Jalan / Dusun / RT-RW / No. Rumah
                        </label>
                        <input
                          type="text"
                          value={formDetailJalan}
                          onChange={(e) => {
                            const jalan = e.target.value;
                            setFormDetailJalan(jalan);
                            syncAutoDomisiliAddress({
                              detailJalan: jalan,
                              kelurahan: selectedIndoVillageName,
                              kecamatan: formKec,
                              kabupaten: formKab,
                              provinsi: formProv,
                            });
                          }}
                          placeholder="Contoh: Jl. Merdeka No. 10, RT 02/RW 04"
                          className="w-full min-h-[44px] px-3.5 py-2 text-base sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Provinsi *</label>
                      <input
                        type="text"
                        required
                        list="member-prov-datalist"
                        value={formProv}
                        onChange={(e) => setFormProv(e.target.value)}
                        placeholder="Contoh: Jawa Tengah"
                        className="w-full min-h-[44px] px-3.5 py-2 text-base sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700"
                      />
                      <datalist id="member-prov-datalist">
                        {Array.from(
                          new Set([...indoProvinces.map((p) => p.name), ...formProvNames])
                        ).map((p) => (
                          <option key={p} value={p} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Kabupaten / Kota *
                      </label>
                      <input
                        type="text"
                        required
                        list="member-kab-datalist"
                        value={formKab}
                        onChange={(e) => setFormKab(e.target.value)}
                        placeholder="Contoh: Kabupaten Pemalang"
                        className="w-full min-h-[44px] px-3.5 py-2 text-base sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700"
                      />
                      <datalist id="member-kab-datalist">
                        {formKabNames.map((k) => (
                          <option key={k} value={k} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Kecamatan *</label>
                      <input
                        type="text"
                        required
                        list="member-kec-datalist"
                        value={formKec}
                        onChange={(e) => setFormKec(e.target.value)}
                        placeholder="Contoh: Kecamatan Taman"
                        className="w-full min-h-[44px] px-3.5 py-2 text-base sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700"
                      />
                      <datalist id="member-kec-datalist">
                        {formKecNames.map((k) => (
                          <option key={k} value={k} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Ranting / Cabang Latihan *
                      </label>
                      <input
                        type="text"
                        required
                        list="member-ranting-datalist"
                        value={formRanting}
                        onChange={(e) => setFormRanting(e.target.value)}
                        placeholder="Contoh: Ranting Utama"
                        className="w-full min-h-[44px] px-3.5 py-2 text-base sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700"
                      />
                      <datalist id="member-ranting-datalist">
                        {formRantingNames.map((r) => (
                          <option key={r} value={r} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Alamat Domisili Lengkap Anggota *
                    {addressInputMode === 'auto' && !isSelfServiceMandiriEdit && (
                      <span className="font-normal text-slate-500">
                        {' '}
                        (Terisi otomatis &amp; bisa diedit)
                      </span>
                    )}
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={formDomisili}
                    onChange={(e) => setFormDomisili(e.target.value)}
                    placeholder="Nama jalan, nomor rumah, RT/RW, Desa/Kelurahan, Kecamatan, Kab/Kota, Provinsi"
                    className="w-full px-3.5 py-2.5 text-base sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700 disabled:bg-slate-100 disabled:text-slate-600"
                  />
                </div>
                </fieldset>
              </div>

              {/* Bagian 3: Foto Profil & Data Opsional */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-800">
                    3. Foto Profil <span className="font-normal text-slate-400">(Opsional · Untuk KTA)</span>
                  </p>
                  {canEditPrivatePii && (
                    <button
                      type="button"
                      onClick={() => setShowOptionalFields((v) => !v)}
                      className="text-xs font-medium text-red-700 hover:underline cursor-pointer"
                    >
                      {showOptionalFields
                        ? 'Sembunyikan Data Kontak & Berkas'
                        : '+ Tambah No. WA, TTL & Berkas (Opsional)'}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {formFoto && (
                    <img
                      src={formFoto}
                      alt="Pratinjau foto anggota"
                      className="w-12 h-12 rounded-lg object-cover border border-slate-300 shrink-0"
                    />
                  )}
                  <label
                    className={`flex-1 flex items-center gap-2 min-h-[44px] px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg ${
                      isSelfServiceMandiriEdit
                        ? 'bg-slate-100 text-slate-500 cursor-not-allowed'
                        : 'bg-slate-50 hover:bg-slate-100 cursor-pointer'
                    }`}
                  >
                    <Upload className="w-4 h-4 text-slate-600 shrink-0" />
                    <span className="truncate">
                      {isSelfServiceMandiriEdit
                        ? 'Foto profil hanya dapat diubah setelah Masuk Google'
                        : formFoto
                        ? 'Ganti Foto Profil'
                        : 'Pilih Foto / Kamera (Opsional)'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isSelfServiceMandiriEdit}
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {showOptionalFields && canEditPrivatePii && (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <p className="text-[11px] font-semibold text-slate-700">
                      Data Kontak &amp; Berkas Tambahan (Opsional · Terproteksi)
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Nomor WhatsApp
                        </label>
                        <input
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          value={formWa}
                          onChange={(e) => setFormWa(e.target.value.replace(/[^\d+]/g, ''))}
                          placeholder="0812xxxxxxxx"
                          className={`w-full min-h-[42px] px-3 py-2 text-base sm:text-sm font-mono bg-white border rounded-lg ${
                            formWa && !waValid ? 'border-amber-400' : 'border-slate-300'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Tempat Lahir
                        </label>
                        <input
                          type="text"
                          value={formTempatLahir}
                          onChange={(e) => setFormTempatLahir(e.target.value)}
                          placeholder="Kota/Kabupaten"
                          className="w-full min-h-[42px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Tanggal Lahir
                        </label>
                        <input
                          type="date"
                          value={formTanggalLahir}
                          onChange={(e) => setFormTanggalLahir(e.target.value)}
                          className="w-full min-h-[42px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Berkas Persyaratan (PDF/Foto)
                        </label>
                        <label className="flex items-center gap-2 min-h-[42px] px-3 py-2 text-xs font-medium bg-white hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer">
                          <FileCheck className="w-4 h-4 text-slate-600 shrink-0" />
                          <span className="truncate">{formBerkasNama || 'Unggah Berkas (Maks 300KB)'}</span>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={handleBerkasUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-700 pt-1">
                      <label className="flex items-center gap-2 min-h-[38px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formChecklist.formulir}
                          onChange={(e) =>
                            setFormChecklist((p) => ({ ...p, formulir: e.target.checked }))
                          }
                        />
                        <span>Formulir</span>
                      </label>
                      <label className="flex items-center gap-2 min-h-[38px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formChecklist.ktpKk}
                          onChange={(e) => setFormChecklist((p) => ({ ...p, ktpKk: e.target.checked }))}
                        />
                        <span>KTP / KK</span>
                      </label>
                      <label className="flex items-center gap-2 min-h-[38px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formChecklist.suratSehat}
                          onChange={(e) =>
                            setFormChecklist((p) => ({ ...p, suratSehat: e.target.checked }))
                          }
                        />
                        <span>Surat Sehat</span>
                      </label>
                      <label className="flex items-center gap-2 min-h-[38px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formChecklist.foto}
                          onChange={(e) => setFormChecklist((p) => ({ ...p, foto: e.target.checked }))}
                        />
                        <span>Pas Foto</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Bagian 4: Riwayat Kenaikan Tingkat Sabuk (Bisa Diisi Mandiri) */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      4. Riwayat Naik Tingkat Sabuk <span className="font-normal text-slate-500">(Bisa diisi mandiri · {formRiwayat.length} catatan)</span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Catat riwayat kenaikan sabuk Anda sendiri. Jika mengisi pelantikan Sabuk Putih, tahun KTA otomatis disesuaikan.
                    </p>
                  </div>
                </div>

                {formRiwayat.length > 0 && (
                  <div className="space-y-2">
                    {formRiwayat.map((rec, idx) => {
                      const lockedExisting =
                        isSelfServiceMandiriEdit &&
                        idx < (editingMember?.riwayatTingkat?.length || 0);
                      return (
                        <div
                          key={`${rec.fromSabuk}-${rec.toSabuk}-${rec.tanggal}-${idx}`}
                          className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-start justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <p className="font-semibold text-slate-900">
                              {rec.fromSabuk} → {rec.toSabuk}{' '}
                              <span className="font-mono text-[11px] font-normal text-slate-500 ml-1">
                                ({rec.tanggal})
                              </span>
                            </p>
                            <p className="text-slate-600">
                              {rec.catatan} · <span className="text-slate-500">Penguji: {rec.penguji}</span>
                            </p>
                          </div>
                          {!lockedExisting && (
                            <button
                              type="button"
                              onClick={() =>
                                setFormRiwayat((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="p-1 text-slate-400 hover:text-red-700 cursor-pointer shrink-0"
                              title="Hapus baris riwayat ini"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                  <p className="text-[11px] font-semibold text-slate-700">
                    + Tambah Catatan Riwayat Naik Tingkat
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Dari Sabuk
                      </label>
                      <select
                        value={histFromSabuk}
                        onChange={(e) => setHistFromSabuk(e.target.value)}
                        className="w-full min-h-[40px] px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      >
                        {orderedBelts.map((b) => (
                          <option key={b.id} value={b.name}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Ke Sabuk
                      </label>
                      <select
                        value={histToSabuk}
                        onChange={(e) => setHistToSabuk(e.target.value)}
                        className="w-full min-h-[40px] px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      >
                        {orderedBelts.map((b) => (
                          <option key={b.id} value={b.name}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Tanggal Lantik / Ujian
                      </label>
                      <input
                        type="date"
                        value={histTanggal}
                        onChange={(e) => setHistTanggal(e.target.value)}
                        className="w-full min-h-[40px] px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      value={histPenguji}
                      onChange={(e) => setHistPenguji(e.target.value)}
                      placeholder="Nama Penguji / Pelatih"
                      className="w-full min-h-[40px] px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                    <input
                      type="text"
                      value={histCatatan}
                      onChange={(e) => setHistCatatan(e.target.value)}
                      placeholder="Catatan singkat (opsional)"
                      className="w-full min-h-[40px] px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddHistoryEntry}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambahkan ke Riwayat</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky Bottom Footer */}
            <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowMemberModal(false)}
                className="min-h-[44px] px-4 py-2 text-sm font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              {!editingMember && (
                <button
                  type="button"
                  disabled={formSubmitting}
                  onClick={() => saveMemberAction(true)}
                  className="min-h-[44px] px-4 py-2 text-sm font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-lg cursor-pointer disabled:opacity-60"
                >
                  {formSubmitting ? 'Menyimpan...' : 'Simpan & Tambah Lagi'}
                </button>
              )}
              <button
                type="submit"
                disabled={formSubmitting}
                className="min-h-[44px] px-5 py-2 text-sm font-semibold bg-red-700 hover:bg-red-800 text-white rounded-lg cursor-pointer disabled:opacity-60"
              >
                {formSubmitting
                  ? 'Menyimpan...'
                  : editingMember
                  ? 'Simpan Perubahan'
                  : 'Simpan Data Saya'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Naikkan Tingkat */}
      {promoteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white border border-slate-200 rounded-t-xl sm:rounded-xl max-w-lg w-full p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Naikkan Tingkat Sabuk Anggota</h2>
                <p className="text-xs text-slate-500">
                  {promoteTarget.namaLengkap} · <span className="font-mono">{promoteTarget.nia}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPromoteTarget(null)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPromote} className="space-y-4">
              {promoError && (
                <div className="p-3 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-lg">
                  {promoError}
                </div>
              )}
              {promoteTarget.ownerUid === 'mandiri' && !isSignedIn ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
                  Mode Mandiri: Anda dapat mencatat kenaikan tingkat dan riwayat sabuk anggota ini langsung tanpa login.
                </div>
              ) : (
                !isSignedIn && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-amber-900">
                      Masuk Google 1-klik untuk menyimpan kenaikan tingkat ke database.
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
                )
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pilih Anggota
                </label>
                <select
                  value={promoteTarget.id}
                  onChange={(e) => {
                    const found = editableMembersForPromo.find((m) => m.id === e.target.value);
                    if (found) openPromoteModal(found);
                  }}
                  className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg"
                >
                  {editableMembersForPromo.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nia} — {m.namaLengkap} ({m.sabuk})
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
                Sabuk Saat Ini: <strong className="text-slate-900">{promoteTarget.sabuk}</strong>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tingkatan Sabuk Tujuan *
                </label>
                <select
                  value={promoTargetSabuk}
                  onChange={(e) => {
                    const next = e.target.value;
                    setPromoTargetSabuk(next);
                    if (
                      promoteTarget.sabuk === 'Sabuk Kuning Mas' &&
                      isBeltEligibleForKta(next)
                    ) {
                      setPromoNewNia(generateNextNiaForBelt(next, promoTahunPutih));
                    }
                  }}
                  className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg"
                >
                  {orderedBelts.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Kenaikan *
                  </label>
                  <input
                    type="date"
                    required
                    value={promoTanggal}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPromoTanggal(val);
                      if (
                        promoteTarget.sabuk === 'Sabuk Kuning Mas' &&
                        isBeltEligibleForKta(promoTargetSabuk) &&
                        /^\d{4}/.test(val)
                      ) {
                        const yr = val.slice(0, 4);
                        setPromoTahunPutih(yr);
                        setPromoNewNia(generateNextNiaForBelt(promoTargetSabuk, yr));
                      }
                    }}
                    className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dewan Penguji / Pelatih *
                  </label>
                  <input
                    type="text"
                    required
                    value={promoPenguji}
                    onChange={(e) => setPromoPenguji(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {isBeltEligibleForKta(promoTargetSabuk) && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-emerald-950 mb-1">
                      Tahun Dilantik Sabuk Putih *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      required
                      value={promoTahunPutih}
                      onChange={(e) => {
                        const yr = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setPromoTahunPutih(yr);
                        if (
                          promoteTarget.sabuk === 'Sabuk Kuning Mas' &&
                          yr.length === 4
                        ) {
                          setPromoNewNia(generateNextNiaForBelt(promoTargetSabuk, yr));
                        }
                      }}
                      className="w-full min-h-[40px] px-3 py-1.5 text-sm font-mono bg-white border border-emerald-300 rounded-lg"
                    />
                  </div>
                  {promoteTarget.sabuk === 'Sabuk Kuning Mas' && (
                    <div>
                      <label className="block text-xs font-semibold text-emerald-950 mb-1">
                        Nomor KTA Resmi Baru
                      </label>
                      <input
                        type="text"
                        required
                        value={promoNewNia}
                        onChange={(e) => setPromoNewNia(e.target.value)}
                        className="w-full min-h-[40px] px-3 py-1.5 text-sm font-mono bg-white border border-emerald-300 rounded-lg"
                      />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Sejarah / Keterangan Ujian *
                </label>
                <textarea
                  required
                  rows={3}
                  value={promoCatatan}
                  onChange={(e) => setPromoCatatan(e.target.value)}
                  className="w-full px-3 py-2 text-base sm:text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPromoteTarget(null)}
                  className="min-h-[44px] px-4 py-2 text-sm font-medium bg-slate-100 text-slate-700 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={promoSaving}
                  className="min-h-[44px] px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg cursor-pointer disabled:opacity-60"
                >
                  {promoSaving ? 'Menyimpan...' : 'Catat Kenaikan Tingkat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Detail Anggota & PII + Riwayat */}
      {detailTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white border border-slate-200 rounded-t-xl sm:rounded-xl max-w-xl w-full p-5 sm:p-6 space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                {detailTarget.fotoProfil ? (
                  <img
                    src={detailTarget.fotoProfil}
                    alt={detailTarget.namaLengkap}
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 rounded-lg object-cover border border-slate-200"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-slate-900 text-white font-bold flex items-center justify-center">
                    {detailTarget.namaLengkap.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{detailTarget.namaLengkap}</h2>
                  <p className="text-xs font-mono text-slate-500">
                    {detailTarget.nia} · {detailTarget.sabuk} · {detailTarget.statusAktif}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isBeltEligibleForKta(detailTarget.sabuk, detailTarget.sabukOrder)
                      ? `Tahun Dilantik Sabuk Putih: ${
                          detailTarget.tahunDilantikPutih ||
                          detailTarget.nia.match(/^NRS-(\d{4})-/)?.[1] ||
                          '-'
                        } · Dapat cetak KTA`
                      : 'Sabuk Kuning Mas · Belum cetak KTA'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailTarget(null)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <p className="text-xs font-semibold text-slate-500">
                  Alamat Lengkap &amp; Wilayah Ranting (Terlihat Semua Orang)
                </p>
                <p className="text-slate-900 font-semibold">{getDisplayAddress(detailTarget)}</p>
                <p className="text-xs text-slate-600">
                  {detailTarget.ranting} · {detailTarget.kecamatan} · {detailTarget.kabupaten} ·{' '}
                  {detailTarget.provinsi}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 mb-2">
                  Data Kontak &amp; Berkas Pribadi (Terproteksi)
                </p>
                {detailLoading ? (
                  <p className="text-xs text-slate-500">Memuat data pribadi...</p>
                ) : detailPii ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                    <div>
                      <span className="text-slate-500 block">Tempat / Tanggal Lahir</span>
                      <span className="font-medium text-slate-900">
                        {detailPii.tempatLahir}, {detailPii.tanggalLahir}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Nomor WhatsApp</span>
                      <a
                        href={`https://wa.me/${detailPii.nomorWa.replace(/^0/, '62').replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono font-semibold text-emerald-700 hover:underline"
                      >
                        {detailPii.nomorWa}
                      </a>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-slate-500 block">Alamat Domisili Lengkap</span>
                      <span className="font-medium text-slate-900">{detailPii.alamatDomisili}</span>
                    </div>
                    {detailPii.berkasDataUrl && (
                      <div className="sm:col-span-2 pt-1">
                        <a
                          href={detailPii.berkasDataUrl}
                          download={detailPii.berkasNama || 'berkas-persyaratan'}
                          className="inline-flex items-center gap-1.5 text-red-700 font-medium hover:underline"
                        >
                          <FileCheck className="w-3.5 h-3.5" />
                          Unduh Berkas Persyaratan ({detailPii.berkasNama || 'Lampiran'})
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Data pribadi (WA, TTL, Alamat Domisili) hanya dapat diakses oleh Admin Pusat atau pendaftar akun terkait.
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 mb-2">
                  Kelengkapan Berkas Persyaratan
                </p>
                <div className="flex flex-wrap gap-3 text-xs text-slate-700">
                  {[
                    ['formulir', 'Formulir'],
                    ['ktpKk', 'KTP/KK'],
                    ['suratSehat', 'Surat Sehat'],
                    ['foto', 'Pas Foto'],
                  ].map(([key, label]) => {
                    const ok = detailTarget.berkasChecklist?.[key as keyof BerkasChecklist];
                    return (
                      <span key={key} className="inline-flex items-center gap-1">
                        <CheckCircle2
                          className={`w-3.5 h-3.5 ${ok ? 'text-emerald-600' : 'text-slate-300'}`}
                        />
                        {label}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 mb-2">
                  Riwayat Kenaikan Tingkat & Catatan Sejarah
                </p>
                {!detailTarget.riwayatTingkat || detailTarget.riwayatTingkat.length === 0 ? (
                  <p className="text-xs text-slate-500">Belum ada catatan kenaikan tingkat.</p>
                ) : (
                  <div className="space-y-2.5">
                    {detailTarget.riwayatTingkat.map((rec, i) => (
                      <div key={i} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                        <div className="flex items-center justify-between font-semibold text-slate-900">
                          <span>
                            {rec.fromSabuk} → {rec.toSabuk}
                          </span>
                          <span className="font-mono tabular-nums text-slate-500">{rec.tanggal}</span>
                        </div>
                        <p className="text-slate-600">{rec.catatan}</p>
                        <p className="text-slate-400">Penguji: {rec.penguji}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const m = detailTarget;
                  setDetailTarget(null);
                  openPromoteModal(m);
                }}
                className="min-h-[44px] px-4 py-2 text-xs font-medium bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg cursor-pointer"
              >
                Tambah Riwayat / Naikkan Tingkat
              </button>
              <button
                type="button"
                onClick={() => {
                  const m = detailTarget;
                  setDetailTarget(null);
                  openEditModal(m);
                }}
                className="min-h-[44px] px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg cursor-pointer"
              >
                Edit Profil Anggota
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Kelola Wilayah/Alamat (Admin Pusat Only) */}
      {showRegionModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white border border-slate-200 rounded-t-xl sm:rounded-xl max-w-3xl w-full p-5 sm:p-6 space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Kelola Hierarki Wilayah & Ranting</h2>
                <p className="text-xs text-slate-500">
                  Khusus Admin Pusat terverifikasi · Tambah atau perbarui Provinsi, Kab/Kota, Kecamatan, dan Ranting.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRegionModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRegionSubmit} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              {regError && (
                <div className="p-3 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-lg">
                  {regError}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                <span className="text-xs font-semibold text-slate-700">
                  Metode Pengisian Wilayah
                </span>
                <div className="inline-flex p-0.5 bg-white border border-slate-200 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setRegInputMode('auto')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                      regInputMode === 'auto' ? 'bg-red-700 text-white' : 'text-slate-700'
                    }`}
                  >
                    Otomatis (Indonesia)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegInputMode('manual')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                      regInputMode === 'manual' ? 'bg-slate-900 text-white' : 'text-slate-700'
                    }`}
                  >
                    Manual (Ketik)
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tingkat Wilayah</label>
                  <select
                    value={regLevel}
                    onChange={(e) => setRegLevel(e.target.value as RegionLevel)}
                    className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="provinsi">Provinsi</option>
                    <option value="kabupaten">Kabupaten / Kota</option>
                    <option value="kecamatan">Kecamatan</option>
                    <option value="ranting">Ranting / Cabang Latihan</option>
                  </select>
                </div>

                {regInputMode === 'auto' && regLevel === 'provinsi' ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Pilih Provinsi Indonesia *</label>
                    <select
                      required
                      value={regIndoProvId}
                      onChange={(e) => void handleRegIndoProvSelect(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="">-- Pilih Provinsi --</option>
                      {indoProvinces.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nama {regLevel === 'ranting' ? 'Ranting / Cabang' : 'Wilayah'} *
                    </label>
                    {regInputMode === 'auto' && regLevel === 'kabupaten' ? (
                      <select
                        required
                        disabled={!regIndoProvId || regIndoLoading}
                        value={regIndoRegId}
                        onChange={(e) => void handleRegIndoRegSelect(e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg disabled:bg-slate-100"
                      >
                        <option value="">
                          {regIndoLoading
                            ? 'Memuat Kab/Kota...'
                            : regIndoProvId
                            ? '-- Pilih Kab/Kota --'
                            : 'Pilih Induk Provinsi terlebih dahulu'}
                        </option>
                        {regIndoRegencies.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    ) : regInputMode === 'auto' && regLevel === 'kecamatan' ? (
                      <select
                        required
                        disabled={!regIndoRegId || regIndoLoading}
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg disabled:bg-slate-100"
                      >
                        <option value="">
                          {regIndoLoading
                            ? 'Memuat Kecamatan...'
                            : regIndoRegId
                            ? '-- Pilih Kecamatan --'
                            : 'Pilih Induk Kab/Kota terlebih dahulu'}
                        </option>
                        {regIndoDistricts.map((d) => (
                          <option key={d.id} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        required
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="Contoh: Ranting Cibinong Utara"
                        className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg"
                      />
                    )}
                  </div>
                )}

                {regLevel !== 'provinsi' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Induk Provinsi *</label>
                    {regInputMode === 'auto' ? (
                      <select
                        required
                        value={regIndoProvId}
                        onChange={(e) => void handleRegIndoProvSelect(e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg"
                      >
                        <option value="">-- Pilih Provinsi Indonesia --</option>
                        {indoProvinces.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <input
                          type="text"
                          required
                          list="admin-prov-list"
                          value={regProvName}
                          onChange={(e) => setRegProvName(e.target.value)}
                          placeholder="Jawa Tengah"
                          className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg"
                        />
                        <datalist id="admin-prov-list">
                          {Array.from(
                            new Set([...indoProvinces.map((p) => p.name), ...allProvinsiNames])
                          ).map((p) => (
                            <option key={p} value={p} />
                          ))}
                        </datalist>
                      </>
                    )}
                  </div>
                )}

                {(regLevel === 'kecamatan' || regLevel === 'ranting') && (
                  <div>
                    <label className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                      <span>Induk Kab/Kota *</span>
                      {regIndoLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-red-700" />}
                    </label>
                    {regInputMode === 'auto' && regIndoRegencies.length > 0 ? (
                      <select
                        required
                        value={regIndoRegId}
                        onChange={(e) => void handleRegIndoRegSelect(e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg"
                      >
                        <option value="">-- Pilih Kabupaten / Kota --</option>
                        {regIndoRegencies.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        required
                        value={regKabName}
                        onChange={(e) => setRegKabName(e.target.value)}
                        placeholder="Kabupaten Bogor"
                        className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg"
                      />
                    )}
                  </div>
                )}

                {regLevel === 'ranting' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Induk Kecamatan *</label>
                      {regInputMode === 'auto' && regIndoDistricts.length > 0 ? (
                        <select
                          required
                          value={regKecName}
                          onChange={(e) => setRegKecName(e.target.value)}
                          className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg"
                        >
                          <option value="">-- Pilih Kecamatan --</option>
                          {regIndoDistricts.map((d) => (
                            <option key={d.id} value={d.name}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          required
                          value={regKecName}
                          onChange={(e) => setRegKecName(e.target.value)}
                          placeholder="Kecamatan Cibinong"
                          className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg"
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Pelatih Utama</label>
                      <input
                        type="text"
                        value={regPelatih}
                        onChange={(e) => setRegPelatih(e.target.value)}
                        placeholder="Nama pelatih ranting"
                        className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Alamat Sekretariat Latihan</label>
                      <input
                        type="text"
                        value={regSekretariat}
                        onChange={(e) => setRegSekretariat(e.target.value)}
                        placeholder="Alamat lokasi latihan"
                        className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Jadwal Latihan</label>
                      <input
                        type="text"
                        value={regJadwal}
                        onChange={(e) => setRegJadwal(e.target.value)}
                        placeholder="Selasa & Jumat, 19.30 WIB"
                        className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end gap-2">
                {regEditingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setRegEditingId(undefined);
                      setRegName('');
                    }}
                    className="min-h-[44px] px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg cursor-pointer"
                  >
                    Batal Edit
                  </button>
                )}
                <button
                  type="submit"
                  disabled={regSaving}
                  className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-red-700 text-white rounded-lg hover:bg-red-800 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{regEditingId ? 'Perbarui Wilayah' : 'Simpan Wilayah'}</span>
                </button>
              </div>
            </form>

            {/* Existing Regions Table */}
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {regions.map((r) => (
                <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-4 bg-white text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      <span className="uppercase text-slate-500 font-mono mr-2">[{r.level}]</span>
                      {r.name}
                    </p>
                    {(r.provinsiName || r.kabupatenName || r.kecamatanName) && (
                      <p className="text-slate-500 truncate mt-0.5">
                        {[r.kecamatanName, r.kabupatenName, r.provinsiName].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setRegEditingId(r.id);
                        setRegInputMode('manual');
                        setRegLevel(r.level);
                        setRegName(r.name);
                        setRegProvName(r.provinsiName || '');
                        setRegKabName(r.kabupatenName || '');
                        setRegKecName(r.kecamatanName || '');
                        setRegSekretariat(r.alamatSekretariat || '');
                        setRegPelatih(r.pelatihUtama || '');
                        setRegJadwal(r.jadwalLatihan || '');
                      }}
                      className="text-slate-600 hover:text-slate-900 font-medium cursor-pointer py-1"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRegion(r.id)}
                      className="text-red-600 hover:text-red-800 font-medium cursor-pointer py-1"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
