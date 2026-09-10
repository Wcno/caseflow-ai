import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server/app.js";
import type { PreparedClaim } from "../src/shared/contracts.js";
import { createMemoryClaimStore } from "../src/server/storage/claim-store.js";

const preparedClaim: PreparedClaim = {
  transcript: "Retiro debitado sin entrega de efectivo.",
  product: "tarjeta_debito",
  category: "retiro_atm_efectivo_no_entregado",
  extractedFields: { amount: "B/.120.00" },
  summary: "Retiro debitado sin entrega de efectivo.",
  procedure: {
    id: "ATM-001",
    title: "Retiro debitado sin entrega de efectivo",
    source: "synthetic://procedures/ATM-001",
    excerpt: "Validar el débito y conciliar el cajero."
  },
  responsibleArea: "Operaciones de Cajeros y Disputas",
  missingInformation: ["identificador_cajero", "hora_aproximada"],
  draftResponse: "Necesitamos dos datos para continuar.",
  confidence: 0.96,
  timingsMs: { total: 35, retrieving: 10, analyzing: 20, validating: 5 },
  inference: {
    provider: "QVAC",
    location: "local",
    models: ["test-llm"]
  }
};

describe("local HTTP interface", () => {
  it("creates a run, exposes the prepared claim, and confirms edited content", async () => {
    const app = buildApp({
      prepareClaim: async (_input, onProgress) => {
        onProgress({ stage: "retrieving", elapsedMs: 5 });
        onProgress({ stage: "ready", elapsedMs: 35 });
        return preparedClaim;
      },
      store: createMemoryClaimStore(),
      readiness: async () => ({ ready: true, models: ["test-llm"] })
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: { kind: "text", text: "Retiro debitado sin efectivo" }
    });
    expect(createResponse.statusCode).toBe(202);
    const { runId } = createResponse.json<{ runId: string }>();

    await new Promise((resolve) => setTimeout(resolve, 0));
    const runResponse = await app.inject({ method: "GET", url: `/api/runs/${runId}` });
    expect(runResponse.json().status).toBe("ready");
    expect(runResponse.json().result.procedure.id).toBe("ATM-001");

    const confirmResponse = await app.inject({
      method: "POST",
      url: `/api/runs/${runId}/confirm`,
      payload: { ...preparedClaim, summary: "Resumen corregido por el colaborador." }
    });
    expect(confirmResponse.statusCode).toBe(201);

    const historyResponse = await app.inject({ method: "GET", url: "/api/claims" });
    expect(historyResponse.json()).toHaveLength(1);
    expect(historyResponse.json()[0].summary).toBe("Resumen corregido por el colaborador.");
    await app.close();
  });

  it("keeps the transcript but no invented result when preparation fails", async () => {
    const app = buildApp({
      prepareClaim: async () => {
        throw Object.assign(new Error("Salida local inválida"), {
          code: "INVALID_INFERENCE_OUTPUT",
          transcript: "Texto conservado"
        });
      },
      store: createMemoryClaimStore(),
      readiness: async () => ({ ready: true, models: [] })
    });
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: { kind: "text", text: "Texto conservado" }
    });
    const { runId } = createResponse.json<{ runId: string }>();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const run = (await app.inject({ method: "GET", url: `/api/runs/${runId}` })).json();
    expect(run.status).toBe("failed");
    expect(run.transcript).toBe("Texto conservado");
    expect(run.result).toBeUndefined();
    await app.close();
  });

  it("deletes individual and all locally confirmed claims", async () => {
    const store = createMemoryClaimStore();
    const saved = await store.save(preparedClaim);
    const app = buildApp({
      prepareClaim: async () => preparedClaim,
      store,
      readiness: async () => ({ ready: true, models: [] })
    });
    expect((await app.inject({ method: "DELETE", url: `/api/claims/${saved.id}` })).statusCode).toBe(204);
    await store.save(preparedClaim);
    expect((await app.inject({ method: "DELETE", url: "/api/claims" })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/api/claims" })).json()).toEqual([]);
    await app.close();
  });
});
