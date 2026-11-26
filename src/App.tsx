import React, { useEffect, useState } from 'react';
import {
  Award,
  Bell,
  DatabaseBackup,
  ImagePlus,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AdminEmailRecord,
  AdminVaultDoc,
  AppTab,
  BackupLog,
  BeltLevel,
  Broadcast,
  DocumentationItem,
  Letter,
  Member,
  MemberPii,
  Region,
  RegionFilterState,
  ToolSection,
} from './types/org';
import {
  auth,
  db,
  logFirestoreError,
  OperationType,
  ORG_LOGO_PATH,
  ROOT_ADMIN_EMAIL,
} from './lib/firebase';
import {
  DEFAULT_BELT_LEVELS,
  DEFAULT_REGIONS,
  SAMPLE_MEMBERS_SEED,
} from './constants/beltsAndSeed';
import { FullBackupPayload, saveLocalAutoBackup } from './lib/exportBackup';
import { sanitizeId } from './lib/mediaUtils';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DashboardOverview } from './components/DashboardOverview';
import { MemberManagementView } from './components/MemberManagementView';
import { BeltClassificationView } from './components/BeltClassificationView';
import { ToolsHubView } from './components/ToolsHubView';
import { ExportBackupView } from './components/ExportBackupView';
import { CommunityHubView } from './components/CommunityHubView';
import { AdminEmailsModal } from './components/AdminEmailsModal';

function MainApp() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [showAdminEmailsModal, setShowAdminEmailsModal] = useState(false);
  const [addMemberSignal, setAddMemberSignal] = useState(0);

  // Navigation State
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [activeTool, setActiveTool] = useState<ToolSection>('kta');
  const [preselectedKtaMemberId, setPreselectedKtaMemberId] = useState<string | undefined>(undefined);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);

  // Data Collections
  const [regions, setRegions] = useState<Region[]>([]);
  const [beltLevels, setBeltLevels] = useState<BeltLevel[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [piiCache, setPiiCache] = useState<Record<string, MemberPii>>({});
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [letters, setLetters] = useState<Letter[]>([]);
  const [documentation, setDocumentation] = useState<DocumentationItem[]>([]);
  const [vaultDocs, setVaultDocs] = useState<AdminVaultDoc[]>([]);
  const [backupLogs, setBackupLogs] = useState<BackupLog[]>([]);
  const [adminEmails, setAdminEmails] = useState<AdminEmailRecord[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [syncWarning, setSyncWarning] = useState('');

  const [memberFilter, setMemberFilter] = useState<RegionFilterState>({
    provinsi: '',
    kabupaten: '',
    kecamatan: '',
    ranting: '',
    sabuk: '',
    search: '',
  });

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3200);
  };

  // Auth Listener & Admin Verification (Root Admin + UID Admins + 3 Email Admin Premium)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u && u.emailVerified) {
        const lowerEmail = (u.email || '').toLowerCase();
        if (lowerEmail === ROOT_ADMIN_EMAIL.toLowerCase()) {
          setIsAdmin(true);
        } else {
          try {
            const [adminSnap, emailAdminSnap] = await Promise.all([
              getDoc(doc(db, 'admins', u.uid)).catch(() => null),
              lowerEmail ? getDoc(doc(db, 'admin_emails', lowerEmail)).catch(() => null) : Promise.resolve(null),
            ]);
            setIsAdmin(Boolean(adminSnap?.exists() || emailAdminSnap?.exists()));
          } catch {
            setIsAdmin(false);
          }
        }
      } else {
        setIsAdmin(false);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const isSignedIn = Boolean(user && user.emailVerified);
  const currentUid = user?.uid || '';
  const currentUserName = user?.displayName || user?.email || 'Anggota Nursyah';

  // Real-time Firestore Subscriptions (public directory + community readable by everyone; vault/backups admin-only)
  useEffect(() => {
    if (!authReady) {
      return;
    }

    const unsubs: (() => void)[] = [];

    const qRegions = query(collection(db, 'regions'), where('orgCode', '==', 'NURSYAH'), limit(500));
    unsubs.push(
      onSnapshot(
        qRegions,
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Region));
          list.sort((a, b) => a.name.localeCompare(b.name));
          setRegions(list);
          setSyncWarning('');
        },
        (err) => setSyncWarning(logFirestoreError(err, OperationType.LIST, 'regions'))
      )
    );

    const qBelts = query(collection(db, 'belt_levels'), where('orgCode', '==', 'NURSYAH'), limit(50));
    unsubs.push(
      onSnapshot(
        qBelts,
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as BeltLevel));
          list.sort((a, b) => a.order - b.order);
          setBeltLevels(list);
        },
        (err) => setSyncWarning(logFirestoreError(err, OperationType.LIST, 'belt_levels'))
      )
    );

    const qMembers = query(collection(db, 'members'), where('orgCode', '==', 'NURSYAH'), limit(1500));
    unsubs.push(
      onSnapshot(
        qMembers,
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Member));
          list.sort((a, b) => a.nia.localeCompare(b.nia));
          setMembers(list);
        },
        (err) => setSyncWarning(logFirestoreError(err, OperationType.LIST, 'members'))
      )
    );

    const qBroadcasts = query(
      collection(db, 'broadcasts'),
      where('orgCode', '==', 'NURSYAH'),
      limit(100)
    );
    unsubs.push(
      onSnapshot(
        qBroadcasts,
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Broadcast));
          list.reverse();
          setBroadcasts(list);
        },
        (err) => setSyncWarning(logFirestoreError(err, OperationType.LIST, 'broadcasts'))
      )
    );

    const qLetters = query(collection(db, 'letters'), where('orgCode', '==', 'NURSYAH'), limit(200));
    unsubs.push(
      onSnapshot(
        qLetters,
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Letter));
          list.sort((a, b) => b.tanggalSurat.localeCompare(a.tanggalSurat));
          setLetters(list);
        },
        (err) => setSyncWarning(logFirestoreError(err, OperationType.LIST, 'letters'))
      )
    );

    const qDocs = query(
      collection(db, 'documentation'),
      where('orgCode', '==', 'NURSYAH'),
      limit(200)
    );
    unsubs.push(
      onSnapshot(
        qDocs,
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DocumentationItem));
          list.sort((a, b) => b.tanggalKegiatan.localeCompare(a.tanggalKegiatan));
          setDocumentation(list);
        },
        (err) => setSyncWarning(logFirestoreError(err, OperationType.LIST, 'documentation'))
      )
    );

    if (isSignedIn && isAdmin && user) {
      const qVault =
        user.email === ROOT_ADMIN_EMAIL
          ? query(collection(db, 'admin_vault'), limit(100))
          : query(collection(db, 'admin_vault'), where('uploadedByUid', '==', user.uid), limit(100));
      unsubs.push(
        onSnapshot(
          qVault,
          (snap) => {
            setVaultDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AdminVaultDoc)));
          },
          (err) => logFirestoreError(err, OperationType.LIST, 'admin_vault')
        )
      );

      const qBackups =
        user.email === ROOT_ADMIN_EMAIL
          ? query(collection(db, 'backups'), limit(50))
          : query(collection(db, 'backups'), where('createdByUid', '==', user.uid), limit(50));
      unsubs.push(
        onSnapshot(
          qBackups,
          (snap) => {
            setBackupLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BackupLog)));
          },
          (err) => logFirestoreError(err, OperationType.LIST, 'backups')
        )
      );

      const qAdminEmails =
        user.email?.toLowerCase() === ROOT_ADMIN_EMAIL.toLowerCase()
          ? query(collection(db, 'admin_emails'), limit(10))
          : query(collection(db, 'admin_emails'), where('addedBy', '==', user.uid), limit(10));
      unsubs.push(
        onSnapshot(
          qAdminEmails,
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AdminEmailRecord));
            list.sort((a, b) => a.slot - b.slot);
            setAdminEmails(list);
          },
          (err) => logFirestoreError(err, OperationType.LIST, 'admin_emails')
        )
      );
    } else {
      setVaultDocs([]);
      setBackupLogs([]);
      setAdminEmails([]);
    }

    if (!isSignedIn) {
      setPiiCache({});
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, user, isAdmin, isSignedIn]);

  // Automatic Local Backup on Data Sync
  useEffect(() => {
    if (members.length > 0 || regions.length > 0) {
      saveLocalAutoBackup({ regions, beltLevels, members, broadcasts, letters });
    }
  }, [regions, beltLevels, members, broadcasts, letters]);

  const handleSignIn = async () => {
    setAuthError('');
    setSigningIn(true);
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      if (cred.user && !cred.user.emailVerified) {
        setAuthError('Email Google Anda belum terverifikasi. Gunakan akun Google dengan email terverifikasi.');
      } else {
        setShowSignInModal(false);
        showToast(`Selamat datang, ${cred.user.displayName || cred.user.email || 'Anggota'}.`);
      }
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-blocked') {
        setAuthError('Jendela popup Google diblokir browser. Izinkan popup untuk situs ini lalu klik Masuk lagi.');
      } else if (code === 'auth/popup-closed-by-user') {
        setAuthError('Login dibatalkan sebelum selesai.');
      } else {
        setAuthError(err instanceof Error ? err.message : 'Gagal masuk dengan Google.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    showToast('Anda telah keluar dari akun.');
  };

  // Admin 1-Click Data Bootstrap
  const handleBootstrapData = async () => {
    if (!user || !isAdmin) return;
    setSeeding(true);
    try {
      const batch = writeBatch(db);
      DEFAULT_BELT_LEVELS.forEach((b) => {
        const { id, ...beltPayload } = b;
        batch.set(doc(db, 'belt_levels', id), {
          ...beltPayload,
          updatedAt: serverTimestamp(),
        });
      });
      DEFAULT_REGIONS.forEach((r) => {
        const { id, ...regionPayload } = r;
        batch.set(doc(db, 'regions', id), {
          ...regionPayload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      SAMPLE_MEMBERS_SEED.forEach((m) => {
        const { pii, id, ...publicFields } = m;
        batch.set(doc(db, 'members', id), {
          ...publicFields,
          ownerUid: user.uid,
          orgCode: 'NURSYAH',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'members', id, 'private', 'pii'), {
          ...pii,
          ownerUid: user.uid,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      showToast('Data awal wilayah, 19 tingkatan sabuk, dan contoh anggota berhasil dimuat.');
    } catch (err) {
      showToast(logFirestoreError(err, OperationType.WRITE, 'bootstrap'));
    } finally {
      setSeeding(false);
    }
  };

  // CRUD Handlers
  const handleCreateMember = async (
    memberData: Omit<Member, 'id' | 'ownerUid' | 'orgCode' | 'createdAt' | 'updatedAt'>,
    piiData: Omit<MemberPii, 'ownerUid' | 'updatedAt'> | null
  ) => {
    const ownerUid = user && user.emailVerified ? user.uid : 'mandiri';
    const memberId = `mbr-${Date.now()}-${sanitizeId(memberData.nia).slice(0, 24)}`;
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'members', memberId), {
        ...memberData,
        riwayatTingkat: [],
        sabukOrder: Math.round(Number(memberData.sabukOrder)),
        ...(memberData.alamatLengkap ? { alamatLengkap: memberData.alamatLengkap.slice(0, 350) } : {}),
        ownerUid,
        orgCode: 'NURSYAH',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (piiData) {
        batch.set(doc(db, 'members', memberId, 'private', 'pii'), {
          ...piiData,
          ownerUid,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      if (piiData) {
        setPiiCache((prev) => ({
          ...prev,
          [memberId]: { ...piiData, ownerUid },
        }));
      }
      showToast(`Data ${memberData.namaLengkap} berhasil disimpan.`);
    } catch (err) {
      throw new Error(logFirestoreError(err, OperationType.CREATE, `members/${memberId}`));
    }
  };

  const handleUpdateMember = async (
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
      fotoProfil?: string;
      statusAktif: 'Aktif' | 'Cuti' | 'Alumni';
      berkasChecklist: Member['berkasChecklist'];
    },
    piiData: Omit<MemberPii, 'ownerUid' | 'updatedAt'> | null
  ) => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      const memberPayload: Record<string, unknown> = {
        namaLengkap: memberUpdates.namaLengkap.slice(0, 120),
        provinsi: memberUpdates.provinsi.slice(0, 120),
        kabupaten: memberUpdates.kabupaten.slice(0, 120),
        kecamatan: memberUpdates.kecamatan.slice(0, 120),
        ranting: memberUpdates.ranting.slice(0, 120),
        alamatLengkap: (memberUpdates.alamatLengkap || '').slice(0, 350),
        sabuk: memberUpdates.sabuk.slice(0, 60),
        sabukOrder: Math.round(Number(memberUpdates.sabukOrder)),
        statusAktif: memberUpdates.statusAktif,
        berkasChecklist: memberUpdates.berkasChecklist,
        updatedAt: serverTimestamp(),
      };
      if (isAdmin) {
        memberPayload.nia = memberUpdates.nia;
      }
      if (memberUpdates.fotoProfil) {
        memberPayload.fotoProfil = memberUpdates.fotoProfil;
      }
      batch.update(doc(db, 'members', member.id), memberPayload);

      if (piiData && (isAdmin || member.ownerUid === user.uid)) {
        const piiRef = doc(db, 'members', member.id, 'private', 'pii');
        const existingPiiSnap = await getDoc(piiRef).catch(() => null);
        if (existingPiiSnap?.exists()) {
          batch.update(piiRef, {
            ...piiData,
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(piiRef, {
            ...piiData,
            ownerUid: user.uid,
            updatedAt: serverTimestamp(),
          });
        }
      }

      await batch.commit();
      if (piiData && (isAdmin || member.ownerUid === user.uid)) {
        setPiiCache((prev) => ({
          ...prev,
          [member.id]: { ...piiData, ownerUid: member.ownerUid },
        }));
      }
      showToast(`Data ${memberUpdates.namaLengkap} berhasil diperbarui.`);
    } catch (err) {
      throw new Error(logFirestoreError(err, OperationType.UPDATE, `members/${member.id}`));
    }
  };

  const handlePromoteMember = async (
    member: Member,
    toSabuk: string,
    toSabukOrder: number,
    tanggal: string,
    penguji: string,
    catatan: string
  ) => {
    const newRecord = {
      fromSabuk: member.sabuk,
      toSabuk,
      tanggal,
      penguji,
      catatan,
    };
    const updatedHistory = [...(member.riwayatTingkat || []), newRecord].slice(-25);
    try {
      await updateDoc(doc(db, 'members', member.id), {
        sabuk: toSabuk,
        sabukOrder: Math.round(Number(toSabukOrder)),
        riwayatTingkat: updatedHistory,
        updatedAt: serverTimestamp(),
      });
      showToast(`${member.namaLengkap} naik ke ${toSabuk}.`);
    } catch (err) {
      throw new Error(logFirestoreError(err, OperationType.UPDATE, `members/${member.id}`));
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    try {
      await deleteDoc(doc(db, 'members', memberId, 'private', 'pii')).catch(() => {});
      await deleteDoc(doc(db, 'members', memberId));
      showToast('Data anggota telah dihapus.');
    } catch (err) {
      showToast(logFirestoreError(err, OperationType.DELETE, `members/${memberId}`));
    }
  };

  const handleLoadMemberPii = async (memberId: string): Promise<MemberPii | null> => {
    if (piiCache[memberId]) return piiCache[memberId];
    try {
      const snap = await getDoc(doc(db, 'members', memberId, 'private', 'pii'));
      if (snap.exists()) {
        const data = snap.data() as MemberPii;
        setPiiCache((prev) => ({ ...prev, [memberId]: data }));
        return data;
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleSaveRegion = async (region: Omit<Region, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const regId = region.id || `${region.level}-${sanitizeId(region.name) || 'wil'}-${Date.now().toString().slice(-4)}`;
    const cleanPayload: Record<string, unknown> = {
      level: region.level,
      name: region.name.slice(0, 120),
      orgCode: 'NURSYAH',
      updatedAt: serverTimestamp(),
    };
    if (region.provinsiName) cleanPayload.provinsiName = region.provinsiName.slice(0, 120);
    if (region.kabupatenName) cleanPayload.kabupatenName = region.kabupatenName.slice(0, 120);
    if (region.kecamatanName) cleanPayload.kecamatanName = region.kecamatanName.slice(0, 120);
    if (region.alamatSekretariat) cleanPayload.alamatSekretariat = region.alamatSekretariat.slice(0, 300);
    if (region.pelatihUtama) cleanPayload.pelatihUtama = region.pelatihUtama.slice(0, 120);
    if (region.jadwalLatihan) cleanPayload.jadwalLatihan = region.jadwalLatihan.slice(0, 160);

    try {
      if (region.id) {
        await updateDoc(doc(db, 'regions', regId), cleanPayload);
      } else {
        await setDoc(doc(db, 'regions', regId), {
          ...cleanPayload,
          createdAt: serverTimestamp(),
        });
      }
      showToast(`Wilayah ${region.name} berhasil disimpan.`);
    } catch (err) {
      throw new Error(logFirestoreError(err, OperationType.WRITE, `regions/${regId}`));
    }
  };

  const handleDeleteRegion = async (regionId: string) => {
    try {
      await deleteDoc(doc(db, 'regions', regionId));
      showToast('Data wilayah dihapus.');
    } catch (err) {
      showToast(logFirestoreError(err, OperationType.DELETE, `regions/${regionId}`));
    }
  };

  const handleSaveBeltNote = async (level: BeltLevel, sejarah: string, kurikulum: string) => {
    try {
      await updateDoc(doc(db, 'belt_levels', level.id), {
        sejarah,
        kurikulum,
        updatedAt: serverTimestamp(),
      });
      showToast(`Catatan sejarah ${level.name} diperbarui.`);
    } catch (err) {
      showToast(logFirestoreError(err, OperationType.UPDATE, `belt_levels/${level.id}`));
    }
  };

  const handleSendBroadcast = async (
    data: Omit<Broadcast, 'id' | 'pengirimUid' | 'orgCode' | 'createdAt'>
  ) => {
    if (!user) return;
    const id = `blast-${Date.now()}`;
    try {
      await setDoc(doc(db, 'broadcasts', id), {
        ...data,
        pengirimUid: user.uid,
        orgCode: 'NURSYAH',
        createdAt: serverTimestamp(),
      });
      showToast('Informasi berhasil dikirim ke semua anggota.');
    } catch (err) {
      throw new Error(logFirestoreError(err, OperationType.CREATE, `broadcasts/${id}`));
    }
  };

  const handleDeleteBroadcast = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'broadcasts', id));
    } catch (err) {
      showToast(logFirestoreError(err, OperationType.DELETE, `broadcasts/${id}`));
    }
  };

  const handleSaveLetter = async (
    data: Omit<Letter, 'id' | 'authorUid' | 'orgCode' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!user) return;
    const id = `ltr-${Date.now()}`;
    try {
      await setDoc(doc(db, 'letters', id), {
        ...data,
        authorUid: user.uid,
        orgCode: 'NURSYAH',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast(`Surat ${data.nomorSurat} berhasil disimpan.`);
    } catch (err) {
      throw new Error(logFirestoreError(err, OperationType.CREATE, `letters/${id}`));
    }
  };

  const handleDistributeLetter = async (letter: Letter) => {
    try {
      await updateDoc(doc(db, 'letters', letter.id), {
        statusDistribusi: 'Terkirim',
        updatedAt: serverTimestamp(),
      });
      showToast(`Surat ${letter.nomorSurat} telah didistribusikan.`);
    } catch (err) {
      showToast(logFirestoreError(err, OperationType.UPDATE, `letters/${letter.id}`));
    }
  };

  const handleDeleteLetter = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'letters', id));
    } catch (err) {
      showToast(logFirestoreError(err, OperationType.DELETE, `letters/${id}`));
    }
  };

  const handleUploadDocumentationBatch = async (
    items: Omit<DocumentationItem, 'id' | 'uploaderUid' | 'uploaderName' | 'orgCode' | 'createdAt'>[]
  ) => {
    if (!user || items.length === 0) return;
    const stamp = Date.now();
    const rawName = (user.displayName || user.email || 'Anggota').slice(0, 120);
    const uploaderName = rawName.length >= 2 ? rawName : 'Anggota';
    const limited = items.slice(0, 12);

    try {
      for (let i = 0; i < limited.length; i += 4) {
        const chunk = limited.slice(i, i + 4);
        const batch = writeBatch(db);
        chunk.forEach((item, offset) => {
          const id = `doc-${stamp}-${i + offset}`;
          batch.set(doc(db, 'documentation', id), {
            ...item,
            uploaderUid: user.uid,
            uploaderName,
            orgCode: 'NURSYAH',
            createdAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
      showToast(
        limited.length > 1
          ? `${limited.length} foto & dokumentasi berhasil diunggah.`
          : 'Dokumentasi kegiatan berhasil diunggah.'
      );
    } catch (err) {
      throw new Error(logFirestoreError(err, OperationType.CREATE, 'documentation/batch'));
    }
  };

  const handleDeleteDocumentation = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'documentation', id));
    } catch (err) {
      showToast(logFirestoreError(err, OperationType.DELETE, `documentation/${id}`));
    }
  };

  const handleUploadVaultDoc = async (
    data: Omit<AdminVaultDoc, 'id' | 'uploadedByUid' | 'uploadedByEmail' | 'createdAt'>
  ) => {
    if (!user || !isAdmin) return;
    const id = `vault-${Date.now()}`;
    try {
      await setDoc(doc(db, 'admin_vault', id), {
        ...data,
        uploadedByUid: user.uid,
        uploadedByEmail: user.email || ROOT_ADMIN_EMAIL,
        createdAt: serverTimestamp(),
      });
      showToast('Dokumen berhasil disimpan ke Brankas Admin.');
    } catch (err) {
      throw new Error(logFirestoreError(err, OperationType.CREATE, `admin_vault/${id}`));
    }
  };

  const handleDeleteVaultDoc = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'admin_vault', id));
    } catch (err) {
      showToast(logFirestoreError(err, OperationType.DELETE, `admin_vault/${id}`));
    }
  };

  const handleLogCloudBackup = async (triggerType: 'otomatis' | 'manual') => {
    if (!user || !isAdmin) return;
    const id = `bkp-${Date.now()}`;
    try {
      await setDoc(doc(db, 'backups', id), {
        triggerType,
        totalMembers: members.length,
        totalRegions: regions.length,
        totalLetters: letters.length,
        createdByUid: user.uid,
        createdAt: serverTimestamp(),
      });
      showToast('Snapshot backup tercatat.');
    } catch (err) {
      showToast(logFirestoreError(err, OperationType.CREATE, `backups/${id}`));
    }
  };

  const handleSaveAdminEmail = async (
    slot: 1 | 2 | 3,
    email: string,
    nama: string,
    jabatan: string
  ) => {
    if (!user || !isAdmin) return;
    const cleanEmail = email.trim().toLowerCase();
    const oldInSlot = adminEmails.find((a) => a.slot === slot && a.email !== cleanEmail);
    const existingSameEmail = adminEmails.find((a) => a.email === cleanEmail);

    try {
      const batch = writeBatch(db);
      if (oldInSlot) {
        batch.delete(doc(db, 'admin_emails', oldInSlot.id));
      }
      if (existingSameEmail) {
        batch.update(doc(db, 'admin_emails', cleanEmail), {
          slot,
          nama: nama.slice(0, 120),
          jabatan: jabatan.slice(0, 120),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(doc(db, 'admin_emails', cleanEmail), {
          slot,
          email: cleanEmail,
          nama: nama.slice(0, 120),
          jabatan: jabatan.slice(0, 120),
          addedBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      showToast(`Email Admin Premium Slot ${slot} berhasil disimpan.`);
    } catch (err) {
      throw new Error(logFirestoreError(err, OperationType.WRITE, `admin_emails/${cleanEmail}`));
    }
  };

  const handleRemoveAdminEmail = async (emailId: string) => {
    if (!user || !isAdmin) return;
    try {
      await deleteDoc(doc(db, 'admin_emails', emailId));
      showToast(`Akses Admin Premium untuk ${emailId} dihapus.`);
    } catch (err) {
      throw new Error(logFirestoreError(err, OperationType.DELETE, `admin_emails/${emailId}`));
    }
  };

  const handleRestoreBackup = async (payload: FullBackupPayload) => {
    if (!user || !isAdmin) return;
    const batch = writeBatch(db);
    payload.regions.slice(0, 150).forEach((r) => {
      batch.set(doc(db, 'regions', r.id), {
        level: r.level,
        name: r.name,
        ...(r.provinsiName ? { provinsiName: r.provinsiName } : {}),
        ...(r.kabupatenName ? { kabupatenName: r.kabupatenName } : {}),
        ...(r.kecamatanName ? { kecamatanName: r.kecamatanName } : {}),
        orgCode: 'NURSYAH',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    payload.members.slice(0, 200).forEach((m) => {
      batch.set(doc(db, 'members', m.id), {
        nia: m.nia,
        namaLengkap: m.namaLengkap,
        provinsi: m.provinsi,
        kabupaten: m.kabupaten,
        kecamatan: m.kecamatan,
        ranting: m.ranting,
        ...(m.alamatLengkap ? { alamatLengkap: m.alamatLengkap.slice(0, 350) } : {}),
        sabuk: m.sabuk,
        sabukOrder: m.sabukOrder,
        ...(m.fotoProfil ? { fotoProfil: m.fotoProfil } : {}),
        statusAktif: m.statusAktif,
        riwayatTingkat: m.riwayatTingkat || [],
        berkasChecklist: m.berkasChecklist || { formulir: true, ktpKk: true, suratSehat: false, foto: false },
        ownerUid: user.uid,
        orgCode: 'NURSYAH',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
    showToast('Data cadangan berhasil dipulihkan ke database.');
  };

  // Loading Auth Splash
  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <img
            src={ORG_LOGO_PATH}
            alt="Logo Aliran Nursyah"
            referrerPolicy="no-referrer"
            className="w-16 h-16 mx-auto rounded-xl object-contain border border-slate-200 bg-white p-1"
          />
          <p className="text-sm font-medium text-slate-600">Memuat Sistem Aliran Nursyah...</p>
        </div>
      </div>
    );
  }

  const navItems: { id: AppTab; shortLabel: string; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', shortLabel: 'Beranda', label: 'Beranda', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'members', shortLabel: 'Anggota', label: 'Data Anggota', icon: <Users className="w-4 h-4" /> },
    { id: 'hub', shortLabel: 'Kenangan', label: 'Kenangan & Info', icon: <ImagePlus className="w-4 h-4" /> },
    { id: 'belts', shortLabel: 'Sabuk', label: 'Tingkatan Sabuk', icon: <Award className="w-4 h-4" /> },
    { id: 'tools', shortLabel: 'Alat', label: 'Alat & Surat', icon: <Wrench className="w-4 h-4" /> },
    { id: 'backup', shortLabel: 'Backup', label: 'Ekspor & Backup', icon: <DatabaseBackup className="w-4 h-4" /> },
  ];

  const activeTitle = navItems.find((n) => n.id === activeTab)?.label || 'Beranda';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-slate-900 text-slate-100 border-r border-slate-800">
        <div className="p-5 border-b border-slate-800 flex items-center gap-3">
          <img
            src={ORG_LOGO_PATH}
            alt="Aliran Nursyah"
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-lg object-contain bg-white p-0.5 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">Aliran Nursyah</p>
            <p className="text-xs text-slate-400 truncate">PPSI · Portal Organisasi</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                  active
                    ? 'bg-red-700 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-3">
          {isSignedIn && user ? (
            <>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">
                  {user.displayName || 'Pengguna Terverifikasi'}
                </p>
                <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                {isAdmin && (
                  <p className="text-[11px] text-amber-400 font-medium mt-0.5 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Admin Premium
                  </p>
                )}
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAdminEmailsModal(true)}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-amber-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Kelola 3 Email Admin</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar Akun</span>
              </button>
            </>
          ) : (
            <>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Isi data anggota langsung tanpa login. Masuk Google khusus Pengurus / Admin.
              </p>
              <button
                type="button"
                onClick={() => setShowSignInModal(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Masuk Pengurus</span>
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen pb-20 lg:pb-0">
        {/* Sticky Top Header Bar */}
        <header className="sticky top-0 z-30 h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
              aria-label="Buka menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-sm font-bold text-slate-900 truncate whitespace-nowrap">
              Aliran Nursyah · {activeTitle}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowNotifDrawer((v) => !v)}
              className="relative p-2 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              aria-label="Notifikasi Pengumuman"
            >
              <Bell className="w-4 h-4" />
              {broadcasts.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 px-1 text-[10px] font-mono font-bold bg-red-700 text-white rounded">
                  {broadcasts.length}
                </span>
              )}
            </button>
            {!isSignedIn && (
              <button
                type="button"
                onClick={() => setShowSignInModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Masuk Pengurus</span>
              </button>
            )}
          </div>
        </header>

        {/* Notification Drawer */}
        {showNotifDrawer && (
          <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-900">
                Notifikasi Broadcast Terbaru ({broadcasts.length})
              </p>
              <button
                type="button"
                onClick={() => setShowNotifDrawer(false)}
                className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Tutup
              </button>
            </div>
            {broadcasts.length === 0 ? (
              <p className="text-xs text-slate-500">Belum ada pengumuman broadcast.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {broadcasts.slice(0, 4).map((b) => (
                  <div key={b.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                    <p className="font-semibold text-slate-900">{b.judul}</p>
                    <p className="text-slate-600 line-clamp-2 mt-0.5">{b.isiPesan}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Toast Feedback */}
        {toastMsg && (
          <div className="fixed bottom-20 lg:bottom-6 right-4 sm:right-6 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-3 rounded-lg shadow-lg border border-slate-700">
            {toastMsg}
          </div>
        )}

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-4">
          {syncWarning && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center justify-between gap-3">
              <span>{syncWarning}</span>
              <button
                type="button"
                onClick={() => setSyncWarning('')}
                className="font-semibold underline cursor-pointer shrink-0"
              >
                Tutup
              </button>
            </div>
          )}
          {activeTab === 'dashboard' && (
            <DashboardOverview
              members={members}
              regions={regions}
              beltLevels={beltLevels}
              broadcasts={broadcasts}
              letters={letters}
              documentation={documentation}
              isAdmin={isAdmin}
              seeding={seeding}
              onBootstrapData={handleBootstrapData}
              onNavigateTab={setActiveTab}
              onOpenSelfRegistration={() => {
                setActiveTab('members');
                setAddMemberSignal((n) => n + 1);
              }}
              onOpenAdminEmailsModal={() => setShowAdminEmailsModal(true)}
              onOpenTool={(tool) => {
                setActiveTool(tool);
                setActiveTab('tools');
              }}
            />
          )}

          {activeTab === 'members' && (
            <MemberManagementView
              members={members}
              regions={regions}
              beltLevels={beltLevels}
              piiCache={piiCache}
              isAdmin={isAdmin}
              isSignedIn={isSignedIn}
              currentUid={currentUid}
              filter={memberFilter}
              openAddSignal={addMemberSignal}
              onChangeFilter={setMemberFilter}
              onRequestSignIn={() => setShowSignInModal(true)}
              onCreateMember={handleCreateMember}
              onUpdateMember={handleUpdateMember}
              onPromoteMember={handlePromoteMember}
              onDeleteMember={handleDeleteMember}
              onLoadMemberPii={handleLoadMemberPii}
              onSaveRegion={handleSaveRegion}
              onDeleteRegion={handleDeleteRegion}
              onOpenKtaPreview={(member) => {
                setPreselectedKtaMemberId(member.id);
                setActiveTool('kta');
                setActiveTab('tools');
              }}
            />
          )}

          {activeTab === 'hub' && (
            <CommunityHubView
              broadcasts={broadcasts}
              documentation={documentation}
              regions={regions}
              beltLevels={beltLevels}
              isAdmin={isAdmin}
              isSignedIn={isSignedIn}
              currentUid={currentUid}
              currentUserName={currentUserName}
              onRequestSignIn={() => setShowSignInModal(true)}
              onSendBroadcast={handleSendBroadcast}
              onDeleteBroadcast={handleDeleteBroadcast}
              onUploadDocumentationBatch={handleUploadDocumentationBatch}
              onDeleteDocumentation={handleDeleteDocumentation}
            />
          )}

          {activeTab === 'belts' && (
            <BeltClassificationView
              beltLevels={beltLevels}
              members={members}
              isAdmin={isAdmin}
              onSaveBeltNote={handleSaveBeltNote}
            />
          )}

          {activeTab === 'tools' && (
            <ToolsHubView
              activeTool={activeTool}
              onSelectTool={setActiveTool}
              members={members}
              regions={regions}
              beltLevels={beltLevels}
              broadcasts={broadcasts}
              letters={letters}
              documentation={documentation}
              vaultDocs={vaultDocs}
              isAdmin={isAdmin}
              isSignedIn={isSignedIn}
              currentUid={currentUid}
              currentUserName={currentUserName}
              preselectedKtaMemberId={preselectedKtaMemberId}
              onRequestSignIn={() => setShowSignInModal(true)}
              onOpenAdminEmailsModal={() => setShowAdminEmailsModal(true)}
              onSendBroadcast={handleSendBroadcast}
              onDeleteBroadcast={handleDeleteBroadcast}
              onSaveLetter={handleSaveLetter}
              onDistributeLetter={handleDistributeLetter}
              onDeleteLetter={handleDeleteLetter}
              onUploadDocumentationBatch={handleUploadDocumentationBatch}
              onDeleteDocumentation={handleDeleteDocumentation}
              onUploadVaultDoc={handleUploadVaultDoc}
              onDeleteVaultDoc={handleDeleteVaultDoc}
            />
          )}

          {activeTab === 'backup' && (
            <ExportBackupView
              members={members}
              regions={regions}
              beltLevels={beltLevels}
              broadcasts={broadcasts}
              letters={letters}
              piiCache={piiCache}
              backupLogs={backupLogs}
              isAdmin={isAdmin}
              onLogCloudBackup={handleLogCloudBackup}
              onRestoreBackup={handleRestoreBackup}
            />
          )}
        </main>
      </div>

      {/* Non-Blocking Google Sign-In Modal */}
      {showSignInModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
          onClick={() => setShowSignInModal(false)}
        >
          <div
            className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 space-y-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src={ORG_LOGO_PATH}
                  alt="Logo Aliran Nursyah"
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-xl object-contain border border-slate-200 bg-white p-1 shrink-0"
                />
                <div>
                  <p className="text-xs font-semibold text-red-700">Aliran Nursyah · PPSI</p>
                  <h2 className="text-base font-bold text-slate-900">Masuk dengan Akun Google</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSignInModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg cursor-pointer"
                aria-label="Tutup dialog masuk"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">
              Pengisian data diri anggota baru dapat dilakukan langsung tanpa login. Masuk dengan Google diperlukan untuk Pengurus/Admin, mengubah data anggota lama, mengunggah galeri, atau mengirim pengumuman.
            </p>

            {authError && (
              <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
                {authError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                disabled={signingIn}
                onClick={handleSignIn}
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors cursor-pointer disabled:opacity-60"
              >
                <LogIn className="w-4 h-4" />
                <span>{signingIn ? 'Menghubungkan Google...' : 'Lanjutkan dengan Google'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSignInModal(false)}
                className="min-h-[44px] px-4 py-2.5 text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer"
              >
                Nanti Saja
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Slide-Over Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[82vw] bg-slate-900 text-white h-full flex flex-col p-4 z-10">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <img
                  src={ORG_LOGO_PATH}
                  alt="Aliran Nursyah"
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded bg-white p-0.5"
                />
                <span className="text-sm font-bold">Aliran Nursyah</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 py-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-lg cursor-pointer ${
                    activeTab === item.id ? 'bg-red-700 text-white' : 'text-slate-300'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-800 space-y-2">
              {isSignedIn && user ? (
                <>
                  <p className="text-xs text-slate-300 truncate">{user.email}</p>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setShowAdminEmailsModal(true);
                      }}
                      className="w-full py-2.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg cursor-pointer"
                    >
                      Kelola 3 Email Admin
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full py-2.5 text-xs font-medium bg-slate-800 rounded-lg cursor-pointer"
                  >
                    Keluar Akun
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setShowSignInModal(true);
                  }}
                  className="w-full py-2.5 text-xs font-semibold bg-white text-slate-900 rounded-lg cursor-pointer"
                >
                  Masuk Google
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3 Admin Premium Emails Modal */}
      {isAdmin && (
        <AdminEmailsModal
          open={showAdminEmailsModal}
          adminEmails={adminEmails}
          currentUserEmail={user?.email || ''}
          onClose={() => setShowAdminEmailsModal(false)}
          onSaveAdminEmail={handleSaveAdminEmail}
          onRemoveAdminEmail={handleRemoveAdminEmail}
        />
      )}

      {/* Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-16 bg-white border-t border-slate-200 grid grid-cols-6">
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center gap-1 text-[10px] font-medium cursor-pointer ${
                active ? 'text-red-700' : 'text-slate-500'
              }`}
            >
              {item.icon}
              <span className="truncate max-w-[56px]">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
