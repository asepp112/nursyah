import React, { useMemo, useState } from 'react';
import { Award, Edit3, Save, X } from 'lucide-react';
import { BeltLevel, Member } from '../types/org';
import { DEFAULT_BELT_LEVELS } from '../constants/beltsAndSeed';

interface BeltClassificationViewProps {
  beltLevels: BeltLevel[];
  members: Member[];
  isAdmin: boolean;
  onSaveBeltNote: (level: BeltLevel, sejarah: string, kurikulum: string) => Promise<void>;
}

export const BeltClassificationView: React.FC<BeltClassificationViewProps> = ({
  beltLevels,
  members,
  isAdmin,
  onSaveBeltNote,
}) => {
  const levels = useMemo(() => {
    const source = beltLevels.length > 0 ? beltLevels : (DEFAULT_BELT_LEVELS as BeltLevel[]);
    return [...source].sort((a, b) => a.order - b.order);
  }, [beltLevels]);

  const memberCountByBelt = useMemo(() => {
    const map = new Map<string, number>();
    members.forEach((m) => {
      map.set(m.sabuk, (map.get(m.sabuk) || 0) + 1);
    });
    return map;
  }, [members]);

  const [editing, setEditing] = useState<BeltLevel | null>(null);
  const [sejarahDraft, setSejarahDraft] = useState('');
  const [kurikulumDraft, setKurikulumDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const openEdit = (lvl: BeltLevel) => {
    setEditing(lvl);
    setSejarahDraft(lvl.sejarah);
    setKurikulumDraft(lvl.kurikulum || '');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      await onSaveBeltNote(editing, sejarahDraft.trim(), kurikulumDraft.trim());
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Klasifikasi Tingkatan Sabuk & Sejarah Tingkat
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Jenjang resmi Aliran Nursyah dari Sabuk Kuning Mas, Sabuk Putih, hingga Tingkat Strip 1 sampai Strip 17 beserta catatan sejarah tiap tingkatan.
          </p>
        </div>
        <div className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
          Total {levels.length} Tingkatan Resmi
        </div>
      </div>

      {/* Belt Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {levels.map((lvl) => {
          const count = memberCountByBelt.get(lvl.name) || 0;
          const isGold = lvl.name === 'Sabuk Kuning Mas';
          const isWhite = lvl.name === 'Sabuk Putih';

          return (
            <article
              key={lvl.id}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono tabular-nums">Urutan {String(lvl.order).padStart(2, '0')}</span>
                      <span aria-hidden="true">·</span>
                      <span>{lvl.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums font-medium text-slate-700">
                        {count} anggota
                      </span>
                    </div>
                    <h2 className="text-base font-bold text-slate-900">{lvl.name}</h2>
                  </div>

                  {/* Visual Belt Strap Indicator */}
                  <div
                    className={`h-7 min-w-[88px] px-2 rounded-md border flex items-center justify-center gap-0.5 shrink-0 ${
                      isGold
                        ? 'bg-amber-400 border-amber-500 text-amber-950'
                        : isWhite
                        ? 'bg-slate-50 border-slate-300 text-slate-700'
                        : 'bg-slate-900 border-slate-800 text-white'
                    }`}
                    title={lvl.name}
                  >
                    {lvl.stripeCount === 0 ? (
                      <Award className="w-4 h-4" />
                    ) : (
                      <span className="text-[11px] font-mono font-semibold tabular-nums">
                        {lvl.stripeCount} STRIP
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2 pt-1 border-t border-slate-100">
                  <div>
                    <p className="text-xs font-semibold text-slate-700">Catatan Sejarah & Keterangan</p>
                    <p className="text-sm text-slate-600 leading-relaxed mt-0.5">{lvl.sejarah}</p>
                  </div>
                  {lvl.kurikulum && (
                    <div>
                      <p className="text-xs font-semibold text-slate-700">Materi & Kurikulum Pokok</p>
                      <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{lvl.kurikulum}</p>
                    </div>
                  )}
                </div>
              </div>

              {isAdmin && beltLevels.length > 0 && (
                <div className="pt-2 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => openEdit(lvl)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Catatan Sejarah</span>
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Edit Belt Historical Note Modal (Admin Only) */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit Catatan Sejarah Tingkat</h3>
                <p className="text-xs text-slate-500">{editing.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Catatan Sejarah & Filosofi Tingkat
                </label>
                <textarea
                  required
                  rows={4}
                  maxLength={1500}
                  value={sejarahDraft}
                  onChange={(e) => setSejarahDraft(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Materi & Kurikulum Pokok
                </label>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={kurikulumDraft}
                  onChange={(e) => setKurikulumDraft(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-700 text-white rounded-lg hover:bg-red-800 cursor-pointer disabled:opacity-60"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
