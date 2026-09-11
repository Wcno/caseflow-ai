import { describe, expect, it } from "vitest";
import { mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/server/app.js";
import type { PreparedClaim } from "../src/shared/contracts.js";
import { createMemoryClaimStore } from "../src/server/storage/claim-store.js";
import { procedures } from "../src/server/claims/procedures.js";

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

  it("rejects an edited claim whose area or procedure is outside the local catalog", async () => {
    const app = buildApp({
      prepareClaim: async () => preparedClaim,
      store: createMemoryClaimStore(),
      procedures,
      readiness: async () => ({ ready: true, models: [] })
    });
    const created = await app.inject({ method: "POST", url: "/api/runs", payload: { kind: "text", text: "Retiro debitado sin efectivo" } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const { runId } = created.json<{ runId: string }>();
    const invalidArea = await app.inject({ method: "POST", url: `/api/runs/${runId}/confirm`, payload: { ...preparedClaim, responsibleArea: "Área inventada" } });
    expect(invalidArea.statusCode).toBe(422);
    const inventedProcedure = await app.inject({ method: "POST", url: `/api/runs/${runId}/confirm`, payload: { ...preparedClaim, procedure: { ...preparedClaim.procedure, id: "FAKE-999" } } });
    expect(inventedProcedure.statusCode).toBe(422);
    await app.close();
  });

  it("issues a customer ticket while the AI reference is still pending", async () => {
    const app = buildApp({
      prepareClaim: async () => preparedClaim,
      store: createMemoryClaimStore(),
      readiness: async () => ({ ready: true, models: [] })
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/cases",
      payload: {
        customer: { fullName: "Cliente Prueba", nationalId: "", customerNumber: "CLI-10023", intakeChannel: "phone", preferredContact: "phone" },
        narrative: "Retiro sintetico debitado sin entrega de efectivo."
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ trackingNumber: expect.stringMatching(/^CF-\d{4}-\d{6}$/), customer: { nationalId: "" } });
    await app.close();
  });

  it.each([
    ["not_applicable", "cancelled", "El relato no corresponde a un reclamo bancario cubierto."],
    ["needs_clarification", "waiting_customer", "Necesitamos saber qué operación bancaria intentaba realizar."]
  ] as const)("publishes %s as a non-technical terminal disposition", async (expectedStatus, expectedCaseStatus, message) => {
    const app = buildApp({
      prepareClaim: async () => ({ kind: expectedStatus, guidance: message, transcript: "Relato sintético sin clasificación" }),
      store: createMemoryClaimStore(),
      readiness: async () => ({ ready: true, models: [] })
    });
    const reception = (await app.inject({
      method: "POST",
      url: "/api/cases",
      payload: {
        customer: { fullName: "Cliente Prueba", nationalId: "8-000-0123", customerNumber: "CLI-10023", intakeChannel: "phone", preferredContact: "phone" },
        narrative: "Relato sintético sin clasificación"
      }
    })).json<{ id: string }>();
    const created = await app.inject({ method: "POST", url: "/api/runs", payload: { kind: "text", text: "Relato sintético sin clasificación", caseId: reception.id } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const run = (await app.inject({ method: "GET", url: `/api/runs/${created.json<{ runId: string }>().runId}` })).json();
    const operationalCase = (await app.inject({ method: "GET", url: `/api/cases/${reception.id}` })).json();

    expect(run).toMatchObject({
      status: expectedStatus,
      transcript: "Relato sintético sin clasificación",
      disposition: { kind: expectedStatus, guidance: message }
    });
    expect(run.error).toBeUndefined();
    expect(run.result).toBeUndefined();
    expect(operationalCase).toMatchObject({ id: reception.id, status: expectedCaseStatus, narrative: "Relato sintético sin clasificación" });
    await app.close();
  });

  it("removes a multipart audio upload when the linked case does not exist", async () => {
    const uploadDirectory = join(tmpdir(), "caseflow-ai");
    await mkdir(uploadDirectory, { recursive: true });
    const before = new Set(await readdir(uploadDirectory));
    const boundary = "----caseflow-test-boundary";
    const payload = Buffer.from([
      `--${boundary}\r\n`,
      "Content-Disposition: form-data; name=\"file\"; filename=\"claim.wav\"\r\n",
      "Content-Type: audio/wav\r\n\r\n",
      "synthetic audio bytes\r\n",
      `--${boundary}--\r\n`
    ].join(""));
    const app = buildApp({
      prepareClaim: async () => { throw new Error("prepareClaim should not be called"); },
      store: createMemoryClaimStore(),
      readiness: async () => ({ ready: true, models: [] })
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/runs?caseId=missing-case",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload
    });
    const after = new Set(await readdir(uploadDirectory));

    expect(response.statusCode).toBe(404);
    expect([...after].sort()).toEqual([...before].sort());
    await app.close();
  });
});
