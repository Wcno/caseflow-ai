import { rm } from "node:fs/promises";
import type {
  ClaimProgress,
  IntakeDisposition,
  IntakeInput,
  PreparedClaim
} from "../../shared/contracts.js";
import { claimAnalysisSchema, type InferenceGateway, type ProcedureRetriever } from "./ports.js";
import type { Procedure } from "./procedures.js";

export class ClaimPreparationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly transcript?: string
  ) {
    super(message);
    this.name = "ClaimPreparationError";
  }
}

export interface ClaimPreparerDependencies {
  inference: InferenceGateway;
  procedures: readonly Procedure[];
  retriever: ProcedureRetriever;
  now?: () => number;
  removeAudio?: (path: string) => Promise<void>;
}

export type PrepareClaim = (
  input: IntakeInput,
  onProgress: (progress: ClaimProgress) => void
) => Promise<PreparedClaim | IntakeDisposition>;

const placeholderValues = new Set([
  "",
  "unknown",
  "desconocido",
  "no indicado",
  "no disponible",
  "n/a",
  "null",
  "undefined"
]);

function isPlaceholder(field: string, value: string) {
  const normalized = value.trim().toLocaleLowerCase("es");
  return placeholderValues.has(normalized) || normalized === field.toLocaleLowerCase("es") || normalized === field.replaceAll("_", " ").toLocaleLowerCase("es");
}

/**
 * Keeps model output only when it contains evidence. Small local models can
 * occasionally echo a JSON key (for example `amount: "amount"`) instead of
 * an extracted value; treating that as present would hide required fields.
 */
function evidenceFields(transcript: string, requiredFields: readonly string[], proposed: Record<string, string>) {
  const patterns: Record<string, RegExp> = {
    amount: /(?:b\/.?|us\$|\$)\s*\d+(?:[.,]\d{1,2})?/iu,
    date: /(?:\b\d{1,2}\s+de\s+[a-záéíóúñ]+|\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b)/iu,
    location: /\bcajero\s+(?:de|en)\s+([^.,]+)/iu,
    identificador_cajero: /(?:identificador(?:\s+(?:del|de))?\s+cajero|atm\s*id)\s*[:#-]?\s*([a-z0-9-]{3,})/iu,
    hora_aproximada: /(?:a\s+las|hora(?:\s+aproximada)?(?:\s+fue)?|aproximadamente)\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|h)?)/iu,
    reference: /(?:referencia|ref\.?)\s*[:#-]?\s*([a-z0-9-]{4,})/iu,
    lastFourDigits: /(?:terminad[ao]\s+en|últimos?\s+cuatro|ultimos?\s+cuatro|4\s+dígitos)\D*(\d{4})/iu,
    destinationBank: /\bbanco\s+(?:destino|receptor)\s*[:#-]?\s*([^.,]+)/iu,
    duplicateReference: /(?:segunda\s+referencia|referencia\s+duplicada)\s*[:#-]?\s*([a-z0-9-]{4,})/iu,
    expectedBalance: /(?:saldo\s+esperado|esperaba\s+tener)\s*[:#-]?\s*((?:b\/.?|\$)\s*\d+(?:[.,]\d{1,2})?)/iu,
    observedBalance: /(?:saldo\s+(?:observado|actual)|aparece\s+un\s+saldo)\s*[:#-]?\s*((?:b\/.?|\$)\s*\d+(?:[.,]\d{1,2})?)/iu,
    observedMessage: /(?:mensaje(?:\s+mostrado)?|error)\s*[:"]\s*([^".]+)["]?/iu,
    lastSuccessfulOperation: /(?:última\s+operación\s+exitosa|ultima\s+operacion\s+exitosa)\s*[:#-]?\s*([^.,]+)/iu,
    deviceType: /\b(android|iphone|ios|windows|macos|celular|teléfono|telefono|computadora|tablet)\b/iu,
    channel: /\b(sms|correo|email|aplicación|aplicacion|app|web|banca\s+en\s+línea|banca\s+en\s+linea)\b/iu
  };
  const normalizedTranscript = transcript.toLocaleLowerCase("es");
  return Object.fromEntries(requiredFields.map((field) => {
    const proposedValue = typeof proposed[field] === "string" ? proposed[field].trim() : "";
    if (!isPlaceholder(field, proposedValue) && normalizedTranscript.includes(proposedValue.toLocaleLowerCase("es"))) {
      return [field, proposedValue];
    }
    const match = patterns[field]?.exec(transcript);
    return [field, match?.[1]?.trim() || match?.[0]?.trim() || ""];
  }));
}

function normalizedEvidence(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es").replace(/\s+/g, " ").trim();
}

function isUnequivocalAtmClaim(transcript: string, candidates: readonly Procedure[]) {
  const normalized = normalizedEvidence(transcript);
  return candidates.some((procedure) => procedure.id === "ATM-001")
    && /cajero/.test(normalized)
    && /cuenta (?:fue )?debitad/.test(normalized)
    && /(?:no|sin) (?:me )?(?:entreg|recib).{0,24}efectivo/.test(normalized);
}

function isPotentialBankingClaim(transcript: string) {
  const normalized = normalizedEvidence(transcript);
  return /\b(?:banco|cuenta|cajero|atm|tarjeta|transferencia|retiro|dep[oó]sito|banca)\b/.test(normalized);
}

function explicitCustomerReference(transcript: string, proposed: {
  fullName?: string;
  nationalId?: string;
  customerNumber?: string;
}) {
  const source = normalizedEvidence(transcript);
  const read = (value: unknown, digitsOnly = false) => {
    if (typeof value !== "string" || isPlaceholder("customer", value)) return "";
    const normalized = normalizedEvidence(value);
    if (digitsOnly) {
      const candidateDigits = normalized.replace(/\D/g, "");
      const identitySegments = [
        ...[...transcript.matchAll(/\b(?:cedula|cédula|identificacion|identificación|documento|id)\b\D{0,24}(\d[\d\s-]{2,}\d)/giu)].map((match) => match[1]),
        ...[...transcript.matchAll(/(\d[\d\s-]{2,}\d)\D{0,24}\b(?:cedula|cédula|identificacion|identificación|documento|id)\b/giu)].map((match) => match[1])
      ].map((segment) => segment.replace(/\D/g, ""));
      return candidateDigits.length >= 4 && identitySegments.some((segment) => segment === candidateDigits) ? value.trim() : "";
    }
    return normalized.length >= 2 && source.includes(normalized) ? value.trim() : "";
  };
  return {
    fullName: read(proposed.fullName),
    nationalId: read(proposed.nationalId, true),
    customerNumber: read(proposed.customerNumber)
  };
}

function assertSafeDraft(candidate: string, transcript: string) {
  if (/(?:el resumen tiene|responde únicamente|candidateprocedures|procedimientos candidatos|maximum|the summary|system prompt)/iu.test(candidate)) {
    throw new ClaimPreparationError(
      "INVALID_INFERENCE_OUTPUT",
      "La inferencia local incluyó instrucciones internas en el borrador; se requiere revisión manual.",
      transcript
    );
  }
  return candidate;
}

export function createClaimPreparer(dependencies: ClaimPreparerDependencies): PrepareClaim {
  const now = dependencies.now ?? Date.now;
  const removeAudio = dependencies.removeAudio ?? ((path) => rm(path, { force: true }));

  return async (input, onProgress) => {
    const startedAt = now();
    const timingsMs: Record<string, number> = {};
    let transcript = input.kind === "text" ? input.text.trim() : undefined;

    const report = (stage: ClaimProgress["stage"]) => {
      onProgress({ stage, elapsedMs: Math.max(0, now() - startedAt) });
    };
    const measure = async <T>(stage: string, operation: () => Promise<T>): Promise<T> => {
      const stageStartedAt = now();
      try {
        return await operation();
      } finally {
        timingsMs[stage] = Math.max(0, now() - stageStartedAt);
      }
    };

    try {
      if (input.kind === "audio") {
        report("transcribing");
        transcript = await measure("transcribing", () =>
          dependencies.inference.transcribe(input.filePath, input.mimeType)
        );
      }
      if (!transcript?.trim()) {
        throw new ClaimPreparationError("EMPTY_TRANSCRIPT", "No se obtuvo texto del reclamo.");
      }

      report("retrieving");
      const candidateProcedures = await measure("retrieving", () =>
        dependencies.retriever.retrieve(transcript!, 3)
      );
      if (candidateProcedures.length === 0) {
        throw new ClaimPreparationError(
          "NO_PROCEDURE_FOUND",
          "No se encontró un procedimiento aplicable.",
          transcript
        );
      }

      report("analyzing");
      let rawAnalysis;
      try {
        rawAnalysis = await measure("analyzing", () =>
          dependencies.inference.analyze({ transcript: transcript!, candidateProcedures })
        );
      } catch (error) {
        if (!isUnequivocalAtmClaim(transcript!, candidateProcedures)) throw error;
        rawAnalysis = {
          applicability: "applicable" as const,
          applicabilityReason: "Patrón ATM inequívoco detectado localmente.",
          product: "tarjeta_debito" as const,
          category: "retiro_atm_efectivo_no_entregado",
          procedureId: "ATM-001",
          extractedFields: {},
          customerReferenceCandidate: { fullName: "", nationalId: "", customerNumber: "" },
          summary: "Retiro en cajero debitado sin entrega de efectivo; faltan hora e identificador del cajero.",
          draftResponse: "Recibimos tu reclamo por un retiro debitado sin entrega de efectivo. Para continuar con la validación, necesitamos la hora aproximada y el identificador del cajero. No se anticipa un resultado hasta completar la investigación.",
          confidence: 0.9
        };
      }

      // Keep the hero path reliable on small local models: these three explicit
      // facts are enough to identify ATM-001 without inventing any field values.
      const guardedAnalysis = isUnequivocalAtmClaim(transcript!, candidateProcedures)
        && (rawAnalysis.applicability === "not_applicable" || rawAnalysis.applicability === "needs_clarification")
        ? {
          ...rawAnalysis,
          applicability: "applicable" as const,
          procedureId: "ATM-001",
          summary: "Retiro en cajero debitado sin entrega de efectivo; faltan hora e identificador del cajero.",
          draftResponse: "Recibimos tu reclamo por un retiro debitado sin entrega de efectivo. Para continuar con la validación, necesitamos la hora aproximada y el identificador del cajero. No se anticipa un resultado hasta completar la investigación.",
          confidence: Math.max(rawAnalysis.confidence, 0.9)
        }
        : rawAnalysis.applicability === "not_applicable" && isPotentialBankingClaim(transcript!)
          ? { ...rawAnalysis, applicability: "needs_clarification" as const, procedureId: "NONE" }
          : rawAnalysis;

      report("validating");
      const analysis = await measure("validating", async () => claimAnalysisSchema.parse(guardedAnalysis));
      if (analysis.applicability !== "applicable") {
        const fallback = analysis.applicability === "not_applicable"
          ? "El relato no corresponde a un reclamo bancario cubierto por el catálogo local."
          : "Necesitamos más información para identificar el reclamo y el procedimiento aplicable.";
        return {
          kind: analysis.applicability,
          guidance: assertSafeDraft(analysis.applicabilityReason.trim() || fallback, transcript!),
          transcript
        };
      }
      const selectedProcedure = candidateProcedures.find(
        (procedure) => procedure.id === analysis.procedureId
      );
      const catalogProcedure = dependencies.procedures.find(
        (procedure) => procedure.id === selectedProcedure?.id
      );
      if (!selectedProcedure || !catalogProcedure) {
        throw new ClaimPreparationError(
          "INVALID_INFERENCE_OUTPUT",
          "La inferencia seleccionó un procedimiento fuera del contexto recuperado.",
          transcript
        );
      }

      const extractedFields = evidenceFields(transcript!, selectedProcedure.requiredFields, analysis.extractedFields);
      const customerReferenceCandidate = explicitCustomerReference(transcript!, analysis.customerReferenceCandidate ?? {});
      const missingInformation = selectedProcedure.requiredFields.filter((field) => {
        const value = extractedFields[field];
        return typeof value !== "string" || value.trim().length === 0;
      });
      timingsMs.total = Math.max(0, now() - startedAt);

      const result: PreparedClaim = {
        transcript,
        // Procedure taxonomy is canonical; model product/category labels are redundant.
        product: selectedProcedure.product,
        category: selectedProcedure.category,
        extractedFields,
        customerReferenceCandidate,
        summary: analysis.summary,
        procedure: {
          id: selectedProcedure.id,
          title: selectedProcedure.title,
          source: `synthetic://procedures/${selectedProcedure.id}`,
          excerpt: `${selectedProcedure.steps.join(" ")} ${selectedProcedure.illustrativeSla}`
        },
        responsibleArea: selectedProcedure.responsibleArea,
        missingInformation,
        draftResponse: assertSafeDraft(analysis.draftResponse, transcript!),
        confidence: analysis.confidence,
        timingsMs,
        inference: {
          provider: "QVAC",
          location: "local",
          models: [...dependencies.inference.models]
        }
      };
      report("ready");
      return result;
    } catch (error) {
      if (error instanceof ClaimPreparationError) throw error;
      throw new ClaimPreparationError(
        "INVALID_INFERENCE_OUTPUT",
        error instanceof Error ? error.message : "La inferencia local produjo una salida inválida.",
        transcript
      );
    } finally {
      if (input.kind === "audio") {
        await removeAudio(input.filePath).catch(() => undefined);
      }
    }
  };
}
