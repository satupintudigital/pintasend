import { describe, it, expect, vi } from "vitest";
import { postJson, jsonFetch, getJson } from "./http";

// Helper fetch terpusat — kontrak Wajib: body selalu JSON.stringify + header
// Content-Type: application/json. Regresi bug: route register pernah mengirim
// token Turnstile sbg raw string ke receiver yang parsing JSON (selalu gagal).
describe("postJson", () => {
  function captureFetch() {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    });
    return { fetchImpl, calls };
  }

  it("method POST + body selalu JSON.stringify + Content-Type application/json", async () => {
    const { fetchImpl, calls } = captureFetch();
    await postJson("https://x.test/endpoint", { token: "tok-123", n: 1 }, {}, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBe(JSON.stringify({ token: "tok-123", n: 1 }));
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("body bertipe primitif juga di-JSON.stringify (bukan dikirim mentah)", async () => {
    const { fetchImpl, calls } = captureFetch();
    // Caller tidak boleh mengirim string telanjang — kalau terpaksa string,
    // helper tetap membungkusnya jadi JSON literal, bukan raw body.
    await postJson("https://x.test/endpoint", "tok-123", {}, fetchImpl);
    expect(calls[0].init?.body).toBe(JSON.stringify("tok-123"));
  });

  it("header custom digabung (tidak menimpa Content-Type)", async () => {
    const { fetchImpl, calls } = captureFetch();
    await postJson(
      "https://x.test/endpoint",
      { a: 1 },
      {
        headers: {
          "X-API-Key": "k1",
          "Content-Type": "application/x-www-form-urlencoded", // sengaja salah — harus ditimpa
        },
      },
      fetchImpl,
    );
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("x-api-key")).toBe("k1");
    expect(headers.get("content-type")).toBe("application/json"); // dipaksa benar
  });

  it("meneruskan init lain (signal, method override ditolak bila explicit)", async () => {
    const { fetchImpl, calls } = captureFetch();
    const controller = new AbortController();
    await postJson("https://x.test/endpoint", { a: 1 }, { signal: controller.signal }, fetchImpl);
    expect(calls[0].init?.signal).toBe(controller.signal);
  });

  it("mengembalikan Response dari fetchImpl", async () => {
    const { fetchImpl } = captureFetch();
    const res = await postJson("https://x.test/endpoint", { a: 1 }, {}, fetchImpl);
    expect(res.status).toBe(200);
  });
});

describe("jsonFetch", () => {
  function captureFetch() {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    });
    return { fetchImpl, calls };
  }

  it.each(["PUT", "PATCH"] as const)("method %s + body JSON + Content-Type dipaksa", async (method) => {
    const { fetchImpl, calls } = captureFetch();
    await jsonFetch(method, "https://x.test/r", { a: 1 }, {}, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(calls[0].init?.method).toBe(method);
    expect(calls[0].init?.body).toBe(JSON.stringify({ a: 1 }));
    expect(new Headers(calls[0].init?.headers).get("content-type")).toBe("application/json");
  });

  it("postJson adalah jsonFetch(POST) — kontrak identik", async () => {
    const { fetchImpl, calls } = captureFetch();
    await postJson("https://x.test/r", { a: 1 }, {}, fetchImpl);
    await jsonFetch("POST", "https://x.test/r", { a: 1 }, {}, fetchImpl);

    expect(calls[0].init?.method).toBe("POST");
    expect(calls[1].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBe(calls[1].init?.body);
  });
});

describe("getJson", () => {
  function captureFetch() {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    });
    return { fetchImpl, calls };
  }

  it("query object diserialisasi ke URL + method GET", async () => {
    const { fetchImpl, calls } = captureFetch();
    await getJson("https://x.test/list", { query: { limit: 20, offset: 0 } }, fetchImpl);

    expect(calls[0].url).toBe("https://x.test/list?limit=20&offset=0");
    expect(calls[0].init?.method).toBe("GET");
    expect(calls[0].init?.body).toBeUndefined();
  });

  it("null/undefined di-skip; boolean/number di-stringify", async () => {
    const { fetchImpl, calls } = captureFetch();
    await getJson(
      "https://x.test/list",
      { query: { a: undefined, b: null, flag: true, n: 7, s: "teks spasi" } },
      fetchImpl,
    );

    // URLSearchParams meng-encode spasi sebagai + dan tak memuat a/b sama sekali.
    expect(calls[0].url).toBe("https://x.test/list?flag=true&n=7&s=teks+spasi");
  });

  it("nilai array diulang per elemen", async () => {
    const { fetchImpl, calls } = captureFetch();
    await getJson("https://x.test/list", { query: { id: ["a", "b"] } }, fetchImpl);
    expect(calls[0].url).toBe("https://x.test/list?id=a&id=b");
  });

  it("tanpa query URL tidak berubah", async () => {
    const { fetchImpl, calls } = captureFetch();
    await getJson("https://x.test/path", {}, fetchImpl);
    expect(calls[0].url).toBe("https://x.test/path");
  });

  it("URL yg sudah punya query digabung dengan & (bukan ? ganda)", async () => {
    const { fetchImpl, calls } = captureFetch();
    await getJson("https://x.test/path?fixed=1", { query: { page: 2 } }, fetchImpl);
    expect(calls[0].url).toBe("https://x.test/path?fixed=1&page=2");
  });

  it("meneruskan header & signal", async () => {
    const { fetchImpl, calls } = captureFetch();
    const controller = new AbortController();
    await getJson(
      "https://x.test/me",
      { headers: { "X-API-Key": "k1" }, signal: controller.signal },
      fetchImpl,
    );
    expect(new Headers(calls[0].init?.headers).get("x-api-key")).toBe("k1");
    expect(calls[0].init?.signal).toBe(controller.signal);
  });
});
