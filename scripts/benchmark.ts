import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClaimPreparer } from "../src/server/claims/prepare-claim.js";
import { procedures } from "../src/server/claims/procedures.js";
import { QvacRuntime } from "../src/server/qvac/qvac-runtime.js";
import { buildApp } from "../src/server/app.js";
import { createMemoryClaimStore } from "../src/server/storage/claim-store.js";

const claims = [
  "Retiré $80 en un cajero de Vía España y mi cuenta fue debitada, pero no recibí efectivo.",
  "No reconozco una compra de $31.50 con mi tarjeta el 8 de septiembre.",
  "El cajero retuvo mi tarjeta ayer en la sucursal central.",
  "Veo un débito de $12 no reconocido en mi cuenta de ahorro.",
  "Mi saldo disponible es diferente al saldo que esperaba desde ayer.",
  "Mi cuenta de ahorro aparece restringida y no puedo usar mis fondos.",
  "Envié una transferencia de $50 con referencia ABCD1234 y el destinatario no la recibió.",
  "La transferencia con referencia ABCD1234 se procesó dos veces.",
  "Envié una transferencia a un beneficiario incorrecto con referencia ABCD1234.",
  "La aplicación de banca digital muestra acceso bloqueado en mi celular."
];
const runtime = new QvacRuntime(procedures);
const started = new Date().toISOString();
const results: Array<{ index: number; milliseconds: number; status: string; procedure?: string; error?: string }> = [];
try {
  await runtime.initialize();
  const prepareClaim = createClaimPreparer({ inference: runtime, retriever: runtime, procedures });
  const app = buildApp({
    prepareClaim,
    store: createMemoryClaimStore(),
    procedures,
    readiness: async () => runtime.readiness()
  });
  for (const [index, text] of claims.entries()) {
    const began = performance.now();
    try {
      const created = await app.inject({ method: "POST", url: "/api/runs", payload: { kind: "text", text } });
      const { runId } = created.json<{ runId: string }>();
      let run = (await app.inject({ method: "GET", url: `/api/runs/${runId}` })).json() as { status: string; result?: { procedure: { id: string } }; error?: { message: string } };
      while (!["ready", "failed"].includes(run.status)) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        run = (await app.inject({ method: "GET", url: `/api/runs/${runId}` })).json() as typeof run;
      }
      const milliseconds = Math.round(performance.now() - began);
      results.push(run.status === "ready"
        ? { index: index + 1, milliseconds, status: "ready", procedure: run.result?.procedure.id }
        : { index: index + 1, milliseconds, status: "failed", error: run.error?.message ?? "La ejecución falló." });
    } catch (error) {
      results.push({ index: index + 1, milliseconds: Math.round(performance.now() - began), status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }
  await app.close();
} finally { await runtime.dispose(); }
const ordered = results.map((item) => item.milliseconds).sort((a, b) => a - b);
const p95 = ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] ?? 0;
const allReady = results.length === claims.length && results.every((result) => result.status === "ready");
const report = { generatedAt: new Date().toISOString(), started, modelMode: "QWEN3_600M_INST_Q4", p95Milliseconds: p95, thresholdMilliseconds: 120_000, allReady, passed: allReady && p95 < 120_000, results };
await mkdir(resolve("output"), { recursive: true });
await writeFile(resolve("output", "benchmark.json"), JSON.stringify(report, null, 2));
await writeFile(resolve("docs", "benchmark-latest.md"), `# Benchmark local\n\nGenerado: ${report.generatedAt}\n\n- Modelo: ${report.modelMode}\n- Casos: ${results.length}\n- p95: ${(p95 / 1000).toFixed(2)} s\n- Umbral: < 120 s\n- Todos listos: ${allReady ? "sí" : "no"}\n- Resultado: ${report.passed ? "APROBADO" : "NO APROBADO"}\n\nDescarga y arranque frío se reportan por separado y no se incluyen en esta métrica.\n\n| Caso | Estado | Procedimiento | Tiempo |\n| --- | --- | --- | --- |\n${results.map((result) => `| ${result.index} | ${result.status} | ${result.procedure ?? result.error ?? "—"} | ${(result.milliseconds / 1000).toFixed(2)} s |`).join("\n")}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
