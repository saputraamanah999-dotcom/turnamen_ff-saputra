"use client";
// Admin → Evidence Management — bukti pelanggaran (upload inline <=700KB / tautan).
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, FileText, Image as ImageIcon, Paperclip, Trash2, Video } from "lucide-react";
import { BoButton, BoCard } from "@/components/common/bo";
import { Badge, Empty, Field, PageHead, Td, Th } from "@/components/disciplinary/ui";
import { useActiveTournament } from "@/services/firestore/hooks";
import { useEvidence, useStaffActor, useViolations } from "@/services/disciplinary/useDiscipline";
import { addEvidence, deleteEvidence, MAX_INLINE_EVIDENCE_BYTES } from "@/services/disciplinary/store";
import type { EvidenceKind } from "@/lib/disciplinary";
import { formatDateTime } from "@/lib/constants";

const KINDS: EvidenceKind[] = ["SCREENSHOT", "PHOTO", "VIDEO", "WITNESS_NOTE", "DOCUMENT", "PANITIA_NOTE", "LINK"];

export default function EvidencePage() {
  return (
    <Suspense>
      <EvidenceInner />
    </Suspense>
  );
}

function EvidenceInner() {
  const params = useSearchParams();
  const preselect = params.get("v") ?? "";
  const { tournament } = useActiveTournament();
  const violationsQ = useViolations(tournament?.id ?? null);
  const actor = useStaffActor();

  const [violationId, setViolationId] = useState(preselect);
  const [kind, setKind] = useState<EvidenceKind>("SCREENSHOT");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<{ mime: string; size: number; dataUrl: string; name: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (preselect) setViolationId(preselect); }, [preselect]);

  const evidenceQ = useEvidence(violationId || null);
  const list = evidenceQ.data ?? [];
  const violation = useMemo(() => (violationsQ.data ?? []).find((v) => v.id === violationId) ?? null, [violationsQ.data, violationId]);

  async function pickFile(f: File | null) {
    if (!f) { setFile(null); return; }
    if (f.size > MAX_INLINE_EVIDENCE_BYTES) {
      setMsg({ ok: false, text: `File ${(f.size / 1000).toFixed(0)} KB > ${(MAX_INLINE_EVIDENCE_BYTES / 1000).toFixed(0)} KB. Unggah ke Drive lalu gunakan jenis LINK.` });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const buf = await f.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    setFile({ mime: f.type || "application/octet-stream", size: f.size, dataUrl: `data:${f.type};base64,${btoa(binary)}`, name: f.name });
    if (!title) setTitle(f.name);
  }

  async function upload() {
    if (!actor || !violationId) return;
    setBusy(true);
    setMsg(null);
    try {
      await addEvidence({ violationId, kind, title, note, url: url || undefined }, file, actor);
      setMsg({ ok: true, text: "Bukti tersimpan dan terhubung dengan laporan." });
      setFile(null); setTitle(""); setUrl(""); setNote("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal unggah." });
    }
    setBusy(false);
  }

  async function remove(id: string) {
    const ev = list.find((x) => x.id === id);
    if (!ev || !actor || !violation) return;
    if (!window.confirm("Hapus bukti ini? Aksi tercatat di audit log.")) return;
    try {
      await deleteEvidence(ev, violation.status, actor);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal hapus." });
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHead
        kicker="Disiplin · Bukti"
        title="Evidence Management"
        desc="Setiap bukti terhubung dengan laporan pelanggaran. File kecil (≤700 KB: PNG/JPEG/WEBP/GIF, MP4/WEBM, PDF, TXT) disimpan langsung; file besar pakai tautan. Bukti tidak dapat dihapus sembarangan setelah keputusan sanksi."
      />
      {msg ? <p className={`text-xs font-bold ${msg.ok ? "text-fs-ok" : "text-fs-err"}`}>{msg.text}</p> : null}

      <BoCard className="fs-cut p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display text-base font-black uppercase text-fs-gold">
          <Paperclip className="h-4 w-4" /> Unggah Bukti
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Laporan pelanggaran terkait">
            <select className="bo-input w-full" value={violationId} onChange={(e) => setViolationId(e.target.value)}>
              <option value="">— pilih laporan —</option>
              {(violationsQ.data ?? []).map((v) => (
                <option key={v.id} value={v.id}>{v.id.slice(0, 8)} · {v.teamNames.join(" & ")} · {v.status}</option>
              ))}
            </select>
          </Field>
          <Field label="Jenis bukti">
            <select className="bo-input w-full" value={kind} onChange={(e) => setKind(e.target.value as EvidenceKind)}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
          <Field label="Judul bukti">
            <input className="bo-input w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          {kind === "LINK" ? (
            <Field label="Tautan bukti (Drive/YouTube/dll)">
              <input className="bo-input w-full" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </Field>
          ) : (
            <Field label="File" hint="Validasi format & ukuran otomatis.">
              <input ref={inputRef} className="bo-input w-full" type="file" accept="image/*,video/mp4,video/webm,application/pdf,text/plain" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
            </Field>
          )}
        </div>
        <div className="mt-3">
          <Field label="Catatan pengunggah">
            <input className="bo-input w-full" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        {file ? <p className="mt-2 text-[11px] font-bold text-fs-cyan">{file.name} · {(file.size / 1000).toFixed(0)} KB · {file.mime}</p> : null}
        <BoButton className="mt-3" variant="fire" disabled={busy || !violationId || !actor || (!file && kind !== "LINK" && kind !== "WITNESS_NOTE" && kind !== "PANITIA_NOTE") || (kind === "LINK" && !url.trim())} onClick={upload}>
          Simpan Bukti
        </BoButton>
      </BoCard>

      <BoCard className="fs-cut p-5">
        <h2 className="mb-3 font-display text-base font-black uppercase text-fs-gold">Bukti ({list.length})</h2>
        {!violationId ? <Empty text="Pilih laporan untuk melihat bukti" /> : list.length === 0 ? <Empty text="Belum ada bukti pada laporan ini" /> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((ev) => (
              <div key={ev.id} className="border border-fs-edge bg-fs-panel/50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Badge tone="cyan">{ev.kind}</Badge>
                  <span className="ml-auto text-[10px] font-bold text-fs-muted">{formatDateTime(ev.createdAt)}</span>
                </div>
                <p className="truncate text-[12.5px] font-black text-fs-text">{ev.title}</p>
                {ev.dataUrl && ev.mime.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ev.dataUrl} alt={ev.title} className="mt-2 max-h-40 w-full border border-fs-edge object-contain" />
                ) : ev.dataUrl && ev.mime.startsWith("video/") ? (
                  <video src={ev.dataUrl} controls className="mt-2 max-h-40 w-full border border-fs-edge" />
                ) : ev.dataUrl && ev.mime === "application/pdf" ? (
                  <p className="mt-2 flex items-center gap-1 text-[11px] font-bold text-fs-muted"><FileText className="h-3.5 w-3.5" /> Dokumen PDF</p>
                ) : ev.dataUrl && ev.mime.startsWith("image/") === false && ev.mime.startsWith("video/") === false ? (
                  <p className="mt-2 flex items-center gap-1 text-[11px] font-bold text-fs-muted"><ImageIcon className="h-3.5 w-3.5" /> {ev.mime}</p>
                ) : null}
                {ev.url ? (
                  <a href={ev.url} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-[11px] font-bold text-fs-cyan underline">{ev.url}</a>
                ) : null}
                {ev.note ? <p className="mt-1 text-[11px] text-fs-muted">{ev.note}</p> : null}
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-fs-muted">Oleh {ev.uploadedBy}</p>
                <div className="mt-2 flex gap-1.5">
                  {ev.dataUrl ? (
                    <a className="bo-btn bo-btn-black !px-2 !py-1 !text-[10px]" href={ev.dataUrl} download={ev.title}>
                      <Download className="mr-1 inline h-3 w-3" /> Unduh
                    </a>
                  ) : null}
                  <button className="bo-btn bo-btn-danger !px-2 !py-1 !text-[10px]" onClick={() => remove(ev.id)} disabled={!actor}>
                    <Trash2 className="mr-1 inline h-3 w-3" /> Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </BoCard>

      <BoCard className="fs-cut p-5">
        <h2 className="mb-2 flex items-center gap-2 font-display text-sm font-black uppercase text-fs-gold"><Video className="h-4 w-4" /> Catatan kebijakan bukti</h2>
        <p className="text-[12.5px] font-semibold text-fs-muted">
          Riwayat perubahan bukti tercatat di Disciplinary History (EVIDENCE_ADD / EVIDENCE_DELETE).
          Setelah laporan berstatus SANCTIONED atau CLOSED, penghapusan hanya oleh Super Admin dan alamnya tercatat.
        </p>
      </BoCard>
    </div>
  );
}
