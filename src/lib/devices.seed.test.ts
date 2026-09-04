import { describe, expect, it, vi, beforeEach } from "vitest";
import { createDeviceAndStart } from "./devices";

const createSessionMock = vi.fn();
const registerWebhookMock = vi.fn();
const deleteSessionMock = vi.fn();
const deleteWebhookMock = vi.fn();
const seedTemplatesMock = vi.fn();
const enqueueCanonicalTemplatesMock = vi.fn();

vi.mock("@/lib/openwa", () => ({
  openwa: {
    createSession: (...args: unknown[]) => createSessionMock(...args),
    registerWebhook: (...args: unknown[]) => registerWebhookMock(...args),
    deleteSession: (...args: unknown[]) => deleteSessionMock(...args),
    deleteWebhook: (...args: unknown[]) => deleteWebhookMock(...args),
  },
  openwaWebhookSecret: () => Promise.resolve("secret"),
  OPENWA_WEBHOOK_EVENTS: ["message.received", "session.status"],
}));

vi.mock("@/lib/templates", () => ({
  seedTemplatesForSession: (...args: unknown[]) => seedTemplatesMock(...args),
}));

vi.mock("@/lib/templateSync", () => ({
  createTemplateSyncDb: () => ({}),
  enqueueActiveTemplateSyncForDevice: (...args: unknown[]) => enqueueCanonicalTemplatesMock(...args),
}));

vi.mock("@/lib/db", () => ({
  query: vi.fn().mockResolvedValue([]),
  queryOne: vi.fn(),
}));
vi.mock("@/lib/d1", () => ({ queryD1: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/uuidv7", () => ({ uuidv7: () => "01900000-0000-7000-8000-000000000001" }));
vi.mock("@/lib/deviceCache", () => ({ deleteCachedDeviceList: vi.fn() }));

beforeEach(() => {
  createSessionMock.mockReset();
  registerWebhookMock.mockReset();
  deleteSessionMock.mockReset();
  deleteWebhookMock.mockReset();
  seedTemplatesMock.mockReset();
  enqueueCanonicalTemplatesMock.mockReset();

  createSessionMock.mockResolvedValue({ id: "sess-abc", name: "wavio-abc", status: "created" });
  registerWebhookMock.mockResolvedValue({ id: "wh-1", url: "http://x", events: [], active: true });
  seedTemplatesMock.mockResolvedValue(undefined);
  enqueueCanonicalTemplatesMock.mockResolvedValue({ templates: 0, jobs: 0 });
});

describe("createDeviceAndStart — seed template otomatis", () => {
  it("memanggil seedTemplatesForSession dengan session id setelah createSession", async () => {
    await createDeviceAndStart("HP Kasir", "tenant-1");
    expect(seedTemplatesMock).toHaveBeenCalledTimes(1);
    expect(seedTemplatesMock).toHaveBeenCalledWith("sess-abc");
  });

  it("mengantrekan catalog canonical untuk device baru setelah device tersimpan", async () => {
    await createDeviceAndStart("HP Kasir", "tenant-1");
    expect(enqueueCanonicalTemplatesMock).toHaveBeenCalledWith(expect.anything(), {
      tenantId: "tenant-1",
      deviceId: "01900000-0000-7000-8000-000000000001",
    });
  });

  it("gagal seed → dicatat, device tetap dibuat (best-effort)", async () => {
    seedTemplatesMock.mockRejectedValue(new Error("gateway down"));
    await expect(createDeviceAndStart("HP Kasir", "tenant-1")).resolves.toMatchObject({
      id: "01900000-0000-7000-8000-000000000001",
      openwaSessionId: "sess-abc",
    });
  });
});
