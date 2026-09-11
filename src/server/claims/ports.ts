import { z } from "zod";
import { customerReferenceCandidateSchema, type Product } from "../../shared/contracts.js";
import type { Procedure } from "./procedures.js";

export const claimAnalysisSchema = z.object({
  applicability: z.enum(["applicable", "not_applicable", "needs_clarification"]).default("applicable"),
  applicabilityReason: z.string().max(300).default(""),
  product: z.enum(["tarjeta_debito", "cuenta_ahorro", "transferencia", "banca_digital"]),
  category: z.string().min(1),
  procedureId: z.string().min(1),
  extractedFields: z.record(z.string(), z.string()),
  customerReferenceCandidate: customerReferenceCandidateSchema.default({ fullName: "", nationalId: "", customerNumber: "" }),
  summary: z.string().min(1),
  draftResponse: z.string().min(1),
  confidence: z.number().min(0).max(1)
});

export interface ClaimAnalysis {
  applicability?: "applicable" | "not_applicable" | "needs_clarification";
  applicabilityReason?: string;
  product: Product;
  category: string;
  procedureId: string;
  extractedFields: Record<string, string>;
  customerReferenceCandidate?: {
    fullName: string;
    nationalId: string;
    customerNumber: string;
  };
  summary: string;
  draftResponse: string;
  confidence: number;
}

export interface InferenceGateway {
  readonly models: readonly string[];
  transcribe(filePath: string, mimeType: string): Promise<string>;
  analyze(input: {
    transcript: string;
    candidateProcedures: readonly Procedure[];
  }): Promise<ClaimAnalysis>;
}

export interface ProcedureRetriever {
  retrieve(query: string, limit?: number): Promise<readonly Procedure[]>;
}

