"use client";
// /admin/tournaments — kelola turnamen
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { BoBadge, BoButton, BoCard } from "@/components/common/bo";
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { useAdminSession } from "@/services/auth/admin";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_TEAM_CAPACITY, MATCH_FORMATS, SCORING_VERSION } from "@/lib/constants";
import type { Tournament } from "@/lib/types";

export default function AdminTournamentsPage() {
  const [list, setList] = useState<Tournament[]>([]);
  const [editing, setEditing] = useState<Partial<Tournament> | null>(null);
  const session = useAdminSession();
  const { toast } = useToast();

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(collection(db, "tournaments"), (snap) => {
      setList(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Tournament));
    });
    return unsub;
  }, []);

  async function save() {
    if (!editing?.name || !db) return;
    const ref = editing.id
      ? doc(db, `tournaments/${editing.id}`)
      : doc(collection(db, "tournaments"));
    await setDoc(
      ref,
      {
        ...editing,
        id: ref.id,
        teamCapacity: Number(editing.teamCapacity ?? DEFAULT_TEAM_CAPACITY),
        totalMatches: Number(editing.totalMatches ?? 7),
        scoringVersion: SCORING_VERSION,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    toast({ title: "Turnamen tersimpan" });
    setEditing(null);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black uppercase">Tournaments</h1>
          <p className="text-sm font-semibold text-zb-black/60">
            {list.length} turnamen · hanya superadmin boleh mengubah konfigurasi penting
          </p>
        </div>
        <BoButton
          variant="primary"
          onClick={() =>
            setEditing({
              name: "BATTLE OFF FRIENDS",
              shortName: "BOF",
              institution: "SMK TI BALI GLOBAL KARANGASEM",
              developer: "SAPUTRA DEVELOPER",
              status: "draft",
              format: "BO7",
              totalMatches: 7,
              teamCapacity: DEFAULT_TEAM_CAPACITY,
              liveStatus: "offline",
            })
          }
        >
          <Plus className="h-4 w-4" /> Buat Turnamen
        </BoButton>
      </div>

      {editing ? (
        <BoCard className="mt-4 bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <F label="Nama">
              <input className="bo-input" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </F>
            <F label="Nama Pendek">
              <input className="bo-input" value={editing.shortName ?? ""} onChange={(e) => setEditing({ ...editing, shortName: e.target.value })} />
            </F>
            <F label="Institusi">
              <input className="bo-input" value={editing.institution ?? ""} onChange={(e) => setEditing({ ...editing, institution: e.target.value })} />
            </F>
            <F label="Format">
              <select className="bo-input" value={editing.format ?? "BO7"} onChange={(e) => setEditing({ ...editing, format: e.target.value as Tournament["format"] })}>
                {MATCH_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </F>
            <F label="Total Match">
              <input className="bo-input" type="number" min={1} value={editing.totalMatches ?? 7} onChange={(e) => setEditing({ ...editing, totalMatches: Number(e.target.value) })} />
            </F>
            <F label="Kapasitas Tim">
              <input className="bo-input" type="number" min={2} value={editing.teamCapacity ?? 12} onChange={(e) => setEditing({ ...editing, teamCapacity: Number(e.target.value) })} />
            </F>
            <F label="Status">
              <select className="bo-input" value={editing.status ?? "draft"} onChange={(e) => setEditing({ ...editing, status: e.target.value as Tournament["status"] })}>
                <option value="draft">Draft</option>
                <option value="active">Aktif</option>
                <option value="completed">Selesai</option>
              </select>
            </F>
          </div>
          {editing.teamCapacity && editing.teamCapacity > 12 ? (
            <p className="mt-3 border-[3px] border-zb-black bg-zb-yellow px-3 py-2 text-xs font-bold">
              Kapasitas &gt; 12 tim: aturan placement tambahan (rank 13+) perlu dikonfigurasi
              sebelum turnamen diaktifkan — poin placement untuk rank di atas 12 adalah 0.
            </p>
          ) : null}
          <div className="mt-4 flex gap-3">
            <BoButton variant="primary" onClick={save} disabled={!editing.name}>Simpan</BoButton>
            <BoButton variant="white" onClick={() => setEditing(null)}>Batal</BoButton>
          </div>
        </BoCard>
      ) : null}

      <div className="mt-6 space-y-3">
        {list.map((t) => (
          <BoCard key={t.id} className="flex flex-wrap items-center gap-3 bg-white p-4">
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-black uppercase">{t.name}</p>
              <p className="text-xs font-bold uppercase text-zb-black/50">
                {t.institution} · {t.format} · {t.teamCapacity} tim · ID: {t.id}
              </p>
            </div>
            <BoBadge className={t.status === "active" ? "bg-emerald-300" : t.status === "completed" ? "bg-zb-cyan" : "bg-white"}>
              {t.status.toUpperCase()}
            </BoBadge>
            <BoButton variant="white" className="!px-3 !py-2 !text-xs" onClick={() => setEditing(t)}>Edit</BoButton>
          </BoCard>
        ))}
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-black uppercase tracking-wider text-zb-black/70">{label}</label>
      {children}
    </div>
  );
}
