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
        (procedure) => procedure.id === analysis.procedureId
      );
      const catalogProcedure = dependencies.procedures.find(
        (procedure) => procedure.id === analysis.procedureId
      );
      if (
        !selectedProcedure ||
        !catalogProcedure ||
        selectedProcedure.product !== analysis.product ||
        selectedProcedure.category !== analysis.category
      ) {
        throw new ClaimPreparationError(
          "INVALID_INFERENCE_OUTPUT",
          "La inferencia seleccionó un procedimiento fuera del contexto recuperado.",
          transcript
        );
      }

      const missingInformation = selectedProcedure.requiredFields.filter((field) => {
        const value = analysis.extractedFields[field];
        return typeof value !== "string" || value.trim().length === 0;
      });
      timingsMs.total = Math.max(0, now() - startedAt);

      const result: PreparedClaim = {
        transcript,
        product: analysis.product,
        category: analysis.category,
        extractedFields: analysis.extractedFields,
        summary: analysis.summary,
        procedure: {
          id: selectedProcedure.id,
          title: selectedProcedure.title,
          source: `synthetic://procedures/${selectedProcedure.id}`,
          excerpt: `${selectedProcedure.steps.join(" ")} ${selectedProcedure.illustrativeSla}`
        },
        responsibleArea: selectedProcedure.responsibleArea,
        missingInformation,
        draftResponse: analysis.draftResponse,
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

