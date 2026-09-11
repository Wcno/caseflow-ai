import { z } from "zod";

export const productSchema = z.enum([
  "tarjeta_debito",
  "cuenta_ahorro",
  "transferencia",
  "banca_digital"
]);

export const claimStageSchema = z.enum([
  "queued",
  "transcribing",
  "retrieving",
  "analyzing",
  "validating",
  "ready",
  "not_applicable",
  "needs_clarification",
  "failed"
]);

export const caseStatusSchema = z.enum([
  "received",
  "preparing",
  "pending_assignment",
  "assigned",
  "investigating",
  "waiting_customer",
  "resolved",
  "closed",
  "cancelled"
]);

export const customerReferenceSchema = z.object({
  fullName: z.string().trim().min(1).max(120).default("Cliente por confirmar"),
  nationalId: z.string().trim().max(40).default(""),
  customerNumber: z.string().trim().max(40).default(""),
  intakeChannel: z.enum(["phone", "whatsapp", "branch", "web"]),
  preferredContact: z.enum(["phone", "whatsapp", "none"])
});

export const customerReferenceCandidateSchema = z.object({
  fullName: z.string().trim().max(120).default(""),
  nationalId: z.string().trim().max(40).default(""),
  customerNumber: z.string().trim().max(40).default("")
});

export const createCaseInputSchema = z.object({
  customer: customerReferenceSchema,
  narrative: z.string().trim().min(8).max(8_000)
});

export const caseActorSchema = z.object({
  role: z.enum(["operator", "specialist"]),
  name: z.string().trim().min(1).max(120)
});

export const caseResolutionSchema = z.object({
  checklist: z.array(z.object({
    step: z.string().trim().min(1),
    completed: z.literal(true),
    result: z.string().trim().min(3)
  })).min(1),
  investigationSummary: z.string().trim().min(8),
  resolution: z.string().trim().min(8),
  customerResponse: z.string().trim().min(8),
  evidence: z.array(z.string().trim().min(3)).min(1)
});

export const caseCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("assign"),
    area: z.string().trim().min(1),
    assigneeId: z.string().trim().min(1),
    actor: caseActorSchema,
    reason: z.string().trim().min(3).max(500).optional()
  }),
  z.object({
    type: z.literal("transition"),
    status: caseStatusSchema,
    actor: caseActorSchema,
    reason: z.string().trim().min(3).max(500).optional()
  }),
  z.object({
    type: z.literal("resolve"),
    actor: caseActorSchema,
    ...caseResolutionSchema.shape
  }),
  z.object({
    type: z.literal("communicate"),
    actor: caseActorSchema,
    channel: z.enum(["phone", "whatsapp"]),
    message: z.string().trim().min(8).max(2_000),
    delivered: z.literal(true)
  }),
  z.object({
    type: z.literal("archive"),
    actor: caseActorSchema,
    reason: z.string().trim().min(3).max(500)
  }),
  z.object({
    type: z.literal("add_note"),
    actor: caseActorSchema,
    text: z.string().trim().min(3).max(2_000)
  }),
  z.object({
    type: z.literal("update_customer"),
    actor: caseActorSchema,
    customer: customerReferenceSchema,
    reason: z.string().trim().min(3).max(500).optional()
  })
]);

export const trackingLookupSchema = z.object({
  trackingNumber: z.string().trim().regex(/^CF-\d{4}-\d{6}$/),
  nationalIdLast4: z.string().trim().regex(/^\d{4}$/)
});

export const intakeInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().trim().min(8).max(8_000) }),
  z.object({
    kind: z.literal("audio"),
    filePath: z.string().min(1),
    mimeType: z.string().min(1)
  })
]);

export const intakeDispositionSchema = z.object({
  kind: z.enum(["not_applicable", "needs_clarification"]),
  guidance: z.string().min(1).max(300),
  transcript: z.string().min(1)
});

export const procedureCitationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  source: z.string().min(1),
  excerpt: z.string().min(1)
});

export const preparedClaimSchema = z.object({
  transcript: z.string().min(1),
  product: productSchema,
  category: z.string().min(1),
  extractedFields: z.record(z.string(), z.string()),
  customerReferenceCandidate: customerReferenceCandidateSchema.optional(),
  summary: z.string().min(1),
  procedure: procedureCitationSchema,
  responsibleArea: z.string().min(1),
  missingInformation: z.array(z.string()),
  draftResponse: z.string().min(1),
  confidence: z.number().min(0).max(1),
  timingsMs: z.record(z.string(), z.number().nonnegative()),
  inference: z.object({
    provider: z.literal("QVAC"),
    location: z.literal("local"),
    models: z.array(z.string())
  })
});

export type Product = z.infer<typeof productSchema>;
export type ClaimStage = z.infer<typeof claimStageSchema>;
export type CaseStatus = z.infer<typeof caseStatusSchema>;
export type CustomerReference = z.infer<typeof customerReferenceSchema>;
export type CustomerReferenceCandidate = z.infer<typeof customerReferenceCandidateSchema>;
export type CreateCaseInput = z.infer<typeof createCaseInputSchema>;
export type CaseCommand = z.infer<typeof caseCommandSchema>;
export type CaseResolution = z.infer<typeof caseResolutionSchema>;
export type TrackingLookup = z.infer<typeof trackingLookupSchema>;
export type IntakeInput = z.infer<typeof intakeInputSchema>;
export type IntakeDisposition = z.infer<typeof intakeDispositionSchema>;
export type PreparedClaim = z.infer<typeof preparedClaimSchema>;

export interface ClaimProgress {
  stage: ClaimStage;
  elapsedMs: number;
}

export interface ConfirmedClaim extends PreparedClaim {
  id: string;
  confirmedAt: string;
}

export interface ClaimRunSnapshot {
  id: string;
  caseId?: string;
  trackingNumber?: string;
  status: ClaimStage;
  elapsedMs: number;
  transcript?: string;
  result?: PreparedClaim;
  disposition?: IntakeDisposition;
  error?: { code: string; message: string };
}

export interface CaseEvent {
  id: string;
  type: string;
  at: string;
  actor: { role: "operator" | "specialist"; name: string };
  description: string;
  reason?: string;
}

export interface OperationalCase {
  id: string;
  trackingNumber: string;
  customer: CustomerReference;
  narrative: string;
  receivedAt: string;
  status: CaseStatus;
  lastUpdatedAt: string;
  archived: boolean;
  confirmedAt?: string;
  assignedAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  incidentAt?: string;
  targetAt?: string;
  responsibleArea?: string;
  assignee?: Specialist;
  resolution?: CaseResolution;
  communications?: readonly SimulatedCommunication[];
  history: readonly CaseEvent[];
  preparedClaim?: PreparedClaim;
}

export interface SimulatedCommunication {
  id: string;
  at: string;
  channel: "phone" | "whatsapp";
  message: string;
  delivered: true;
}

export interface CustomerTrackingView {
  trackingNumber: string;
  status: "Recibido" | "En evaluación" | "En atención" | "Esperando información" | "Resuelto" | "Cerrado";
  category: string;
  receivedAt: string;
  lastUpdatedAt: string;
  responsibleArea?: string;
  requiredInformation: readonly string[];
  customerResponse?: string;
}

export interface Specialist {
  id: string;
  name: string;
  area: string;
}

