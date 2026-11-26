import React, { useEffect, useState } from 'react';
import { CheckCircle2, Mail, ShieldCheck, Trash2, X } from 'lucide-react';
import { AdminEmailRecord } from '../types/org';
import { ROOT_ADMIN_EMAIL } from '../lib/firebase';

interface AdminEmailsModalProps {
  open: boolean;
  adminEmails: AdminEmailRecord[];
  currentUserEmail: string;
  onClose: () => void;
  onSaveAdminEmail: (slot: 1 | 2 | 3, email: string, nama: string, jabatan: string) => Promise<void>;
  onRemoveAdminEmail: (emailId: string) => Promise<void>;
}

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

export const AdminEmailsModal: React.FC<AdminEmailsModalProps> = ({
  open,
  adminEmails,
  currentUserEmail,
  onClose,
  onSaveAdminEmail,
  onRemoveAdminEmail,
}) => {
  const [slotForms, setSlotForms] = useState<
    Record<1 | 2 | 3, { email: string; nama: string; jabatan: string }>
  >({
    1: { email: '', nama: '', jabatan: '' },
    2: { email: '', nama: '', jabatan: '' },
    3: { email: '', nama: '', jabatan: '' },
  });
  const [savingSlot, setSavingSlot] = useState<1 | 2 | 3 | null>(null);
  const [slotError, setSlotError] = useState('');
  const [slotSuccess, setSlotSuccess] = useState('');

  useEffect(() => {
    if (!open) return;
    const next: Record<1 | 2 | 3, { email: string; nama: string; jabatan: string }> = {
      1: { email: '', nama: '', jabatan: '' },
      2: { email: '', nama: '', jabatan: '' },
      3: { email: '', nama: '', jabatan: '' },
    };
    ([1, 2, 3] as const).forEach((s) => {
      const found = adminEmails.find((a) => a.slot === s);
      if (found) {
        next[s] = { email: found.email, nama: found.nama, jabatan: found.jabatan };
      }
    });
    setSlotForms(next);
    setSlotError('');
    setSlotSuccess('');
  }, [open, adminEmails]);

  if (!open) return null;

  const updateField = (slot: 1 | 2 | 3, field: 'email' | 'nama' | 'jabatan', value: string) => {
    setSlotForms((prev) => ({
      ...prev,
      [slot]: { ...prev[slot], [field]: value },
    }));
  };

  const handleSaveSlot = async (slot: 1 | 2 | 3) => {
    setSlotError('');
    setSlotSuccess('');
    const form = slotForms[slot];
    const cleanEmail = form.email.trim().toLowerCase();
    const cleanNama = (form.nama.trim() || `Admin Premium ${slot}`).slice(0, 120);
    const cleanJabatan = (form.jabatan.trim() || 'Pengurus Admin').slice(0, 120);

    if (!EMAIL_RE.test(cleanEmail)) {
      setSlotError(`Slot ${slot}: Masukkan alamat email Google yang valid (contoh: nama@gmail.com).`);
      return;
    }
    if (cleanEmail === ROOT_ADMIN_EMAIL.toLowerCase()) {
      setSlotError(`Slot ${slot}: ${ROOT_ADMIN_EMAIL} sudah menjadi Admin Utama secara permanen.`);
      return;
    }
    const duplicate = adminEmails.find((a) => a.email === cleanEmail && a.slot !== slot);
    if (duplicate) {
      setSlotError(`Email ${cleanEmail} sudah terdaftar pada Slot Admin ${duplicate.slot}.`);
      return;
    }

    setSavingSlot(slot);
    try {
      await onSaveAdminEmail(
        slot,
        cleanEmail,
        cleanNama.length >= 2 ? cleanNama : `Admin ${slot}`,
        cleanJabatan.length >= 2 ? cleanJabatan : 'Pengurus Admin'
      );
      setSlotSuccess(`Email Admin Slot ${slot} (${cleanEmail}) berhasil diaktifkan untuk akses Premium.`);
    } catch (err) {
      setSlotError(err instanceof Error ? err.message : `Gagal menyimpan Admin Slot ${slot}.`);
    } finally {
      setSavingSlot(null);
    }
  };

  const handleDeleteSlot = async (slot: 1 | 2 | 3) => {
    setSlotError('');
    setSlotSuccess('');
    const existing = adminEmails.find((a) => a.slot === slot);
    if (!existing) return;
    if (existing.email === currentUserEmail.toLowerCase()) {
      setSlotError('Anda tidak dapat menghapus email Anda sendiri saat sedang login.');
      return;
    }
    setSavingSlot(slot);
    try {
      await onRemoveAdminEmail(existing.id);
      setSlotSuccess(`Akses Admin Slot ${slot} (${existing.email}) telah dicabut.`);
    } catch (err) {
      setSlotError(err instanceof Error ? err.message : `Gagal menghapus Admin Slot ${slot}.`);
    } finally {
      setSavingSlot(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-t-xl sm:rounded-xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-white shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-amber-50 text-amber-700 rounded-lg border border-amber-200 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                Kelola 3 Email Admin Akses Premium
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Berikan akses penuh fitur pengurus pusat kepada maksimal 3 email Google terverifikasi.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-900 rounded-lg cursor-pointer"
            aria-label="Tutup pengaturan admin"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="p-3.5 bg-slate-900 text-white rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-amber-400">Admin Utama (Pemilik Sistem)</p>
              <p className="text-sm font-mono truncate mt-0.5">{ROOT_ADMIN_EMAIL}</p>
            </div>
            <span className="text-xs font-semibold text-emerald-300">Aktif Permanen</span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Saat pengguna masuk dengan salah satu dari 3 email di bawah ini, fitur Premium langsung terbuka: <strong>Kelola Wilayah/Alamat</strong>, <strong>Brankas Dokumen Admin</strong>, <strong>Edit Sejarah Sabuk</strong>, dan <strong>Backup &amp; Pemulihan Data</strong>.
          </p>

          {slotError && (
            <div className="p-3 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-lg">
              {slotError}
            </div>
          )}

          {slotSuccess && (
            <div className="p-3 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{slotSuccess}</span>
            </div>
          )}

          <div className="space-y-3">
            {([1, 2, 3] as const).map((slot) => {
              const saved = adminEmails.find((a) => a.slot === slot);
              const form = slotForms[slot];
              const isBusy = savingSlot === slot;
              const isSelf = saved?.email === currentUserEmail.toLowerCase();

              return (
                <div
                  key={slot}
                  className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-red-700" />
                      <span className="text-sm font-bold text-slate-900">
                        Email Admin Premium {slot}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        saved ? 'text-emerald-700' : 'text-slate-400'
                      }`}
                    >
                      {saved ? 'Aktif' : 'Slot Kosong'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-1">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Email Google *
                      </label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => updateField(slot, 'email', e.target.value)}
                        placeholder={`admin${slot}@gmail.com`}
                        className="w-full min-h-[42px] px-3 py-2 text-base sm:text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Nama Pengurus
                      </label>
                      <input
                        type="text"
                        value={form.nama}
                        onChange={(e) => updateField(slot, 'nama', e.target.value)}
                        placeholder={`Nama Admin ${slot}`}
                        className="w-full min-h-[42px] px-3 py-2 text-base sm:text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Jabatan
                      </label>
                      <input
                        type="text"
                        value={form.jabatan}
                        onChange={(e) => updateField(slot, 'jabatan', e.target.value)}
                        placeholder="Sekretaris / Pelatih"
                        className="w-full min-h-[42px] px-3 py-2 text-base sm:text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    {saved && !isSelf && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDeleteSlot(slot)}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-white hover:bg-red-50 border border-red-200 rounded-lg cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isBusy || !form.email.trim()}
                      onClick={() => handleSaveSlot(slot)}
                      className="min-h-[38px] px-4 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      {isBusy ? 'Menyimpan...' : saved ? 'Perbarui Email' : 'Aktifkan Admin'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-5 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg cursor-pointer"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
