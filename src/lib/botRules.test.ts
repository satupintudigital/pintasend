import { describe, it, expect, vi, beforeEach } from "vitest";
import { matchBotRule, type BotRule } from "./botRules";

const sampleRules: BotRule[] = [
  {
    id: "r1",
    tenantId: "t1",
    name: "Info",
    keyword: "info",
    matchType: "exact",
    response: "Ini info dari bot.",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "r2",
    tenantId: "t1",
    name: "Halo",
    keyword: "halo",
    matchType: "starts_with",
    response: "Halo juga!",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "r3",
    tenantId: "t1",
    name: "Bantuan",
    keyword: "bantuan",
    matchType: "contains",
    response: "Ada yang bisa dibantu?",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "r4",
    tenantId: "t1",
    name: "Inaktif",
    keyword: "off",
    matchType: "exact",
    response: "Tidak aktif",
    isActive: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe("botRules matcher", () => {
  it("matches exact keyword case-insensitively", () => {
    const match = matchBotRule(sampleRules, "  INFO ");
    expect(match).toBeDefined();
    expect(match?.id).toBe("r1");
  });

  it("matches starts_with keyword", () => {
    const match = matchBotRule(sampleRules, "halo kak");
    expect(match).toBeDefined();
    expect(match?.id).toBe("r2");
  });

  it("matches contains keyword", () => {
    const match = matchBotRule(sampleRules, "tolong bantuan ya");
    expect(match).toBeDefined();
    expect(match?.id).toBe("r3");
  });

  it("ignores inactive rules", () => {
    const match = matchBotRule(sampleRules, "off");
    expect(match).toBeNull();
  });

  it("returns null on no match", () => {
    const match = matchBotRule(sampleRules, "random message");
    expect(match).toBeNull();
  });
});
