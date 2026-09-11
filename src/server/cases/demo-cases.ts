import { randomUUID } from "node:crypto";
import type { CaseStatus, OperationalCase, PreparedClaim } from "../../shared/contracts.js";
import type { Procedure } from "../claims/procedures.js";
import { specialists } from "./specialists.js";

const names = ["Ana Prueba", "Bruno Demostración", "Carla Ejemplo", "Daniel Sintético", "Elisa Muestra", "Fabio Local", "Gabriela Ensayo", "Hugo Prueba", "Irene Demostración"];
const statuses: readonly CaseStatus[] = ["received", "preparing", "pending_assignment", "assigned", "investigating", "waiting_customer", "resolved", "closed", "cancelled"];

function prepared(procedure: Procedure, index: number): PreparedClaim {
  const extractedFields = Object.fromEntries(procedure.requiredFields.map((field) => [field, field === "amount" ? `B/.${80 + index}.00` : `DEMO-${index + 1}`]));
  return {
    transcript: `Narrativa completamente sintética para demostrar ${procedure.title.toLowerCase()}.`,
    product: procedure.product,
    category: procedure.category,
    extractedFields,
    summary: `Caso sintético de ${procedure.title.toLowerCase()}.`,
    procedure: { id: procedure.id, title: procedure.title, source: `synthetic://procedures/${procedure.id}`, excerpt: `${procedure.steps.join(" ")} ${procedure.illustrativeSla}` },
    responsibleArea: procedure.responsibleArea,
    missingInformation: index === 5 ? [procedure.requiredFields.at(-1) ?? "dato_adicional"] : [],
    draftResponse: procedure.responseGuidance,
    confidence: 0.9,
    timingsMs: { total: 1_800 },
    inference: { provider: "QVAC", location: "local", models: ["Datos sintéticos precargados"] }
  };
}

export function createDemoCases(procedures: readonly Procedure[]): readonly OperationalCase[] {
  const base = Date.parse("2026-09-10T14:00:00.000Z");
  return statuses.map((status, index) => {
    const procedure = procedures[index % procedures.length];
    const receivedAt = new Date(base - index * 86_400_000).toISOString();
    const advanced = !["received", "preparing"].includes(status);
    const claim = advanced ? prepared(procedure, index) : undefined;
    const assignee = ["assigned", "investigating", "waiting_customer", "resolved", "closed"].includes(status)
      ? specialists.find((item) => item.area === procedure.responsibleArea)
      : undefined;
    const hasResolution = ["resolved", "closed"].includes(status);
    const lastUpdatedAt = new Date(base - index * 43_200_000).toISOString();
    const resolution = hasResolution ? {
      checklist: procedure.steps.map((step) => ({ step, completed: true as const, result: "Paso completado con evidencia sintética." })),
      investigationSummary: "La revisión local sintética completó todos los pasos del procedimiento.",
      resolution: "Resolución favorable utilizada únicamente para demostrar el workflow.",
      customerResponse: "Su reclamo sintético fue resuelto. Este mensaje no fue enviado externamente.",
      evidence: [`EVIDENCIA-DEMO-${index + 1}`]
    } : undefined;
    return {
      id: randomUUID(), trackingNumber: `CF-2026-${String(101 + index).padStart(6, "0")}`,
      customer: { fullName: names[index], nationalId: `8-000-${String(1001 + index)}`, customerNumber: `CLI-${String(21001 + index)}`, intakeChannel: index % 2 ? "whatsapp" : "phone", preferredContact: index % 2 ? "whatsapp" : "phone" },
      narrative: `Narrativa completamente sintética para el expediente ${index + 1}.`,
      receivedAt, lastUpdatedAt, status, archived: false,
      preparedClaim: claim,
      confirmedAt: advanced ? receivedAt : undefined,
      incidentAt: advanced ? `2026-09-${String(Math.max(1, 9 - index)).padStart(2, "0")}` : undefined,
      targetAt: advanced ? new Date(Date.parse(receivedAt) + 10 * 86_400_000).toISOString() : undefined,
      responsibleArea: assignee ? procedure.responsibleArea : claim?.responsibleArea,
      assignee, assignedAt: assignee ? receivedAt : undefined,
      resolution, resolvedAt: hasResolution ? lastUpdatedAt : undefined,
      closedAt: status === "closed" ? lastUpdatedAt : undefined,
      communications: status === "closed" ? [{ id: randomUUID(), at: lastUpdatedAt, channel: "whatsapp", message: resolution!.customerResponse, delivered: true }] : [],
      history: [
        { id: randomUUID(), type: "created", at: receivedAt, actor: { role: "operator", name: "María Operadora" }, description: "Recepción sintética registrada." },
        ...(status !== "received" ? [{ id: randomUUID(), type: "demo_state", at: lastUpdatedAt, actor: { role: "operator" as const, name: "María Operadora" }, description: `Caso precargado en estado ${status} para la demostración.` }] : [])
      ]
    };
  });
}
