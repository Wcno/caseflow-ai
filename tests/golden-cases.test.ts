import { describe, expect, it } from "vitest";
import { procedures } from "../src/server/claims/procedures.js";
import { DemoInferenceGateway } from "../src/server/testing/demo-inference.js";
import { goldenCases } from "./golden-cases.js";

describe("conjunto dorado sintético", () => {
  it("alcanza 90% y nunca devuelve identificadores fuera del catálogo", async () => {
    const gateway = new DemoInferenceGateway(procedures);
    const expectedIds = new Set(procedures.map((procedure) => procedure.id));
    let hits = 0;
    for (const [text, expected] of goldenCases) {
      const candidates = await gateway.retrieve(text, 3);
      const analysis = await gateway.analyze({ transcript: text, candidateProcedures: candidates });
      expect(expectedIds.has(analysis.procedureId)).toBe(true);
      expect(procedures.find((procedure) => procedure.id === analysis.procedureId)?.responsibleArea).toBeTruthy();
      if (analysis.procedureId === expected) hits += 1;
    }
    expect(hits / goldenCases.length).toBeGreaterThanOrEqual(0.9);
  });
});
