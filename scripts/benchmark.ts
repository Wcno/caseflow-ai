import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClaimPreparer } from "../src/server/claims/prepare-claim.js";
import { procedures } from "../src/server/claims/procedures.js";
import { QvacRuntime } from "../src/server/qvac/qvac-runtime.js";

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
  for (const [index, text] of claims.entries()) {
    const began = performance.now();
    try {
      const result = await prepareClaim({ kind: "text", text }, () => undefined);
      results.push({ index: index + 1, milliseconds: Math.round(performance.now() - began), status: "ready", procedure: result.procedure.id });
    } catch (error) {
      results.push({ index: index + 1, milliseconds: Math.round(performance.now() - began), status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }
} finally { await runtime.dispose(); }
const ordered = results.map((item) => item.milliseconds).sort((a, b) => a - b);
const p95 = ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] ?? 0;
const report = { generatedAt: new Date().toISOString(), started, modelMode: process.env.CASEFLOW_SMALL_MODEL === "1" ? "QWEN3_600M_INST_Q4" : "QWEN3_1_7B_INST_Q4", p95Milliseconds: p95, thresholdMilliseconds: 120_000, passed: p95 < 120_000, results };
await mkdir(resolve("output"), { recursive: true });
await writeFile(resolve("output", "benchmark.json"), JSON.stringify(report, null, 2));
await writeFile(resolve("docs", "benchmark-latest.md"), `# Benchmark local\n\nGenerado: ${report.generatedAt}\n\n- Modelo: ${report.modelMode}\n- Casos: ${results.length}\n- p95: ${(p95 / 1000).toFixed(2)} s\n- Umbral: < 120 s\n- Resultado: ${report.passed ? "APROBADO" : "NO APROBADO"}\n\nDescarga y arranque frío se reportan por separado y no se incluyen en esta métrica.\n\n| Caso | Estado | Procedimiento | Tiempo |\n| --- | --- | --- | --- |\n${results.map((result) => `| ${result.index} | ${result.status} | ${result.procedure ?? result.error ?? "—"} | ${(result.milliseconds / 1000).toFixed(2)} s |`).join("\n")}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
