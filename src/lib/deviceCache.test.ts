import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getCachedDevice,
  setCachedDevice,
  deleteCachedDevice,
  getCachedDeviceList,
  setCachedDeviceList,
  deleteCachedDeviceList,
  DEVICE_STATUS_TTL_MS,
  DEVICE_LIST_TTL_MS,
  type DeviceCacheValue,
} from "./deviceCache";

// Fake KV binding.
const fakeKv = {
  store: new Map<string, string>(),
  get: vi.fn(async (k: string) => fakeKv.store.get(k) ?? null),
  put: vi.fn(async (k: string, v: string) => {
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

const device: DeviceCacheValue = {
  id: "dev-1",
  tenantId: "tenant-1",
  label: "HP Kasir",
  openwaSessionId: "owa-1",
  phone: "62812",
  status: "ready",
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
};

describe("deviceCache", () => {
  beforeEach(() => {
    fakeKv.store.clear();
    vi.clearAllMocks();
  });

  it("set lalu get mengembalikan device yang sama", async () => {
    await setCachedDevice(device);
    const hit = await getCachedDevice("dev-1");
    expect(hit).toEqual(device);
  });

  it("cache expired (TTL lewat) → null", async () => {
    vi.useFakeTimers();
    await setCachedDevice(device);
    vi.advanceTimersByTime(DEVICE_STATUS_TTL_MS + 100);
    const hit = await getCachedDevice("dev-1");
    expect(hit).toBeNull();
    vi.useRealTimers();
  });

  it("delete menghapus cache", async () => {
    await setCachedDevice(device);
    await deleteCachedDevice("dev-1");
    expect(await getCachedDevice("dev-1")).toBeNull();
  });

  it("list: set lalu get mengembalikan daftar device yang sama", async () => {
    const devices: DeviceCacheValue[] = [device, { ...device, id: "dev-2", label: "HP CS" }];
    await setCachedDeviceList("tenant-1", devices);
    const hit = await getCachedDeviceList("tenant-1");
    expect(hit).toEqual(devices);
  });

  it("list: cache expired (TTL lewat) → null", async () => {
    vi.useFakeTimers();
    await setCachedDeviceList("tenant-1", [device]);
    vi.advanceTimersByTime(DEVICE_LIST_TTL_MS + 100);
    expect(await getCachedDeviceList("tenant-1")).toBeNull();
    vi.useRealTimers();
  });

  it("list: delete menghapus cache", async () => {
    await setCachedDeviceList("tenant-1", [device]);
    await deleteCachedDeviceList("tenant-1");
    expect(await getCachedDeviceList("tenant-1")).toBeNull();
  });

  it("list: terisolasi per tenant (dev-1 di tenant-2 tidak ketemu)", async () => {
    await setCachedDevice(device);
    expect(await getCachedDeviceList("tenant-2")).toBeNull();
  });
});
