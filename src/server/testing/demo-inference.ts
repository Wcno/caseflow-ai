import type { ClaimAnalysis, InferenceGateway, ProcedureRetriever } from "../claims/ports.js";
import type { Procedure } from "../claims/procedures.js";

function score(text: string, procedure: Procedure) {
  const normalized = text.toLowerCase();
  return procedure.searchText.split(" ")
    .filter((term) => term.length >= 3)
    .filter((term) => new RegExp(`\\b${term.toLowerCase()}\\b`, "i").test(normalized)).length;
}

function fieldsFor(text: string, procedure: Procedure): Record<string, string> {
  const amount = /(?:b\/\.|\$)\s?\d+(?:[.,]\d{1,2})?/i.exec(text)?.[0] ?? "";
  const date = /(?:\d{1,2}\s+de\s+\w+|\d{4}-\d{2}-\d{2})/i.exec(text)?.[0] ?? "";
  const location = /(?:en|de)\s+(?:el |la )?(?:cajero )?(?:de )?([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ ]{2,30})/.exec(text)?.[1]?.trim() ?? "";
  const reference = /(?:referencia|ref\.?)[\s:#-]*([A-Z0-9-]{4,})/i.exec(text)?.[1] ?? "";
  const values: Record<string, string> = { amount, date, location, reference };
  return Object.fromEntries(procedure.requiredFields.map((field) => [field, values[field] ?? ""]));
}

export class DemoInferenceGateway implements InferenceGateway, ProcedureRetriever {
  readonly models = ["QVAC demo adapter (solo pruebas)"];
  constructor(private readonly procedures: readonly Procedure[]) {}
  async transcribe(): Promise<string> { return "Retiro debitado sin entrega de efectivo en cajero."; }
  async retrieve(query: string, limit = 3): Promise<readonly Procedure[]> {
    return [...this.procedures].sort((a, b) => score(query, b) - score(query, a)).slice(0, limit);
  }
  async analyze(input: { transcript: string; candidateProcedures: readonly Procedure[] }): Promise<ClaimAnalysis> {
    const selected = input.candidateProcedures[0];
    const extractedFields = fieldsFor(input.transcript, selected);
    const missing = selected.requiredFields.filter((field) => !extractedFields[field]);
    return {
      product: selected.product, category: selected.category, procedureId: selected.id, extractedFields,
      summary: `Reclamo clasificado: ${selected.title.toLowerCase()}.`,
      draftResponse: `Hemos recibido su reclamo. ${missing.length ? `Para continuar, necesitamos: ${missing.join(", ")}.` : "Verificaremos el caso conforme al procedimiento aplicable."}`,
      confidence: 0.92
    };
  }
}
