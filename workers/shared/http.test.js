// Unit test utk workers/shared/http.js — kontrak helper JSON bersama worker.
// Sibling dari src/lib/http.test.ts: body selalu JSON.stringify (bukan raw
// string), Content-Type application/json dipaksa, query diserialisasi terpusat.
import { describe, it, expect, vi } from "vitest";
import { postJson, jsonFetch, getJson } from "./http.js";

function captureFetch() {
  const calls = [];
  const fetchImpl = vi.fn(async (url, init) => {
    calls.push({ url, init });
    return new Response("{}", { status: 200 });
  });
  return { fetchImpl, calls };
}

describe("postJson / jsonFetch (workers/shared/http.js)", () => {
  it.each(["POST", "PUT", "PATCH"])("jsonFetch %s — body JSON + Content-Type dipaksa", async (method) => {
    const { fetchImpl, calls } = captureFetch();
    await jsonFetch(method, "https://x.test/r", { a: 1 }, {}, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(calls[0].init.method).toBe(method);
    expect(calls[0].init.body).toBe(JSON.stringify({ a: 1 }));
    expect(new Headers(calls[0].init.headers).get("content-type")).toBe("application/json");
  });

  it("postJson = method POST", async () => {
    const { fetchImpl, calls } = captureFetch();
    await postJson("https://x.test/r", { token: "t1" }, {}, fetchImpl);
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe(JSON.stringify({ token: "t1" }));
  });

  it("body primitif string dibungkus JSON literal (bukan raw body)", async () => {
    const { fetchImpl, calls } = captureFetch();
    await postJson("https://x.test/r", "tok-123", {}, fetchImpl);
    expect(calls[0].init.body).toBe(JSON.stringify("tok-123"));
  });

  it("header custom digabung; Content-Type custom TIDAK bisa menimpa", async () => {
    const { fetchImpl, calls } = captureFetch();
    await postJson(
      "https://x.test/r",
      { a: 1 },
      { headers: { "X-API-Key": "k1", "Content-Type": "text/plain" } },
      fetchImpl,
    );
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("x-api-key")).toBe("k1");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("init lain (signal) diteruskan", async () => {
    const { fetchImpl, calls } = captureFetch();
    const controller = new AbortController();
    await postJson("https://x.test/r", { a: 1 }, { signal: controller.signal }, fetchImpl);
    expect(calls[0].init.signal).toBe(controller.signal);
  });
});

describe("getJson (workers/shared/http.js)", () => {
  it("query object diserialisasi ke URL + method GET tanpa body", async () => {
    const { fetchImpl, calls } = captureFetch();
    await getJson("https://x.test/list", { query: { limit: 20, offset: 0 } }, fetchImpl);

    expect(calls[0].url).toBe("https://x.test/list?limit=20&offset=0");
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.body).toBeUndefined();
  });

  it("null/undefined di-skip; boolean/number di-stringify", async () => {
    const { fetchImpl, calls } = captureFetch();
    await getJson(
      "https://x.test/list",
      { query: { a: undefined, b: null, flag: true, n: 7, s: "teks spasi" } },
      fetchImpl,
    );
    expect(calls[0].url).toBe("https://x.test/list?flag=true&n=7&s=teks+spasi");
  });

  it("nilai array diulang per elemen", async () => {
    const { fetchImpl, calls } = captureFetch();
    await getJson("https://x.test/list", { query: { id: ["a", "b"] } }, fetchImpl);
    expect(calls[0].url).toBe("https://x.test/list?id=a&id=b");
  });

  it("tanpa query URL tidak berubah; URL yg sudah ? digabung dengan &", async () => {
    const { fetchImpl, calls } = captureFetch();
    await getJson("https://x.test/path", {}, fetchImpl);
    expect(calls[0].url).toBe("https://x.test/path");

    await getJson("https://x.test/path?fixed=1", { query: { page: 2 } }, fetchImpl);
    expect(calls[1].url).toBe("https://x.test/path?fixed=1&page=2");
  });

  it("meneruskan header & signal", async () => {
    const { fetchImpl, calls } = captureFetch();
    const controller = new AbortController();
    await getJson(
      "https://x.test/me",
      { headers: { "X-API-Key": "k1" }, signal: controller.signal },
      fetchImpl,
    );
    expect(new Headers(calls[0].init.headers).get("x-api-key")).toBe("k1");
    expect(calls[0].init.signal).toBe(controller.signal);
  });
});
