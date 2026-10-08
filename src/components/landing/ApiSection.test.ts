import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const apiSection = readFileSync(new URL("./ApiSection.tsx", import.meta.url), "utf8");
const hero = readFileSync(new URL("./Hero.tsx", import.meta.url), "utf8");
const login = readFileSync(new URL("../../app/login/page.tsx", import.meta.url), "utf8");

describe("public API examples", () => {
  it("use the deployed PintaSend host instead of the stale api.pintasend.id host", () => {
    expect(apiSection).not.toContain("api.pintasend.id");
    expect(hero).not.toContain("api.pintasend.id");
    expect(apiSection).toContain("https://pintasend.satupintudigital.co.id/v1/messages");
    expect(hero).toContain("https://pintasend.satupintudigital.co.id/v1/messages");
    expect(login).not.toContain("api.pintasend.id");
  });

  it("only advertises routes implemented by the public API", () => {
    expect(apiSection).not.toContain('path: "/v1/devices"');
    expect(apiSection).not.toContain('path: "/v1/webhooks"');
    expect(apiSection).toContain('path: "/v1/groups"');
    expect(apiSection).toContain('path: "/v1/campaigns"');
  });
});
