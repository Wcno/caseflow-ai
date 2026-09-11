import { describe, expect, it } from "vitest";
import { syntheticCases } from "../src/server/claims/synthetic-cases.js";

describe("casos sintéticos de evaluación", () => {
  it("incluye 50 casos distribuidos en los 12 procedimientos", () => {
    expect(syntheticCases).toHaveLength(50);
    expect(new Set(syntheticCases.map((item) => item.procedureId)).size).toBe(12);
    expect(syntheticCases.every((item) => item.narrative.length >= 20)).toBe(true);
  });
});
