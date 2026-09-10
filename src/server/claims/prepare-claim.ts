import { rm } from "node:fs/promises";
import type {
  ClaimProgress,
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
) => Promise<PreparedClaim>;

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

function canonicalProcedureId(transcript: string, inferredId: string, candidates: readonly Procedure[]) {
  const isAtmCashFailure = /\b(?:cajero|atm)\b/iu.test(transcript)
    && /(?:no\s+(?:entreg(?:ó|o)|dispens(?:ó|o)|recib(?:í|i))\s+efectivo|sin\s+efectivo)/iu.test(transcript);
  if (isAtmCashFailure && candidates.some((procedure) => procedure.id === "ATM-001")) return "ATM-001";
  return inferredId;
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
      const rawAnalysis = await measure("analyzing", () =>
        dependencies.inference.analyze({ transcript: transcript!, candidateProcedures })
      );

      report("validating");
      const analysis = await measure("validating", async () => claimAnalysisSchema.parse(rawAnalysis));
      const selectedProcedure = candidateProcedures.find(
        (procedure) => procedure.id === canonicalProcedureId(transcript!, analysis.procedureId, candidateProcedures)
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
