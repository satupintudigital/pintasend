import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  executeGetProfile,
  executePatchProfile,
  executeGetProfilePicture,
  executeSetProfilePicture,
  executeDeleteProfilePicture,
} from "./profile";
import { queryD1One } from "./d1";
import { openwa, OpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";

vi.mock("./d1", () => ({ queryD1One: vi.fn() }));
vi.mock("./openwa", () => {
  class MockOpenwaError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "OpenwaError";
      this.status = status;
    }
  }
  return {
    openwa: {
      getProfile: vi.fn(),
      patchProfile: vi.fn(),
      getProfilePicture: vi.fn(),
      setProfilePicture: vi.fn(),
      deleteProfilePicture: vi.fn(),
    },
    OpenwaError: MockOpenwaError,
    publicOpenwaError: () => "Gateway WhatsApp sedang bermasalah.",
  };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-prof-1" };
const mockDevice = { id: "dev1", openwaSessionId: "owa-1", status: "ready" };

beforeEach(() => { vi.clearAllMocks(); vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true }); });
afterEach(() => vi.restoreAllMocks());

// ── Get Profile ─────────────────────────────────────────────────────────────

describe("executeGetProfile", () => {
  it("returns profile for ready device", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.getProfile).mockResolvedValue({ name: "PintaSend Bot", about: "Automated", phone: "6281234567890" });

    const r = await executeGetProfile("dev1", ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(openwa.getProfile).toHaveBeenCalledWith("owa-1");
  });

  it("deviceId empty → 400", async () => {
    const r = await executeGetProfile("", ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("device not found → 404", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executeGetProfile("nope", ctx);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("device not ready → 409", async () => {
    vi.mocked(queryD1One).mockResolvedValue({ ...mockDevice, status: "initializing" });
    const r = await executeGetProfile("dev1", ctx);
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it("rate limit → 429", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const r = await executeGetProfile("dev1", ctx);
    expect(r).toMatchObject({ ok: false, status: 429 });
  });

  it("OpenWA error → 502", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.getProfile).mockRejectedValue(new OpenwaError(502, "fail"));
    const r = await executeGetProfile("dev1", ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});

// ── Patch Profile ───────────────────────────────────────────────────────────

describe("executePatchProfile", () => {
  it("updates name", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.patchProfile).mockResolvedValue({ name: "New Name", about: "Same" });

    const r = await executePatchProfile("dev1", { name: "New Name" }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(openwa.patchProfile).toHaveBeenCalledWith("owa-1", { name: "New Name" });
  });

  it("updates about", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.patchProfile).mockResolvedValue({ name: "Same", about: "New about" });

    const r = await executePatchProfile("dev1", { about: "New about" }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
  });

  it("updates both name and about", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.patchProfile).mockResolvedValue({ name: "New", about: "New" });

    const r = await executePatchProfile("dev1", { name: "New", about: "New" }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
  });

  it("no input → 400", async () => {
    const r = await executePatchProfile("dev1", {}, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("deviceId empty → 400", async () => {
    const r = await executePatchProfile("", { name: "Test" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("OpenWA error → 502", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.patchProfile).mockRejectedValue(new OpenwaError(502, "fail"));
    const r = await executePatchProfile("dev1", { name: "Test" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});

// ── Get Profile Picture ─────────────────────────────────────────────────────

describe("executeGetProfilePicture", () => {
  it("returns picture stream", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    const mockStream = new ReadableStream();
    vi.mocked(openwa.getProfilePicture).mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg" }),
      body: mockStream,
    } as Response);

    const r = await executeGetProfilePicture("dev1", ctx);
    expect(r.ok).toBe(true);
    expect(openwa.getProfilePicture).toHaveBeenCalledWith("owa-1");
  });

  it("device not found → 404", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executeGetProfilePicture("nope", ctx);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("OpenWA error → 502", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.getProfilePicture).mockRejectedValue(new OpenwaError(502, "fail"));
    const r = await executeGetProfilePicture("dev1", ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});

// ── Set Profile Picture ─────────────────────────────────────────────────────

describe("executeSetProfilePicture", () => {
  it("sets profile picture", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.setProfilePicture).mockResolvedValue({ success: true });

    const r = await executeSetProfilePicture("dev1", { imageBase64: "base64data", mimetype: "image/jpeg" }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(openwa.setProfilePicture).toHaveBeenCalledWith("owa-1", "base64data", "image/jpeg");
  });

  it("missing imageBase64 → 400", async () => {
    const r = await executeSetProfilePicture("dev1", { imageBase64: "", mimetype: "image/jpeg" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("missing mimetype → 400", async () => {
    const r = await executeSetProfilePicture("dev1", { imageBase64: "data", mimetype: "" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("OpenWA error → 502", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.setProfilePicture).mockRejectedValue(new OpenwaError(502, "fail"));
    const r = await executeSetProfilePicture("dev1", { imageBase64: "data", mimetype: "image/jpeg" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});

// ── Delete Profile Picture ──────────────────────────────────────────────────

describe("executeDeleteProfilePicture", () => {
  it("deletes profile picture", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.deleteProfilePicture).mockResolvedValue({ success: true });

    const r = await executeDeleteProfilePicture("dev1", ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(openwa.deleteProfilePicture).toHaveBeenCalledWith("owa-1");
  });

  it("device not found → 404", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executeDeleteProfilePicture("nope", ctx);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("OpenWA error → 502", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.deleteProfilePicture).mockRejectedValue(new OpenwaError(502, "fail"));
    const r = await executeDeleteProfilePicture("dev1", ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});
