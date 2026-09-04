import { describe, expect, it } from "vitest";
import { createTemplateSyncSignature, verifyTemplateSyncAuth } from "./templateSyncAuth";

describe("template sync internal auth", () => {
  it("membuat dan memverifikasi HMAC dengan timestamp valid", async () => {
    const body = JSON.stringify({ event: "NEW_ORDER", version: 2 });
    const timestamp = String(Date.now());
    const signature = await createTemplateSyncSignature("shared-secret", timestamp, body);

    await expect(verifyTemplateSyncAuth("shared-secret", timestamp, signature, body)).resolves.toBe(true);
  });

  it("menolak signature yang diubah atau timestamp kedaluwarsa", async () => {
    const body = "{}";
    const oldTimestamp = String(Date.now() - 10 * 60 * 1000);
    const signature = await createTemplateSyncSignature("shared-secret", oldTimestamp, body);

    await expect(verifyTemplateSyncAuth("shared-secret", oldTimestamp, signature, body)).resolves.toBe(false);
    await expect(verifyTemplateSyncAuth("shared-secret", String(Date.now()), "sha256:bad", body)).resolves.toBe(false);
  });
});
