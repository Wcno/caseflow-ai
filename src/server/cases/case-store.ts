import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { CaseCommand, CreateCaseInput, CustomerTrackingView, IntakeDisposition, OperationalCase, PreparedClaim, TrackingLookup } from "../../shared/contracts.js";
import { specialists } from "./specialists.js";

export class CaseRuleError extends Error {}

export interface CaseStore {
  create(input: CreateCaseInput): Promise<OperationalCase>;
  list(): Promise<readonly OperationalCase[]>;
  get(id: string): Promise<OperationalCase | undefined>;
  startPreparation(id: string): Promise<OperationalCase | undefined>;
  recordIntakeDisposition(id: string, disposition: IntakeDisposition): Promise<OperationalCase | undefined>;
  confirmPreparation(id: string, claim: PreparedClaim): Promise<OperationalCase | undefined>;
  applyCommand(id: string, command: CaseCommand): Promise<OperationalCase | undefined>;
  track(lookup: TrackingLookup): Promise<CustomerTrackingView | undefined>;
  resetDemo(cases: readonly OperationalCase[]): Promise<readonly OperationalCase[]>;
  close(): Promise<void>;
}

interface MemoryCaseStoreOptions {
  now?: () => Date;
  initialCases?: readonly OperationalCase[];
  onChange?: (value: OperationalCase) => void;
  onReset?: (values: readonly OperationalCase[]) => void;
}

export function createMemoryCaseStore(options: MemoryCaseStoreOptions = {}): CaseStore {
  const cases = new Map((options.initialCases ?? []).map((item) => [item.id, item]));
  const now = options.now ?? (() => new Date());
  let sequence = Math.max(0, ...[...cases.values()].map((item) => Number(item.trackingNumber.slice(-6)) || 0));
  const keep = (value: OperationalCase) => { cases.set(value.id, value); options.onChange?.(value); return value; };
  return {
    async create(input) {
      const receivedAt = now().toISOString();
      const id = randomUUID();
      const trackingNumber = `CF-${receivedAt.slice(0, 4)}-${String(++sequence).padStart(6, "0")}`;
      const created: OperationalCase = {
        id,
        trackingNumber,
        customer: input.customer,
        narrative: input.narrative,
        receivedAt,
        status: "received",
        lastUpdatedAt: receivedAt,
        archived: false,
        history: [{
          id: randomUUID(),
          type: "created",
          at: receivedAt,
          actor: { role: "operator", name: "María Operadora" },
          description: "Recepción sintética registrada y número de seguimiento emitido."
        }]
      };
      return keep(created);
    },
    async list() {
      return [...cases.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    },
    async get(id) { return cases.get(id); },
    async startPreparation(id) {
      const current = cases.get(id);
      if (!current) return undefined;
      const at = now().toISOString();
      const updated: OperationalCase = {
        ...current,
        status: "preparing",
        lastUpdatedAt: at,
        history: [...current.history, {
          id: randomUUID(), type: "preparing", at,
          actor: { role: "operator", name: "María Operadora" },
          description: "Preparación local iniciada."
        }]
      };
      return keep(updated);
    },
    async recordIntakeDisposition(id, disposition) {
      const current = cases.get(id);
      if (!current) return undefined;
      const at = now().toISOString();
      const updated: OperationalCase = {
        ...current,
        narrative: disposition.transcript,
        status: disposition.kind === "not_applicable" ? "cancelled" : "waiting_customer",
        lastUpdatedAt: at,
        history: [...current.history, {
          id: randomUUID(),
          type: "intake_disposition",
          at,
          actor: { role: "operator", name: "María Operadora" },
          description: disposition.kind === "not_applicable"
            ? "Recepción marcada como no aplicable al catálogo local."
            : "Recepción pendiente de aclaración con el cliente.",
          reason: disposition.guidance
        }]
      };
      return keep(updated);
    },
    async confirmPreparation(id, claim) {
      const current = cases.get(id);
      if (!current) return undefined;
      const confirmedAt = now().toISOString();
      const slaDays = Number(/(\d+)/.exec(claim.procedure.excerpt)?.[1] ?? 0);
      const targetAt = slaDays ? new Date(new Date(confirmedAt).getTime() + slaDays * 86_400_000).toISOString() : undefined;
      const candidate = claim.customerReferenceCandidate;
      const customer = candidate ? {
        ...current.customer,
        fullName: candidate.fullName || current.customer.fullName,
        nationalId: candidate.nationalId || current.customer.nationalId,
        customerNumber: candidate.customerNumber || current.customer.customerNumber
      } : current.customer;
      const updated: OperationalCase = {
        ...current,
        customer,
        narrative: claim.transcript,
        preparedClaim: claim,
        status: "pending_assignment",
        confirmedAt,
        incidentAt: claim.extractedFields.date || undefined,
        targetAt,
        lastUpdatedAt: confirmedAt,
        history: [...current.history, {
          id: randomUUID(), type: "prepared", at: confirmedAt,
          actor: { role: "operator", name: "María Operadora" },
          description: "Expediente preparado, revisado y confirmado por el operador."
        }]
      };
      return keep(updated);
    },
    async applyCommand(id, command) {
      const current = cases.get(id);
      if (!current) return undefined;
      if (current.archived && command.type !== "archive") throw new CaseRuleError("El expediente archivado es de solo lectura.");
      if (command.type === "assign") {
        if (command.actor.role !== "operator") throw new CaseRuleError("Solo el operador puede asignar un expediente.");
        if (!["pending_assignment", "assigned", "investigating", "waiting_customer"].includes(current.status)) throw new CaseRuleError("El expediente no está disponible para asignación.");
        if (current.assignee && !command.reason) throw new CaseRuleError("Indica el motivo de la reasignación.");
        if (!current.customer.fullName.trim() || (!current.customer.nationalId.trim() && !current.customer.customerNumber.trim())) {
          throw new CaseRuleError("Confirma el nombre y al menos una identificación antes de asignar.");
        }
        const assignee = specialists.find((item) => item.id === command.assigneeId && item.area === command.area);
        if (!assignee) throw new CaseRuleError("El especialista no pertenece al área seleccionada.");
        const at = now().toISOString();
        const updated: OperationalCase = {
          ...current,
          status: "assigned",
          responsibleArea: command.area,
          assignee,
          assignedAt: at,
          lastUpdatedAt: at,
          history: [...current.history, {
            id: randomUUID(), type: "assigned", at, actor: command.actor,
            description: `Expediente asignado a ${assignee.name} en ${command.area}.`,
            reason: command.reason
          }]
        };
        return keep(updated);
      }
      if (command.type === "transition") {
        const specialistOwns = command.actor.role === "specialist" && current.assignee?.name === command.actor.name;
        const needsReason = command.status === "cancelled" || current.status === "closed" || command.status === "preparing";
        if (needsReason && !command.reason) throw new CaseRuleError("Indica el motivo de esta transición excepcional.");
        const allowed =
          (current.status === "assigned" && command.status === "investigating" && specialistOwns) ||
          (current.status === "investigating" && command.status === "waiting_customer" && specialistOwns) ||
          (current.status === "waiting_customer" && command.status === "investigating" && specialistOwns) ||
          (current.status === "closed" && command.status === "investigating" && command.actor.role === "operator") ||
          (["pending_assignment", "assigned"] as const).includes(current.status as "pending_assignment" | "assigned") && command.status === "preparing" && command.actor.role === "operator" ||
          (!["closed", "cancelled"].includes(current.status) && command.status === "cancelled" && command.actor.role === "operator");
        if (!allowed) throw new CaseRuleError("La transición solicitada no está permitida para este rol.");
        const at = now().toISOString();
        const updated: OperationalCase = {
          ...current,
          status: command.status,
          lastUpdatedAt: at,
          history: [...current.history, {
            id: randomUUID(), type: "status_changed", at, actor: command.actor,
            description: `Estado operativo cambiado a ${command.status}.`, reason: command.reason
          }]
        };
        return keep(updated);
      }
      if (command.type === "resolve") {
        if (current.status !== "investigating") throw new CaseRuleError("El expediente debe estar en investigación para resolverlo.");
        if (command.actor.role !== "specialist" || current.assignee?.name !== command.actor.name) {
          throw new CaseRuleError("Solo el especialista asignado puede resolver el expediente.");
        }
        const at = now().toISOString();
        const resolution = {
          checklist: command.checklist,
          investigationSummary: command.investigationSummary,
          resolution: command.resolution,
          customerResponse: command.customerResponse,
          evidence: command.evidence
        };
        const updated: OperationalCase = {
          ...current,
          status: "resolved",
          resolution,
          resolvedAt: at,
          lastUpdatedAt: at,
          history: [...current.history, {
            id: randomUUID(), type: "resolved", at, actor: command.actor,
            description: "Investigación completada y resolución confirmada por el especialista."
          }]
        };
        return keep(updated);
      }
      if (command.type === "communicate") {
        if (command.actor.role !== "operator") throw new CaseRuleError("Solo el operador puede registrar la entrega al cliente.");
        if (current.status !== "resolved") throw new CaseRuleError("El expediente debe estar resuelto antes de comunicar el resultado.");
        const at = now().toISOString();
        const communication = { id: randomUUID(), at, channel: command.channel, message: command.message, delivered: true as const };
        const updated: OperationalCase = {
          ...current,
          status: "closed",
          closedAt: at,
          lastUpdatedAt: at,
          communications: [...(current.communications ?? []), communication],
          history: [...current.history, {
            id: randomUUID(), type: "communication_delivered", at, actor: command.actor,
            description: `Entrega simulada registrada por ${command.channel}; expediente cerrado.`
          }]
        };
        return keep(updated);
      }
      if (command.type === "archive") {
        if (command.actor.role !== "operator") throw new CaseRuleError("Solo el operador puede archivar un expediente.");
        const at = now().toISOString();
        const updated: OperationalCase = {
          ...current,
          archived: true,
          lastUpdatedAt: at,
          history: [...current.history, {
            id: randomUUID(), type: "archived", at, actor: command.actor,
            description: "Expediente retirado de la bandeja activa.", reason: command.reason
          }]
        };
        return keep(updated);
      }
      if (command.type === "add_note") {
        const at = now().toISOString();
        return keep({ ...current, lastUpdatedAt: at, history: [...current.history, {
          id: randomUUID(), type: "note_added", at, actor: command.actor,
          description: command.text
        }] });
      }
      if (command.type === "update_customer") {
        if (command.actor.role !== "operator") throw new CaseRuleError("Solo el operador puede corregir la referencia del cliente.");
        if (current.confirmedAt && !command.reason) throw new CaseRuleError("Indica el motivo de la corrección posterior a la confirmación.");
        const at = now().toISOString();
        return keep({ ...current, customer: command.customer, lastUpdatedAt: at, history: [...current.history, {
          id: randomUUID(), type: "customer_updated", at, actor: command.actor,
          description: "Referencia sintética del cliente actualizada.", reason: command.reason
        }] });
      }
      return current;
    },
    async track(lookup) {
      const found = [...cases.values()].find((item) => item.trackingNumber === lookup.trackingNumber);
      const digits = found?.customer.nationalId.replace(/\D/g, "") ?? "";
      if (!found || !digits.endsWith(lookup.nationalIdLast4)) return undefined;
      const labels: Record<OperationalCase["status"], CustomerTrackingView["status"]> = {
        received: "Recibido", preparing: "En evaluación", pending_assignment: "En evaluación",
        assigned: "En atención", investigating: "En atención", waiting_customer: "Esperando información",
        resolved: "Resuelto", closed: "Cerrado", cancelled: "Cerrado"
      };
      return {
        trackingNumber: found.trackingNumber,
        status: labels[found.status],
        category: found.preparedClaim?.category ?? "Pendiente de clasificación",
        receivedAt: found.receivedAt,
        lastUpdatedAt: found.lastUpdatedAt,
        responsibleArea: found.responsibleArea ?? found.preparedClaim?.responsibleArea,
        requiredInformation: found.preparedClaim?.missingInformation ?? [],
        customerResponse: found.resolution?.customerResponse
      };
    },
    async resetDemo(values) {
      cases.clear();
      for (const value of values) cases.set(value.id, value);
      sequence = Math.max(0, ...values.map((item) => Number(item.trackingNumber.slice(-6)) || 0));
      options.onReset?.(values);
      return this.list();
    },
    async close() {}
  };
}

export function createSqliteCaseStore(path: string): CaseStore {
  const database = new DatabaseSync(path);
  database.exec(`CREATE TABLE IF NOT EXISTS operational_cases (
    id TEXT PRIMARY KEY,
    tracking_number TEXT NOT NULL UNIQUE,
    received_at TEXT NOT NULL,
    payload TEXT NOT NULL
  )`);
  const load = () => (database.prepare("SELECT payload FROM operational_cases ORDER BY received_at DESC").all() as Array<{ payload: string }>)
    .map((row) => JSON.parse(row.payload) as OperationalCase);
  const save = (value: OperationalCase) => database.prepare(`
    INSERT INTO operational_cases (id, tracking_number, received_at, payload) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET tracking_number=excluded.tracking_number, received_at=excluded.received_at, payload=excluded.payload
  `).run(value.id, value.trackingNumber, value.receivedAt, JSON.stringify(value));
  const memory = createMemoryCaseStore({
    initialCases: load(), onChange: save,
    onReset: (values) => {
      database.exec("DELETE FROM operational_cases");
      for (const value of values) save(value);
    }
  });
  return { ...memory, async close() { database.close(); } };
}
