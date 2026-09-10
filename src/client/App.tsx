import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClaimRunSnapshot, ConfirmedClaim, PreparedClaim, Product } from "../shared/contracts";

type Health = {
  ready: boolean;
  state: string;
  models: readonly string[];
  device?: string;
  progress?: string;
  error?: string;
};
type ProcedureOption = {
  id: string; product: Product; category: string; title: string; responsibleArea: string;
  requiredFields: readonly string[]; steps: readonly string[]; illustrativeSla: string;
};

const example = "El 8 de septiembre retiré $80 en un cajero de Vía España. Mi cuenta fue debitada, pero el cajero no entregó efectivo. No recuerdo la hora exacta ni el identificador del cajero.";
const stageLabel: Record<string, string> = {
  queued: "En cola", transcribing: "Transcribiendo localmente", retrieving: "Consultando procedimientos",
  analyzing: "Analizando el reclamo", validating: "Validando expediente", ready: "Listo para revisión", failed: "Revisión manual requerida"
};
const productLabels: Record<Product, string> = {
  tarjeta_debito: "Tarjeta de débito", cuenta_ahorro: "Cuenta de ahorro",
  transferencia: "Transferencia", banca_digital: "Banca digital"
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "No se pudo completar la operación.");
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

function formatSeconds(ms: number) {
  return `${Math.floor(ms / 60)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
}

function EditableClaim({ value, catalog, onChange }: { value: PreparedClaim; catalog: readonly ProcedureOption[]; onChange: (next: PreparedClaim) => void }) {
  const set = <K extends keyof PreparedClaim>(key: K, next: PreparedClaim[K]) => onChange({ ...value, [key]: next });
  const selectProcedure = (id: string) => {
    const procedure = catalog.find((item) => item.id === id);
    if (!procedure) return;
    const missingInformation = procedure.requiredFields.filter((field) => !value.extractedFields[field]?.trim());
    onChange({ ...value, product: procedure.product, category: procedure.category, responsibleArea: procedure.responsibleArea, missingInformation,
      procedure: { id: procedure.id, title: procedure.title, source: `synthetic://procedures/${procedure.id}`, excerpt: `${procedure.steps.join(" ")} ${procedure.illustrativeSla}` } });
  };
  const setField = (field: string, fieldValue: string) => {
    const extractedFields = { ...value.extractedFields, [field]: fieldValue };
    const procedure = catalog.find((item) => item.id === value.procedure.id);
    onChange({ ...value, extractedFields, missingInformation: procedure?.requiredFields.filter((required) => !extractedFields[required]?.trim()) ?? value.missingInformation });
  };
  return <section className="result-card" aria-label="Expediente editable">
    <div className="result-title"><div><p className="eyebrow">Expediente preparado</p><h2>{value.procedure.title}</h2></div><span className="confidence">{Math.round(value.confidence * 100)}% confianza</span></div>
    <div className="editor-grid"><label>Procedimiento<select aria-label="Procedimiento" value={value.procedure.id} onChange={(e) => selectProcedure(e.target.value)}>{catalog.map((procedure) => <option key={procedure.id} value={procedure.id}>{procedure.id} · {procedure.title}</option>)}</select></label><label>Producto<input aria-label="Producto" value={productLabels[value.product]} readOnly /></label><label>Categoría<input aria-label="Categoría" value={value.category} readOnly /></label><label>Área responsable<input aria-label="Área responsable" value={value.responsibleArea} readOnly /></label></div>
    <label>Transcripción<textarea value={value.transcript} onChange={(e) => set("transcript", e.target.value)} /></label>
    <label>Resumen<textarea value={value.summary} onChange={(e) => set("summary", e.target.value)} /></label>
    <div className="procedure"><strong>Procedimiento sintético · {value.procedure.id}</strong><p>{value.procedure.excerpt}</p><small>Fuente local: {value.procedure.source}</small></div>
    <div className="extracted"><strong>Datos extraídos</strong><div className="editor-grid">{(catalog.find((procedure) => procedure.id === value.procedure.id)?.requiredFields ?? Object.keys(value.extractedFields)).map((field) => <label key={field}>{field.replaceAll("_", " ")}<input value={value.extractedFields[field] ?? ""} onChange={(event) => setField(field, event.target.value)} /></label>)}</div></div>
    <div className="missing"><strong>Información faltante</strong>{value.missingInformation.length === 0 ? <p>Todos los datos mínimos están presentes.</p> : <ul>{value.missingInformation.map((field) => <li key={field}>{field.replaceAll("_", " ")}</li>)}</ul>}</div>
    <label>Borrador de respuesta<textarea value={value.draftResponse} onChange={(e) => set("draftResponse", e.target.value)} /></label>
  </section>;
}

export function App() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File>();
  const [run, setRun] = useState<ClaimRunSnapshot>();
  const [claim, setClaim] = useState<PreparedClaim>();
  const [health, setHealth] = useState<Health>();
  const [catalog, setCatalog] = useState<ProcedureOption[]>([]);
  const [history, setHistory] = useState<ConfirmedClaim[]>([]);
  const [message, setMessage] = useState<string>();
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | undefined>(undefined);
  const chunks = useRef<Blob[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [nextHealth, nextHistory, nextCatalog] = await Promise.all([api<Health>("/api/health"), api<ConfirmedClaim[]>("/api/claims"), api<ProcedureOption[]>("/api/procedures")]);
      setHealth(nextHealth); setHistory(nextHistory); setCatalog(nextCatalog);
    } catch { setHealth(undefined); }
  }, []);
  useEffect(() => { void refresh(); const id = window.setInterval(() => void refresh(), 4000); return () => clearInterval(id); }, [refresh]);
  useEffect(() => {
    if (!run || ["ready", "failed"].includes(run.status)) return;
    const id = window.setInterval(async () => {
      try { const next = await api<ClaimRunSnapshot>(`/api/runs/${run.id}`); setRun(next); if (next.result) setClaim(next.result); } catch (error) { setMessage(error instanceof Error ? error.message : "La ejecución se interrumpió."); }
    }, 500);
    return () => clearInterval(id);
  }, [run?.id, run?.status]);

  const busy = !!run && !["ready", "failed"].includes(run.status);
  const submit = async () => {
    setMessage(undefined); setClaim(undefined); setRun(undefined);
    try {
      let response: { runId: string };
      if (file) { const data = new FormData(); data.append("file", file); response = await api("/api/runs", { method: "POST", body: data }); }
      else response = await api("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "text", text }) });
      setRun({ id: response.runId, status: "queued", elapsedMs: 0, transcript: text || undefined });
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo iniciar el reclamo."); }
  };
  const toggleRecording = async () => {
    if (recording && recorder.current) { recorder.current.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(stream);
      chunks.current = [];
      next.ondataavailable = (event) => chunks.current.push(event.data);
      next.onstop = () => { const blob = new Blob(chunks.current, { type: next.mimeType || "audio/webm" }); setFile(new File([blob], "reclamo-grabado.webm", { type: blob.type })); stream.getTracks().forEach((track) => track.stop()); setRecording(false); };
      recorder.current = next; next.start(); setRecording(true);
    } catch { setMessage("No se pudo acceder al micrófono. Puedes cargar un audio o usar texto."); }
  };
  const submitDisabled = busy || !health?.ready || (!file && text.trim().length < 8);
  const diagnostic = useMemo(() => health?.models.join(" · ") ?? "Verificando QVAC…", [health]);

  return <main>
    <header><div className="brand"><span className="brand-mark">⌁</span><span>CaseFlow <b>AI</b></span></div><div className="local-pill"><span className={navigator.onLine ? "dot" : "dot offline"} /> {navigator.onLine ? "Modo local preparado" : "Sin Internet · local"}</div></header>
    <section className="hero"><p className="eyebrow">OPERACIÓN INTERNA · DATOS SINTÉTICOS</p><h1>Convierte un reclamo en un expediente revisable.</h1><p>Transcripción, procedimiento, área responsable, faltantes y borrador: todo preparado localmente antes de enviarlo a revisión humana.</p><div className="metric"><strong>&lt; 2 min</strong><span>meta de preparación inicial<br />antes: ~15 min</span></div></section>
    <section className="workspace">
      <section className="intake-card"><div className="section-heading"><div><p className="eyebrow">01 · CAPTURA</p><h2>Nuevo reclamo</h2></div>{busy && <span className="timer">{formatSeconds(run.elapsedMs)}</span>}</div>
        <label>Describe el reclamo<textarea aria-label="Texto del reclamo" placeholder="Pega o escribe lo que reportó el cliente…" value={text} onChange={(e) => { setText(e.target.value); setFile(undefined); }} disabled={busy} /></label>
        <button className="text-link" onClick={() => { setText(example); setFile(undefined); }}>Cargar caso estrella de cajero</button>
        <div className="or"><span />o<span /></div>
        <div className="audio-actions"><button className={recording ? "record recording" : "record"} onClick={() => void toggleRecording()} disabled={busy}>{recording ? "Detener grabación" : "Grabar por micrófono"}</button><label className="upload">Cargar audio<input type="file" accept="audio/*" onChange={(e) => { setFile(e.target.files?.[0]); setText(""); }} disabled={busy} /></label></div>
        {file && <p className="file-note">Audio listo: {file.name} · se eliminará después de transcribir.</p>}
        <button className="primary" onClick={() => void submit()} disabled={submitDisabled}>{!health?.ready ? health?.progress ?? "Preparando modelos locales…" : busy ? stageLabel[run.status] : "Preparar expediente"}</button>
        {message && <p className="error">{message}</p>}
      </section>
      <section className="result-pane">
        {!run && <div className="empty"><span>⌁</span><h2>Esperando un reclamo</h2><p>El expediente aparecerá aquí para que puedas editarlo antes de confirmarlo.</p></div>}
        {run && busy && <div className="progress"><p className="eyebrow">02 · PROCESAMIENTO LOCAL</p><h2>{stageLabel[run.status]}</h2><div className="progress-track"><i /></div><p>{formatSeconds(run.elapsedMs)} · El navegador consulta solo este servidor local.</p></div>}
        {run?.status === "failed" && <div className="failure"><p className="eyebrow">REVISIÓN MANUAL</p><h2>No se generó un expediente automático.</h2><p>{run.error?.message}</p>{run.transcript && <label>Texto disponible<textarea value={run.transcript} readOnly /></label>}</div>}
        {claim && run?.status === "ready" && <><EditableClaim value={claim} catalog={catalog} onChange={setClaim} /><button className="confirm" onClick={async () => { try { await api(`/api/runs/${run.id}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(claim) }); setMessage("Expediente confirmado y guardado solo en la base local."); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo confirmar."); } }}>Confirmar expediente revisado</button></>}
      </section>
    </section>
    <section className="diagnostics"><div><p className="eyebrow">PRIVACIDAD Y DIAGNÓSTICO</p><h2>La inferencia no sale del equipo.</h2><p>Proveedor: QVAC · ubicación: local · sin endpoint de inferencia externo.</p></div><dl><div><dt>Estado</dt><dd>{health?.state ?? "sin conexión"}</dd></div><div><dt>Dispositivo</dt><dd>{health?.device ?? "—"}</dd></div><div><dt>Modelos</dt><dd>{diagnostic}</dd></div></dl></section>
    <section className="history"><div className="section-heading"><div><p className="eyebrow">HISTORIAL LOCAL</p><h2>Expedientes confirmados</h2></div>{history.length > 0 && <button className="danger-link" onClick={async () => { await api("/api/claims", { method: "DELETE" }); await refresh(); }}>Borrar todo</button>}</div>{history.length === 0 ? <p>No hay expedientes confirmados.</p> : <ul>{history.map((item) => <li key={item.id}><span><b>{item.procedure.id}</b> · {item.summary}</span><button className="danger-link" onClick={async () => { await api(`/api/claims/${item.id}`, { method: "DELETE" }); await refresh(); }}>Eliminar</button></li>)}</ul>}</section>
  </main>;
}
