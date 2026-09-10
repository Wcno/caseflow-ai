import { procedures } from "../src/server/claims/procedures.js";
import { QvacRuntime } from "../src/server/qvac/qvac-runtime.js";

const runtime = new QvacRuntime(procedures);
console.log("Preparando modelos QVAC en la caché local…");
try {
  await runtime.initialize();
  console.log(JSON.stringify(runtime.readiness(), null, 2));
} finally {
  await runtime.dispose();
}
