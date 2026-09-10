import { buildApp } from "../src/server/app.js";
import { createClaimPreparer } from "../src/server/claims/prepare-claim.js";
import { procedures } from "../src/server/claims/procedures.js";
import { createMemoryClaimStore } from "../src/server/storage/claim-store.js";
import { DemoInferenceGateway } from "../src/server/testing/demo-inference.js";

const inference = new DemoInferenceGateway(procedures);
const app = buildApp({
  prepareClaim: createClaimPreparer({ inference, retriever: inference, procedures }),
  store: createMemoryClaimStore(),
  procedures,
  readiness: async () => ({ ready: true, models: ["Adapter determinista de pruebas"], device: "Pruebas locales" })
});
await app.listen({ host: "127.0.0.1", port: Number(process.env.PORT ?? 8787) });
