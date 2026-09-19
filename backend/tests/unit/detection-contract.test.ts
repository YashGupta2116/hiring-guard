import { describe, expect, it } from "vitest";
import contract from "../../../contracts/detector-registry.json" with { type: "json" };
import { getLlr, getUnknownDetectorTypeCounts, LLR_TABLE } from "../../src/config/detection.js";
import { MonitoringChannel } from "../../src/generated/prisma/enums.js";

/**
 * Guards `contracts/detector-registry.json` against silent drift from the two real sources it
 * documents. This is NOT a test of scoring behaviour -- it never touches LLR values, channel
 * weights or thresholds. It only asserts that the *vocabulary* the contract records still matches
 * `MonitoringChannel` (prisma/schema.prisma) and `LLR_TABLE` (config/detection.ts).
 *
 * If this fails, the contract file is stale -- update contracts/detector-registry.json in the same
 * change as whatever edited the enum or the table. See that file's `_readme` for the sync rule, and
 * docs/cross-component-architecture.md for why the contract exists.
 */
describe("detector-registry.json contract", () => {
  it("monitoringChannels.values matches the live MonitoringChannel enum, in the same order", () => {
    expect(contract.monitoringChannels.values).toEqual(Object.values(MonitoringChannel));
  });

  it("every backendDetectorTypes entry (emitted + reserved) has an LLR_TABLE row", () => {
    const documented = [
      ...Object.keys(contract.backendDetectorTypes.emittedByClientDetector),
      ...Object.keys(contract.backendDetectorTypes.reservedForExternalProducer),
    ];
    for (const type of documented) {
      expect(LLR_TABLE, `contract documents "${type}" but LLR_TABLE has no entry for it`).toHaveProperty(type);
    }
  });

  it("every LLR_TABLE key (excluding clean-behaviour negatives) is documented in the contract", () => {
    const documented = new Set([
      ...Object.keys(contract.backendDetectorTypes.emittedByClientDetector),
      ...Object.keys(contract.backendDetectorTypes.reservedForExternalProducer),
    ]);
    // Clean-behaviour types (always-negative LLR) are a separate concept the contract doesn't
    // track yet -- excluded rather than silently required, since adding one shouldn't fail this test.
    const cleanBehaviourTypes = new Set(["focus_resume", "pointer_return", "rhythm_normal"]);
    for (const type of Object.keys(LLR_TABLE)) {
      if (cleanBehaviourTypes.has(type)) continue;
      expect(documented.has(type), `LLR_TABLE has "${type}" but the contract does not document it`).toBe(true);
    }
  });

  it("typeMapping only points at real backendDetectorTypes or null", () => {
    const known = new Set(Object.keys(LLR_TABLE));
    for (const [mlType, backendType] of Object.entries(contract.typeMapping)) {
      if (backendType === null) continue;
      expect(known.has(backendType as string), `typeMapping["${mlType}"] = "${backendType}" is not an LLR_TABLE key`).toBe(true);
    }
  });
});

describe("getLlr on an unrecognised type", () => {
  it("returns null (unscored), not 0 and not a throw, and counts the miss", () => {
    const type = `__test_unknown_type_${Date.now()}`;
    expect(getUnknownDetectorTypeCounts().get(type)).toBeUndefined();
    expect(getLlr(type, "STANDARD")).toBeNull();
    expect(getUnknownDetectorTypeCounts().get(type)).toBe(1);
    getLlr(type, "STANDARD");
    expect(getUnknownDetectorTypeCounts().get(type)).toBe(2);
  });

  it("still returns the real LLR for every documented type (no regression from the new branch)", () => {
    for (const type of Object.keys(LLR_TABLE)) {
      expect(getLlr(type, "STANDARD")).toBe(LLR_TABLE[type]!.STANDARD);
    }
  });
});
