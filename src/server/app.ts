import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import {
  intakeInputSchema,
  preparedClaimSchema,
  type ClaimRunSnapshot,
  type IntakeInput
} from "../shared/contracts.js";
import type { PrepareClaim } from "./claims/prepare-claim.js";
import type { Procedure } from "./claims/procedures.js";
import type { ClaimStore } from "./storage/claim-store.js";

interface AppDependencies {
  prepareClaim: PrepareClaim;
  store: ClaimStore;
  readiness: () => Promise<{ ready: boolean; models: readonly string[]; error?: string }>;
  procedures?: readonly Procedure[];
  staticRoot?: string;
}

export function buildApp(dependencies: AppDependencies) {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
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

  app.post("/api/runs", async (request, reply) => {
    let input: IntakeInput;
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
    } else {
      input = intakeInputSchema.parse(request.body);
    }

    const runId = randomUUID();
    const startedAt = Date.now();
    runs.set(runId, {
      id: runId,
      status: "queued",
      elapsedMs: 0,
      transcript: input.kind === "text" ? input.text : undefined
    });
    queueMicrotask(async () => {
      try {
        const result = await dependencies.prepareClaim(input, (progress) => {
          const run = runs.get(runId);
          if (run) runs.set(runId, { ...run, status: progress.stage, elapsedMs: progress.elapsedMs });
        });
        runs.set(runId, {
          id: runId,
          status: "ready",
          elapsedMs: Date.now() - startedAt,
          transcript: result.transcript,
          result
        });
      } catch (error) {
        const typed = error as { code?: string; message?: string; transcript?: string };
        runs.set(runId, {
          id: runId,
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

  app.addHook("onClose", async () => dependencies.store.close());
  return app;
}
