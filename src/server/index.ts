import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { buildApp } from "./app.js";
import { createClaimPreparer, procedures } from "./claims/index.js";
import { QvacRuntime } from "./qvac/qvac-runtime.js";
import { createSqliteClaimStore } from "./storage/claim-store.js";
import { createSqliteCaseStore } from "./cases/case-store.js";
import { createDemoCases } from "./cases/demo-cases.js";

const dataDirectory = resolve("data");
await mkdir(dataDirectory, { recursive: true });

const runtime = new QvacRuntime(procedures);
const store = createSqliteClaimStore(resolve(dataDirectory, "caseflow.sqlite"));
const caseStore = createSqliteCaseStore(resolve(dataDirectory, "caseflow.sqlite"));
if ((await caseStore.list()).length === 0) await caseStore.resetDemo(createDemoCases(procedures));
const prepareClaim = createClaimPreparer({ inference: runtime, retriever: runtime, procedures });
const app = buildApp({
  prepareClaim,
  store,
  caseStore,
  procedures,
  readiness: async () => runtime.readiness(),
  staticRoot: process.env.NODE_ENV === "production" ? resolve("dist") : undefined
});

app.addHook("onClose", async () => runtime.dispose());
await app.listen({ port: Number(process.env.PORT ?? 8787), host: "127.0.0.1" });
runtime.initialize().catch((error) => app.log.error(error, "No se pudo inicializar QVAC"));

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
