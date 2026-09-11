import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server/app.js";
import { createMemoryClaimStore } from "../src/server/storage/claim-store.js";
import { createMemoryCaseStore } from "../src/server/cases/case-store.js";
import { specialists } from "../src/server/cases/specialists.js";
import type { PreparedClaim } from "../src/shared/contracts.js";

const preparedClaim: PreparedClaim = {
  transcript: "Retiro sintético debitado sin entrega de efectivo.",
  product: "tarjeta_debito",
  category: "retiro_atm_efectivo_no_entregado",
  extractedFields: { amount: "B/.80.00" },
  summary: "Retiro debitado sin entrega de efectivo.",
  procedure: { id: "ATM-001", title: "Retiro debitado sin entrega de efectivo", source: "synthetic://procedures/ATM-001", excerpt: "Conciliar el cajero." },
  responsibleArea: "Operaciones de Cajeros y Disputas",
  missingInformation: ["identificador_cajero", "hora_aproximada"],
  draftResponse: "Hemos recibido su reclamo sintético.",
  confidence: 0.96,
  timingsMs: { total: 20 },
  inference: { provider: "QVAC", location: "local", models: ["test"] }
};

describe("operational case HTTP interface", () => {
  async function createPendingCase(app: ReturnType<typeof buildApp>) {
    const reception = (await app.inject({ method: "POST", url: "/api/cases", payload: {
      customer: { fullName: "Ana Prueba", nationalId: "8-000-0123", customerNumber: "CLI-10023", intakeChannel: "phone", preferredContact: "phone" },
      narrative: preparedClaim.transcript
    } })).json<{ id: string }>();
    const started = await app.inject({ method: "POST", url: "/api/runs", payload: { kind: "text", text: preparedClaim.transcript, caseId: reception.id } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await app.inject({ method: "POST", url: `/api/runs/${started.json<{ runId: string }>().runId}/confirm`, payload: preparedClaim });
    return reception.id;
  }

  async function createInvestigatingCase(app: ReturnType<typeof buildApp>) {
    const caseId = await createPendingCase(app);
    const specialist = specialists.find((item) => item.area === preparedClaim.responsibleArea)!;
    await app.inject({ method: "POST", url: `/api/cases/${caseId}/commands`, payload: { type: "assign", area: specialist.area, assigneeId: specialist.id, actor: { role: "operator", name: "María Operadora" } } });
    await app.inject({ method: "POST", url: `/api/cases/${caseId}/commands`, payload: { type: "transition", status: "investigating", actor: { role: "specialist", name: specialist.name } } });
    return { caseId, specialist };
  }
  it("issues a stable tracking number as soon as a synthetic reception is registered", async () => {
    const app = buildApp({
      prepareClaim: async () => { throw new Error("not used"); },
      store: createMemoryClaimStore(),
      caseStore: createMemoryCaseStore({ now: () => new Date("2026-09-10T14:00:00.000Z") }),
      readiness: async () => ({ ready: true, models: [] })
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/cases",
      payload: {
        customer: {
          fullName: "Ana Prueba",
          nationalId: "8-000-0123",
          customerNumber: "CLI-10023",
          intakeChannel: "phone",
          preferredContact: "phone"
        },
        narrative: "Retiro sintético debitado sin entrega de efectivo."
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      trackingNumber: "CF-2026-000001",
      status: "received",
      receivedAt: "2026-09-10T14:00:00.000Z",
      customer: { fullName: "Ana Prueba", nationalId: "8-000-0123" }
    });
    await app.close();
  });

  it("links local preparation to the reception and moves the confirmed case to pending assignment", async () => {
    const app = buildApp({
      prepareClaim: async () => preparedClaim,
      store: createMemoryClaimStore(),
      caseStore: createMemoryCaseStore(),
      readiness: async () => ({ ready: true, models: [] })
    });
    const reception = (await app.inject({
      method: "POST", url: "/api/cases",
      payload: { customer: { fullName: "Ana Prueba", nationalId: "8-000-0123", customerNumber: "CLI-10023", intakeChannel: "phone", preferredContact: "phone" }, narrative: preparedClaim.transcript }
    })).json<{ id: string }>();

    const started = await app.inject({ method: "POST", url: "/api/runs", payload: { kind: "text", text: preparedClaim.transcript, caseId: reception.id } });
    const { runId } = started.json<{ runId: string }>();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const confirmed = await app.inject({ method: "POST", url: `/api/runs/${runId}/confirm`, payload: preparedClaim });

    expect(confirmed.statusCode).toBe(201);
    expect(confirmed.json()).toMatchObject({ id: reception.id, status: "pending_assignment", preparedClaim: { procedure: { id: "ATM-001" } } });
    const detail = await app.inject({ method: "GET", url: `/api/cases/${reception.id}` });
    expect(detail.json().history.map((event: { type: string }) => event.type)).toEqual(["created", "preparing", "prepared"]);
    await app.close();
  });

  it("persists an explicit QVAC customer candidate when the operator confirms the preparation", async () => {
    const candidateClaim = { ...preparedClaim, customerReferenceCandidate: { fullName: "Ana Prueba", nationalId: "8-000-0123", customerNumber: "CLI-10023" } };
    const app = buildApp({ prepareClaim: async () => candidateClaim, store: createMemoryClaimStore(), caseStore: createMemoryCaseStore(), readiness: async () => ({ ready: true, models: [] }) });
    const reception = (await app.inject({ method: "POST", url: "/api/cases", payload: {
      customer: { fullName: "Cliente por confirmar", nationalId: "", customerNumber: "", intakeChannel: "phone", preferredContact: "phone" },
      narrative: candidateClaim.transcript
    } })).json<{ id: string }>();
    const started = await app.inject({ method: "POST", url: "/api/runs", payload: { kind: "text", text: candidateClaim.transcript, caseId: reception.id } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const confirmed = await app.inject({ method: "POST", url: `/api/runs/${started.json<{ runId: string }>().runId}/confirm`, payload: candidateClaim });
    expect(confirmed.json()).toMatchObject({ customer: candidateClaim.customerReferenceCandidate });
    await app.close();
  });

  it("assigns a confirmed area and matching synthetic specialist with an immutable event", async () => {
    const app = buildApp({ prepareClaim: async () => preparedClaim, store: createMemoryClaimStore(), caseStore: createMemoryCaseStore(), readiness: async () => ({ ready: true, models: [] }) });
    const caseId = await createPendingCase(app);
    const specialist = specialists.find((item) => item.area === preparedClaim.responsibleArea)!;

    const response = await app.inject({ method: "POST", url: `/api/cases/${caseId}/commands`, payload: {
      type: "assign", area: preparedClaim.responsibleArea, assigneeId: specialist.id,
      actor: { role: "operator", name: "María Operadora" }
    } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "assigned", responsibleArea: preparedClaim.responsibleArea, assignee: { id: specialist.id } });
    expect(response.json().history.at(-1)).toMatchObject({ type: "assigned", actor: { role: "operator" } });
    await app.close();
  });

  it("allows only the assigned specialist to start investigation", async () => {
    const app = buildApp({ prepareClaim: async () => preparedClaim, store: createMemoryClaimStore(), caseStore: createMemoryCaseStore(), readiness: async () => ({ ready: true, models: [] }) });
    const caseId = await createPendingCase(app);
    const specialist = specialists.find((item) => item.area === preparedClaim.responsibleArea)!;
    await app.inject({ method: "POST", url: `/api/cases/${caseId}/commands`, payload: { type: "assign", area: specialist.area, assigneeId: specialist.id, actor: { role: "operator", name: "María Operadora" } } });

    const denied = await app.inject({ method: "POST", url: `/api/cases/${caseId}/commands`, payload: { type: "transition", status: "investigating", actor: { role: "specialist", name: "Otra Persona" } } });
    expect(denied.statusCode).toBe(409);
    const accepted = await app.inject({ method: "POST", url: `/api/cases/${caseId}/commands`, payload: { type: "transition", status: "investigating", actor: { role: "specialist", name: specialist.name } } });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ status: "investigating" });
    await app.close();
  });

  it("requires a complete specialist resolution before marking the case resolved", async () => {
    const app = buildApp({ prepareClaim: async () => preparedClaim, store: createMemoryClaimStore(), caseStore: createMemoryCaseStore(), readiness: async () => ({ ready: true, models: [] }) });
    const { caseId, specialist } = await createInvestigatingCase(app);
    const incomplete = await app.inject({ method: "POST", url: `/api/cases/${caseId}/commands`, payload: {
      type: "resolve", actor: { role: "specialist", name: specialist.name }, checklist: [], investigationSummary: "", resolution: "", customerResponse: "", evidence: []
    } });
    expect(incomplete.statusCode).toBe(400);

    const completed = await app.inject({ method: "POST", url: `/api/cases/${caseId}/commands`, payload: {
      type: "resolve", actor: { role: "specialist", name: specialist.name },
      checklist: [{ step: "Validar débito", completed: true, result: "Débito sintético confirmado." }],
      investigationSummary: "La conciliación sintética confirmó el débito.",
      resolution: "Procede el ajuste sintético de B/.80.00.",
      customerResponse: "Su reclamo fue resuelto favorablemente en esta simulación.",
      evidence: ["Conciliación ATM DEMO-001"]
    } });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toMatchObject({ status: "resolved", resolution: { evidence: ["Conciliación ATM DEMO-001"] } });
    await app.close();
  });

  it("closes after simulated delivery and exposes only the customer tracking view", async () => {
    const app = buildApp({ prepareClaim: async () => preparedClaim, store: createMemoryClaimStore(), caseStore: createMemoryCaseStore(), readiness: async () => ({ ready: true, models: [] }) });
    const { caseId, specialist } = await createInvestigatingCase(app);
    const resolved = (await app.inject({ method: "POST", url: `/api/cases/${caseId}/commands`, payload: {
      type: "resolve", actor: { role: "specialist", name: specialist.name },
      checklist: [{ step: "Validar débito", completed: true, result: "Débito sintético confirmado." }],
      investigationSummary: "La conciliación sintética confirmó el débito.", resolution: "Procede el ajuste sintético de B/.80.00.",
      customerResponse: "Su reclamo fue resuelto favorablemente en esta simulación.", evidence: ["Conciliación ATM DEMO-001"]
    } })).json<{ trackingNumber: string }>();
    const delivered = await app.inject({ method: "POST", url: `/api/cases/${caseId}/commands`, payload: {
      type: "communicate", actor: { role: "operator", name: "María Operadora" }, channel: "whatsapp",
      message: "Su reclamo sintético fue resuelto. Consulte con su número de seguimiento.", delivered: true
    } });
    expect(delivered.json()).toMatchObject({ status: "closed", communications: [{ channel: "whatsapp", delivered: true }] });

    const tracking = await app.inject({ method: "POST", url: "/api/tracking", payload: { trackingNumber: resolved.trackingNumber, nationalIdLast4: "0123" } });
    expect(tracking.statusCode).toBe(200);
    expect(tracking.json()).toMatchObject({ trackingNumber: resolved.trackingNumber, status: "Cerrado", responsibleArea: preparedClaim.responsibleArea, customerResponse: "Su reclamo fue resuelto favorablemente en esta simulación." });
    expect(tracking.json()).not.toHaveProperty("assignee");
    expect(tracking.json()).not.toHaveProperty("history");
    expect(tracking.json()).not.toHaveProperty("resolution.evidence");
    await app.close();
  });

  it("requires a reason to reassign and archives without deleting the history", async () => {
    const app = buildApp({ prepareClaim: async () => preparedClaim, store: createMemoryClaimStore(), caseStore: createMemoryCaseStore(), readiness: async () => ({ ready: true, models: [] }) });
    const caseId = await createPendingCase(app);
    const specialist = specialists.find((item) => item.area === preparedClaim.responsibleArea)!;
    await app.inject({ method: "POST", url: `/api/cases/${caseId}/commands`, payload: { type: "assign", area: specialist.area, assigneeId: specialist.id, actor: { role: "operator", name: "María Operadora" } } });
    const noReason = await app.inject({ method: "POST", url: `/api/cases/${caseId}/commands`, payload: { type: "assign", area: specialist.area, assigneeId: specialist.id, actor: { role: "operator", name: "María Operadora" } } });
    expect(noReason.statusCode).toBe(409);
    const archived = await app.inject({ method: "POST", url: `/api/cases/${caseId}/commands`, payload: { type: "archive", reason: "Caso sintético retirado de la bandeja activa.", actor: { role: "operator", name: "María Operadora" } } });
    expect(archived.json()).toMatchObject({ archived: true });
    expect(archived.json().history.at(-1)).toMatchObject({ type: "archived", reason: "Caso sintético retirado de la bandeja activa." });
    await app.close();
  });
});
