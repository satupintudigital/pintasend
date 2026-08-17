import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getCachedDeviceStatus,
  setCachedDeviceStatus,
  deleteCachedDeviceStatus,
  DEVICE_STATUS_TTL_MS,
} from "./deviceCache";

// Fake KV binding.
const fakeKv = {
  store: new Map<string, string>(),
  get: vi.fn(async (k: string) => fakeKv.store.get(k) ?? null),
  put: vi.fn(async (k: string, v: string, _o?: { expirationTtl?: number }) => {
    fakeKv.store.set(k, v);
  }),
  delete: vi.fn(async (k: string) => {
    fakeKv.store.delete(k);
  }),
};

// Mock cf.getBinding agar deviceCache memakai fakeKv.
vi.mock("@/lib/cf", () => ({
  getBinding: vi.fn(async (name: string) => {
    if (name === "WAVIO_CACHE") return fakeKv;
    throw new Error(`binding ${name} tidak ada`);
  }),
}));

describe("deviceCache", () => {
  beforeEach(() => {
    fakeKv.store.clear();
    vi.clearAllMocks();
  });

  it("set lalu get mengembalikan status yang sama", async () => {
    await setCachedDeviceStatus("dev-1", "qr_ready", null);
    const hit = await getCachedDeviceStatus("dev-1");
    expect(hit).toEqual({ status: "qr_ready", phone: null });
  });

  it("cache expired (TTL lewat) → null", async () => {
    vi.useFakeTimers();
    await setCachedDeviceStatus("dev-1", "ready", "62812");
    vi.advanceTimersByTime(DEVICE_STATUS_TTL_MS + 100);
    const hit = await getCachedDeviceStatus("dev-1");
    expect(hit).toBeNull();
    vi.useRealTimers();
  });

  it("delete menghapus cache", async () => {
    await setCachedDeviceStatus("dev-1", "ready", "62812");
    await deleteCachedDeviceStatus("dev-1");
    expect(await getCachedDeviceStatus("dev-1")).toBeNull();
  });
});
