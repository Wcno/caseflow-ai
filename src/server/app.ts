import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import { ZodError } from "zod";
import {
  intakeInputSchema,
  createCaseInputSchema,
  caseCommandSchema,
  trackingLookupSchema,
  preparedClaimSchema,
  type ClaimRunSnapshot,
  type IntakeInput
} from "../shared/contracts.js";
import type { PrepareClaim } from "./claims/prepare-claim.js";
import type { Procedure } from "./claims/procedures.js";
import type { ClaimStore } from "./storage/claim-store.js";
import { CaseRuleError, createMemoryCaseStore, type CaseStore } from "./cases/case-store.js";
import { specialists } from "./cases/specialists.js";
import { createDemoCases } from "./cases/demo-cases.js";

interface AppDependencies {
  prepareClaim: PrepareClaim;
  store: ClaimStore;
  caseStore?: CaseStore;
  readiness: () => Promise<{ ready: boolean; models: readonly string[]; error?: string }>;
  procedures?: readonly Procedure[];
  staticRoot?: string;
}

export function buildApp(dependencies: AppDependencies) {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  const caseStore = dependencies.caseStore ?? createMemoryCaseStore();
  const runs = new Map<string, ClaimRunSnapshot>();
  app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

  if (dependencies.staticRoot && existsSync(dependencies.staticRoot)) {
    app.register(staticPlugin, { root: resolve(dependencies.staticRoot), wildcard: false });
    app.get("/*", (_request, reply) => reply.sendFile("index.html"));
  }

  app.get("/api/health", async () => ({
    service: "caseflow-ai",
    inference: "local",
    provider: "QVAC",
    ...(await dependencies.readiness())
  }));

  app.post("/api/cases", async (request, reply) => {
    try {
      const input = createCaseInputSchema.parse(request.body);
      return reply.code(201).send(await caseStore.create(input));
    } catch (error) {
      if (error instanceof ZodError) return reply.code(400).send({ error: "Confirma una referencia válida del cliente y un relato de al menos ocho caracteres." });
      throw error;
    }
  });

  app.get("/api/cases", async () => caseStore.list());
  app.get<{ Params: { id: string } }>("/api/cases/:id", async (request, reply) => {
    return await caseStore.get(request.params.id) ?? reply.code(404).send({ error: "Expediente no encontrado." });
  });
  app.get("/api/specialists", async () => specialists);
  app.post("/api/tracking", async (request, reply) => {
    try {
      const lookup = trackingLookupSchema.parse(request.body);
      const view = await caseStore.track(lookup);
      return view ?? reply.code(404).send({ error: "No se encontró un seguimiento con los datos proporcionados." });
    } catch (error) {
      if (error instanceof ZodError) return reply.code(400).send({ error: "Ingresa un número de seguimiento y cuatro dígitos válidos." });
      throw error;
    }
  });
  app.post("/api/demo/reset", async (_request, reply) => {
    return reply.code(200).send(await caseStore.resetDemo(createDemoCases(dependencies.procedures ?? [])));
  });
  app.post<{ Params: { id: string } }>("/api/cases/:id/commands", async (request, reply) => {
    try {
      const command = caseCommandSchema.parse(request.body);
      const updated = await caseStore.applyCommand(request.params.id, command);
      return updated ?? reply.code(404).send({ error: "Expediente no encontrado." });
    } catch (error) {
      if (error instanceof ZodError) return reply.code(400).send({ error: "Los datos del comando están incompletos o no son válidos." });
      if (error instanceof CaseRuleError) return reply.code(409).send({ error: error.message });
      throw error;
    }
  });

  app.post("/api/runs", async (request, reply) => {
    let input: IntakeInput;
    let caseId: string | undefined;
    if (request.isMultipart()) {
      const upload = await request.file();
      if (!upload) return reply.code(400).send({ error: "Se requiere un archivo de audio." });
      const uploadDirectory = join(tmpdir(), "caseflow-ai");
      await mkdir(uploadDirectory, { recursive: true });
      const suffix = extname(upload.filename) || ".audio";
      const filePath = join(uploadDirectory, `${randomUUID()}${suffix}`);
      try {
        await pipeline(upload.file, createWriteStream(filePath));
      } catch (error) {
        await rm(filePath, { force: true }).catch(() => undefined);
        throw error;
      }
      input = intakeInputSchema.parse({
        kind: "audio",
        filePath,
        mimeType: upload.mimetype || "application/octet-stream"
      });
      caseId = (request.query as { caseId?: string }).caseId;
    } else {
      input = intakeInputSchema.parse(request.body);
      const candidate = (request.body as { caseId?: unknown } | undefined)?.caseId;
      caseId = typeof candidate === "string" ? candidate : undefined;
    }

    const linkedCase = caseId ? await caseStore.startPreparation(caseId) : undefined;
    if (caseId && !linkedCase) {
      if (input.kind === "audio") await rm(input.filePath, { force: true }).catch(() => undefined);
      return reply.code(404).send({ error: "Expediente no encontrado." });
    }

    const runId = randomUUID();
    const startedAt = Date.now();
    runs.set(runId, {
      id: runId,
      caseId,
      trackingNumber: linkedCase?.trackingNumber,
      status: "queued",
      elapsedMs: 0,
      transcript: input.kind === "text" ? input.text : undefined
    });
    queueMicrotask(async () => {
      try {
        const outcome = await dependencies.prepareClaim(input, (progress) => {
          const run = runs.get(runId);
          if (run) runs.set(runId, { ...run, status: progress.stage, elapsedMs: progress.elapsedMs });
        });
        if ("kind" in outcome) {
          if (caseId) await caseStore.recordIntakeDisposition(caseId, outcome);
          runs.set(runId, {
            id: runId,
            caseId,
            trackingNumber: linkedCase?.trackingNumber,
            status: outcome.kind,
            elapsedMs: Date.now() - startedAt,
            transcript: outcome.transcript,
            disposition: outcome
          });
          return;
        }
        const result = outcome;
        runs.set(runId, {
          id: runId,
          caseId,
          trackingNumber: linkedCase?.trackingNumber,
          status: "ready",
          elapsedMs: Date.now() - startedAt,
          transcript: result.transcript,
          result
        });
      } catch (error) {
        const typed = error as { code?: string; message?: string; transcript?: string };
        runs.set(runId, {
          id: runId,
          caseId,
          trackingNumber: linkedCase?.trackingNumber,
          status: "failed",
          elapsedMs: Date.now() - startedAt,
          transcript: typed.transcript ?? (input.kind === "text" ? input.text : undefined),
          error: {
            code: typed.code ?? "PREPARATION_FAILED",
            message: typed.message ?? "No se pudo preparar el reclamo."
          }
        });
      }
    });
    return reply.code(202).send({ runId });
  });

  app.get<{ Params: { id: string } }>("/api/runs/:id", async (request, reply) => {
    const run = runs.get(request.params.id);
    return run ?? reply.code(404).send({ error: "Ejecución no encontrada." });
  });

  app.post<{ Params: { id: string } }>("/api/runs/:id/confirm", async (request, reply) => {
    const run = runs.get(request.params.id);
    if (!run || run.status !== "ready") {
      return reply.code(409).send({ error: "El expediente todavía no está listo." });
    }
    const editedClaim = preparedClaimSchema.parse(request.body);
    const catalogProcedure = dependencies.procedures?.find((procedure) => procedure.id === editedClaim.procedure.id);
    if (dependencies.procedures && !catalogProcedure) {
      return reply.code(422).send({ error: "El procedimiento confirmado no existe en el catálogo local." });
    }
    if (catalogProcedure && (
      editedClaim.product !== catalogProcedure.product ||
      editedClaim.category !== catalogProcedure.category ||
      editedClaim.responsibleArea !== catalogProcedure.responsibleArea
    )) {
      return reply.code(422).send({ error: "Producto, categoría y área deben corresponder al procedimiento seleccionado." });
    }
    const normalizedClaim = catalogProcedure ? {
      ...editedClaim,
      procedure: {
        id: catalogProcedure.id,
        title: catalogProcedure.title,
        source: `synthetic://procedures/${catalogProcedure.id}`,
        excerpt: `${catalogProcedure.steps.join(" ")} ${catalogProcedure.illustrativeSla}`
      },
      missingInformation: catalogProcedure.requiredFields.filter((field) => !editedClaim.extractedFields[field]?.trim())
    } : editedClaim;
    if (run.caseId) {
      const operationalCase = await caseStore.confirmPreparation(run.caseId, normalizedClaim);
      return operationalCase
        ? reply.code(201).send(operationalCase)
        : reply.code(404).send({ error: "Expediente no encontrado." });
    }
    return reply.code(201).send(await dependencies.store.save(normalizedClaim));
  });

  app.get("/api/claims", async () => dependencies.store.list());
  app.get("/api/procedures", async () => dependencies.procedures ?? []);
  app.delete<{ Params: { id: string } }>("/api/claims/:id", async (request, reply) => {
    const deleted = await dependencies.store.delete(request.params.id);
    return deleted ? reply.code(204).send() : reply.code(404).send({ error: "Expediente no encontrado." });
  });
  app.delete("/api/claims", async (_request, reply) => {
    await dependencies.store.clear();
    return reply.code(204).send();
  });

  app.addHook("onClose", async () => {
    await dependencies.store.close();
    await caseStore.close();
  });
  return app;
}
