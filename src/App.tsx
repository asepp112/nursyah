import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Bell,
  DatabaseBackup,
  ImagePlus,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  ShieldCheck,
  Trash2,
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
  DocumentReference,
  getDoc,
  getDocs,
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
  clearLocalAutoBackup,
  FullBackupPayload,
  saveLocalAutoBackup,
} from './lib/exportBackup';
import { sanitizeId } from './lib/mediaUtils';
import { isBeltEligibleForKta } from './constants/beltsAndSeed';
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
  const [rootAdminRevoked, setRootAdminRevoked] = useState(false);
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
  const [clearingAllData, setClearingAllData] = useState(false);
  const [showClearDataModal, setShowClearDataModal] = useState(false);
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

  const checkAdminStatus = async (u: User): Promise<{ adminOk: boolean; rootRevoked: boolean }> => {
    if (!u.emailVerified) return { adminOk: false, rootRevoked: false };
    const lowerEmail = (u.email || '').toLowerCase();
    try {
      const [rootSnap, adminSnap, emailAdminSnap] = await Promise.all([
        getDoc(doc(db, 'admin_config', 'root')).catch(() => null),
        getDoc(doc(db, 'admins', u.uid)).catch(() => null),
        lowerEmail ? getDoc(doc(db, 'admin_emails', lowerEmail)).catch(() => null) : Promise.resolve(null),
      ]);
      const rootRevoked = Boolean(rootSnap?.exists());
      const isRoot = !rootRevoked && lowerEmail === ROOT_ADMIN_EMAIL.toLowerCase();
      const adminOk = Boolean(isRoot || adminSnap?.exists() || emailAdminSnap?.exists());
      return { adminOk, rootRevoked };
    } catch {
      return { adminOk: false, rootRevoked: false };
    }
  };

  const verifyAdminStatus = async (u: User): Promise<boolean> => {
    const { adminOk, rootRevoked } = await checkAdminStatus(u);
    setRootAdminRevoked(rootRevoked);
    return adminOk;
  };

  // Auth Listener & Admin Verification (Root Admin + UID Admins + 3 Email Admin Premium)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u && u.emailVerified) {
        const adminOk = await verifyAdminStatus(u);
        setIsAdmin(adminOk);
      } else {
        setIsAdmin(false);
        setRootAdminRevoked(false);
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
      const qVault = query(
        collection(db, 'admin_vault'),
        where('uploadedByUid', '==', user.uid),
        limit(100)
      );
      unsubs.push(
        onSnapshot(
          qVault,
          (snap) => {
            setVaultDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AdminVaultDoc)));
          },
          (err) => logFirestoreError(err, OperationType.LIST, 'admin_vault')
        )
      );

      const qBackups = query(
        collection(db, 'backups'),
        where('createdByUid', '==', user.uid),
        limit(50)
      );
      unsubs.push(
        onSnapshot(
          qBackups,
          (snap) => {
            setBackupLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BackupLog)));
          },
          (err) => logFirestoreError(err, OperationType.LIST, 'backups')
        )
      );

      // Watch /admin_config/root so root admin deletion/restoration syncs immediately
      unsubs.push(
        onSnapshot(
          doc(db, 'admin_config', 'root'),
          async (snap) => {
            const revoked = snap.exists();
            setRootAdminRevoked(revoked);
            if (revoked && (user.email || '').toLowerCase() === ROOT_ADMIN_EMAIL.toLowerCase()) {
              const { adminOk } = await checkAdminStatus(user);
              setIsAdmin(adminOk);
              if (!adminOk) {
                setShowAdminEmailsModal(false);
              }
            }
          },
          (err) => logFirestoreError(err, OperationType.GET, 'admin_config/root')
        )
      );

      let addedList: AdminEmailRecord[] = [];
      let slotRecords: AdminEmailRecord[] = [];
      let selfRecord: AdminEmailRecord | null = null;

      const mergeAdminEmails = () => {
        const map = new Map<string, AdminEmailRecord>();
        [...addedList, ...slotRecords, ...(selfRecord ? [selfRecord] : [])].forEach((item) => {
          map.set(item.id, item);
        });
        const merged = Array.from(map.values());
        merged.sort((a, b) => a.slot - b.slot);
        setAdminEmails(merged);
      };

      const qAddedAdminEmails = query(
        collection(db, 'admin_emails'),
        where('addedBy', '==', user.uid),
        limit(10)
      );
      unsubs.push(
        onSnapshot(
          qAddedAdminEmails,
          (snap) => {
            addedList = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AdminEmailRecord));
            mergeAdminEmails();
          },
          (err) => logFirestoreError(err, OperationType.LIST, 'admin_emails')
        )
      );

      const lowerUserEmail = (user.email || '').toLowerCase();
      if (lowerUserEmail) {
        unsubs.push(
          onSnapshot(
            doc(db, 'admin_emails', lowerUserEmail),
            (snap) => {
              selfRecord = snap.exists()
                ? ({ id: snap.id, ...snap.data() } as AdminEmailRecord)
                : null;
              mergeAdminEmails();
            },
            () => {}
          )
        );
      }

      unsubs.push(
        onSnapshot(
          doc(db, 'admin_config', 'slots'),
          async (snap) => {
            if (!snap.exists()) {
              slotRecords = [];
              mergeAdminEmails();
              return;
            }
            const data = snap.data() as { slot1?: string; slot2?: string; slot3?: string };
            const emails = [data.slot1, data.slot2, data.slot3]
              .filter((e): e is string => Boolean(e && e.trim()))
              .map((e) => e.trim().toLowerCase());
            const fetched = await Promise.all(
              emails.map(async (em) => {
                const s = await getDoc(doc(db, 'admin_emails', em)).catch(() => null);
                return s?.exists() ? ({ id: s.id, ...s.data() } as AdminEmailRecord) : null;
              })
            );
            slotRecords = fetched.filter((r): r is AdminEmailRecord => Boolean(r));
            mergeAdminEmails();
          },
          () => {}
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
    if (signingIn) return;
    setAuthError('');
    setSigningIn(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(auth, provider);
      if (cred.user && !cred.user.emailVerified) {
        setAuthError('Email Google Anda belum terverifikasi. Gunakan akun Google dengan email terverifikasi.');
      } else if (cred.user) {
        const adminOk = await verifyAdminStatus(cred.user);
        setIsAdmin(adminOk);
        setShowSignInModal(false);
        showToast(
          adminOk
            ? `Selamat datang Admin (${cred.user.email}). Akses penuh aktif.`
            : `Masuk sebagai ${cred.user.email || 'Anggota'}.`
        );
      }
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-blocked') {
        setAuthError(
          'Popup Google diblokir oleh browser. Izinkan popup untuk situs ini lalu klik Lanjutkan dengan Google.'
        );
        setShowSignInModal(true);
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

  // Admin 1-Click Clear All Data for Production Publish
  const handleClearAllData = async () => {
    if (!user || !isAdmin) return;
    setClearingAllData(true);
    try {
      const refsToDelete: DocumentReference[] = [];

      const [
        membersSnap,
        regionsSnap,
        broadcastsSnap,
        lettersSnap,
        docsSnap,
        vaultSnap,
        backupsSnap,
      ] = await Promise.all([
        getDocs(query(collection(db, 'members'), where('orgCode', '==', 'NURSYAH'))),
        getDocs(query(collection(db, 'regions'), where('orgCode', '==', 'NURSYAH'))),
        getDocs(query(collection(db, 'broadcasts'), where('orgCode', '==', 'NURSYAH'))),
        getDocs(query(collection(db, 'letters'), where('orgCode', '==', 'NURSYAH'))),
        getDocs(query(collection(db, 'documentation'), where('orgCode', '==', 'NURSYAH'))),
        getDocs(query(collection(db, 'admin_vault'), where('uploadedByUid', '==', user.uid))),
        getDocs(query(collection(db, 'backups'), where('createdByUid', '==', user.uid))),
      ]);

      membersSnap.docs.forEach((d) => {
        refsToDelete.push(doc(db, 'members', d.id, 'private', 'pii'));
        refsToDelete.push(d.ref);
      });
      regionsSnap.docs.forEach((d) => refsToDelete.push(d.ref));
      broadcastsSnap.docs.forEach((d) => refsToDelete.push(d.ref));
      lettersSnap.docs.forEach((d) => refsToDelete.push(d.ref));
      docsSnap.docs.forEach((d) => refsToDelete.push(d.ref));
      vaultSnap.docs.forEach((d) => refsToDelete.push(d.ref));
      backupsSnap.docs.forEach((d) => refsToDelete.push(d.ref));

      for (let i = 0; i < refsToDelete.length; i += 200) {
        const chunk = refsToDelete.slice(i, i + 200);
        const batch = writeBatch(db);
        chunk.forEach((ref) => batch.delete(ref));
        await batch.commit();
      }

      clearLocalAutoBackup();
      setPiiCache({});
      setShowClearDataModal(false);
      showToast('Semua data uji coba berhasil dikosongkan. Aplikasi siap dipublikasikan.');
    } catch (err) {
      showToast(logFirestoreError(err, OperationType.DELETE, 'clear_all_data'));
    } finally {
      setClearingAllData(false);
    }
  };

  // CRUD Handlers
  const sanitizeHistoryList = (list?: Member['riwayatTingkat']) =>
    (list || []).slice(0, 25).map((r) => ({
      fromSabuk: String(r.fromSabuk || 'Sabuk Kuning Mas').slice(0, 60),
      toSabuk: String(r.toSabuk || 'Sabuk Putih').slice(0, 60),
      tanggal: String(r.tanggal || new Date().toISOString().slice(0, 10)).slice(0, 24),
      penguji: String(r.penguji || 'Dewan Penguji').slice(0, 120),
      catatan: String(r.catatan || '').slice(0, 500),
    }));

  const handleCreateMember = async (
    memberData: Omit<Member, 'id' | 'ownerUid' | 'orgCode' | 'createdAt' | 'updatedAt'>,
    piiData: Omit<MemberPii, 'ownerUid' | 'updatedAt'> | null
  ) => {
    const ownerUid = user && user.emailVerified ? user.uid : 'mandiri';
    const memberId = `mbr-${Date.now()}-${sanitizeId(memberData.nia).slice(0, 24)}`;
    const cleanHistory = sanitizeHistoryList(memberData.riwayatTingkat);
    const validTahunPutih =
      memberData.tahunDilantikPutih && /^[0-9]{4}$/.test(memberData.tahunDilantikPutih)
        ? memberData.tahunDilantikPutih
        : undefined;
    try {
      const batch = writeBatch(db);
      const docPayload: Record<string, unknown> = {
        ...memberData,
        riwayatTingkat: cleanHistory,
        sabukOrder: Math.round(Number(memberData.sabukOrder)),
        ...(memberData.alamatLengkap ? { alamatLengkap: memberData.alamatLengkap.slice(0, 350) } : {}),
        ownerUid,
        orgCode: 'NURSYAH',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (validTahunPutih) {
        docPayload.tahunDilantikPutih = validTahunPutih;
      } else {
        delete docPayload.tahunDilantikPutih;
      }
      batch.set(doc(db, 'members', memberId), docPayload);
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
      tahunDilantikPutih?: string;
      fotoProfil?: string;
      statusAktif: 'Aktif' | 'Cuti' | 'Alumni';
      riwayatTingkat?: Member['riwayatTingkat'];
      berkasChecklist: Member['berkasChecklist'];
    },
    piiData: Omit<MemberPii, 'ownerUid' | 'updatedAt'> | null
  ) => {
    const isVerified = Boolean(user && user.emailVerified);
    if (!isVerified && member.ownerUid !== 'mandiri') return;

    const cleanHistory =
      memberUpdates.riwayatTingkat !== undefined
        ? sanitizeHistoryList(memberUpdates.riwayatTingkat)
        : sanitizeHistoryList(member.riwayatTingkat);
    const validTahunPutih =
      memberUpdates.tahunDilantikPutih && /^[0-9]{4}$/.test(memberUpdates.tahunDilantikPutih)
        ? memberUpdates.tahunDilantikPutih
        : undefined;
    const nextOrder = Math.round(Number(memberUpdates.sabukOrder));
    const graduatedFromKuning = member.sabuk === 'Sabuk Kuning Mas' && nextOrder >= 2;

    try {
      const batch = writeBatch(db);
      if (!isVerified && member.ownerUid === 'mandiri') {
        const selfUpdatePayload: Record<string, unknown> = {
          sabuk: memberUpdates.sabuk.slice(0, 60),
          sabukOrder: nextOrder,
          riwayatTingkat: cleanHistory,
          updatedAt: serverTimestamp(),
        };
        if (validTahunPutih) {
          selfUpdatePayload.tahunDilantikPutih = validTahunPutih;
        }
        if (graduatedFromKuning && memberUpdates.nia && memberUpdates.nia !== member.nia) {
          selfUpdatePayload.nia = memberUpdates.nia.slice(0, 40);
        }
        batch.update(doc(db, 'members', member.id), selfUpdatePayload);
      } else if (user) {
        const memberPayload: Record<string, unknown> = {
          namaLengkap: memberUpdates.namaLengkap.slice(0, 120),
          provinsi: memberUpdates.provinsi.slice(0, 120),
          kabupaten: memberUpdates.kabupaten.slice(0, 120),
          kecamatan: memberUpdates.kecamatan.slice(0, 120),
          ranting: memberUpdates.ranting.slice(0, 120),
          alamatLengkap: (memberUpdates.alamatLengkap || '').slice(0, 350),
          sabuk: memberUpdates.sabuk.slice(0, 60),
          sabukOrder: nextOrder,
          statusAktif: memberUpdates.statusAktif,
          riwayatTingkat: cleanHistory,
          berkasChecklist: memberUpdates.berkasChecklist,
          updatedAt: serverTimestamp(),
        };
        if (validTahunPutih) {
          memberPayload.tahunDilantikPutih = validTahunPutih;
        }
        if (isAdmin || (graduatedFromKuning && memberUpdates.nia !== member.nia)) {
          memberPayload.nia = memberUpdates.nia.slice(0, 40);
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
      }

      await batch.commit();
      if (isVerified && piiData && (isAdmin || member.ownerUid === user?.uid)) {
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
    catatan: string,
    options?: { tahunDilantikPutih?: string; newNia?: string }
  ) => {
    const newRecord = {
      fromSabuk: member.sabuk,
      toSabuk,
      tanggal,
      penguji,
      catatan,
    };
    const updatedHistory = [...(member.riwayatTingkat || []), newRecord].slice(-25);
    const nextOrder = Math.round(Number(toSabukOrder));
    const eligibleKta = isBeltEligibleForKta(toSabuk, nextOrder);
    const tanggalYear = /^\d{4}/.test(tanggal) ? tanggal.slice(0, 4) : String(new Date().getFullYear());
    const tahunPutih = eligibleKta
      ? options?.tahunDilantikPutih && /^[0-9]{4}$/.test(options.tahunDilantikPutih)
        ? options.tahunDilantikPutih
        : member.tahunDilantikPutih && /^[0-9]{4}$/.test(member.tahunDilantikPutih)
        ? member.tahunDilantikPutih
        : tanggalYear
      : undefined;

    const payload: Record<string, unknown> = {
      sabuk: toSabuk,
      sabukOrder: nextOrder,
      riwayatTingkat: updatedHistory,
      updatedAt: serverTimestamp(),
    };

    if (tahunPutih) {
      payload.tahunDilantikPutih = tahunPutih;
    }

    const graduatedFromKuning = member.sabuk === 'Sabuk Kuning Mas' && nextOrder >= 2;
    if (graduatedFromKuning && options?.newNia && /^[a-zA-Z0-9_\-.]{3,40}$/.test(options.newNia)) {
      payload.nia = options.newNia;
    }

    try {
      await updateDoc(doc(db, 'members', member.id), payload);
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
      const beltRef = doc(db, 'belt_levels', level.id);
      const snap = await getDoc(beltRef).catch(() => null);
      if (snap?.exists()) {
        await updateDoc(beltRef, {
          order: level.order,
          name: level.name,
          category: level.category,
          colorHex: level.colorHex,
          stripeCount: level.stripeCount,
          sejarah,
          kurikulum,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(beltRef, {
          order: level.order,
          name: level.name,
          category: level.category,
          colorHex: level.colorHex,
          stripeCount: level.stripeCount,
          sejarah,
          kurikulum,
          orgCode: 'NURSYAH',
          updatedAt: serverTimestamp(),
        });
      }
      showToast(`Catatan sejarah ${level.name} diperbarui.`);
    } catch (err) {
      showToast(logFirestoreError(err, OperationType.WRITE, `belt_levels/${level.id}`));
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

  const buildSlotsSnapshotPayload = (records: AdminEmailRecord[]) => ({
    slot1: records.find((a) => a.slot === 1)?.email || '',
    slot2: records.find((a) => a.slot === 2)?.email || '',
    slot3: records.find((a) => a.slot === 3)?.email || '',
    updatedAt: serverTimestamp(),
  });

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

    const nextRecords: AdminEmailRecord[] = adminEmails
      .filter((a) => a.slot !== slot && a.email !== cleanEmail)
      .concat([
        {
          id: cleanEmail,
          slot,
          email: cleanEmail,
          nama: nama.slice(0, 120),
          jabatan: jabatan.slice(0, 120),
          addedBy: existingSameEmail?.addedBy || user.uid,
        },
      ]);

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
      batch.set(doc(db, 'admin_config', 'slots'), buildSlotsSnapshotPayload(nextRecords));
      await batch.commit();
      setAdminEmails(nextRecords.sort((a, b) => a.slot - b.slot));
      showToast(`Email Admin Premium Slot ${slot} berhasil disimpan.`);
    } catch (err) {
      throw new Error(logFirestoreError(err, OperationType.WRITE, `admin_emails/${cleanEmail}`));
    }
  };

  const handleRemoveAdminEmail = async (emailId: string) => {
    if (!user || !isAdmin) return;
    const nextRecords = adminEmails.filter((a) => a.id !== emailId);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'admin_emails', emailId));
      batch.set(doc(db, 'admin_config', 'slots'), buildSlotsSnapshotPayload(nextRecords));
      await batch.commit();
      setAdminEmails(nextRecords);
      showToast(`Akses Admin Premium untuk ${emailId} dihapus.`);
    } catch (err) {
      throw new Error(logFirestoreError(err, OperationType.DELETE, `admin_emails/${emailId}`));
    }
  };

  const handleDeleteRootAdmin = async () => {
    if (!user || !isAdmin) return;
    try {
      await setDoc(doc(db, 'admin_config', 'root'), {
        revokedEmail: ROOT_ADMIN_EMAIL.toLowerCase(),
        revokedByUid: user.uid,
        createdAt: serverTimestamp(),
      });
      setRootAdminRevoked(true);
      const { adminOk } = await checkAdminStatus(user);
      setIsAdmin(adminOk);
      if (!adminOk) {
        setShowAdminEmailsModal(false);
      }
      showToast(`Akses Admin Utama (${ROOT_ADMIN_EMAIL}) berhasil dihapus.`);
    } catch (err) {
      throw new Error(logFirestoreError(err, OperationType.CREATE, 'admin_config/root'));
    }
  };

  const handleRestoreRootAdmin = async () => {
    if (!user || !isAdmin) return;
    try {
      await deleteDoc(doc(db, 'admin_config', 'root'));
      setRootAdminRevoked(false);
      showToast(`Admin Utama (${ROOT_ADMIN_EMAIL}) diaktifkan kembali.`);
    } catch (err) {
      throw new Error(logFirestoreError(err, OperationType.DELETE, 'admin_config/root'));
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
        ...(m.tahunDilantikPutih && /^[0-9]{4}$/.test(m.tahunDilantikPutih)
          ? { tahunDilantikPutih: m.tahunDilantikPutih }
          : {}),
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

        <div className="p-4 border-t border-slate-800 space-y-2.5">
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
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
              clearingAllData={clearingAllData}
              onRequestClearAllData={() => setShowClearDataModal(true)}
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
              documentationCount={documentation.length}
              vaultCount={vaultDocs.length}
              piiCache={piiCache}
              backupLogs={backupLogs}
              isAdmin={isAdmin}
              clearingAllData={clearingAllData}
              onLogCloudBackup={handleLogCloudBackup}
              onRestoreBackup={handleRestoreBackup}
              onRequestClearAllData={() => setShowClearDataModal(true)}
            />
          )}
        </main>
      </div>

      {/* Optional Google Sign-In Modal for Admins / Uploaders */}
      {showSignInModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
          onClick={() => setShowSignInModal(false)}
        >
          <div
            className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xl"
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

            <p className="text-xs text-slate-600 leading-relaxed">
              Pengisian data diri anggota baru dapat dilakukan langsung tanpa login. Masuk Google hanya diperlukan untuk Pengurus / Admin atau unggah kenangan.
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
          rootAdminRevoked={rootAdminRevoked}
          onClose={() => setShowAdminEmailsModal(false)}
          onSaveAdminEmail={handleSaveAdminEmail}
          onRemoveAdminEmail={handleRemoveAdminEmail}
          onDeleteRootAdmin={handleDeleteRootAdmin}
          onRestoreRootAdmin={handleRestoreRootAdmin}
        />
      )}

      {/* Confirmation Modal: Kosongkan Semua Data Siap Publish */}
      {isAdmin && showClearDataModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
          onClick={() => !clearingAllData && setShowClearDataModal(false)}
        >
          <div
            className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-red-50 text-red-700 rounded-lg border border-red-200 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Kosongkan Semua Data untuk Publish?
                </h2>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Tindakan ini akan menghapus permanen seluruh data anggota ({members.length}), wilayah/ranting ({regions.length}), pengumuman ({broadcasts.length}), surat ({letters.length}), foto kenangan ({documentation.length}), brankas ({vaultDocs.length}), dan riwayat backup ({backupLogs.length}) serta snapshot lokal.
                </p>
                <p className="text-xs font-medium text-slate-700 mt-2">
                  Klasifikasi 20 tingkatan sabuk &amp; daftar 3 email admin tetap disimpan.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={clearingAllData}
                onClick={() => setShowClearDataModal(false)}
                className="min-h-[42px] px-4 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={clearingAllData}
                onClick={handleClearAllData}
                className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-red-700 hover:bg-red-800 text-white rounded-lg cursor-pointer disabled:opacity-60"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{clearingAllData ? 'Menghapus...' : 'Ya, Kosongkan Semua'}</span>
              </button>
            </div>
          </div>
        </div>
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
