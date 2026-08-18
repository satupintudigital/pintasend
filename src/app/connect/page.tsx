"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

type Step = "verify" | "device" | "success" | "error";

function ConnectWizard() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  // Tanpa token → langsung state error (hindari setState sinkron di effect).
  const [step, setStep] = useState<Step>(token ? "verify" : "error");
  const [storeName, setStoreName] = useState("");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(
    token ? "" : "Tautan tidak valid. Mulai ulang dari NalaNiaga.",
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      return fetch(path, {
        ...init,
        headers: {
          "content-type": "application/json",
          "x-connect-token": token,
          ...(init?.headers ?? {}),
        },
      });
    },
    [token],
  );

  useEffect(() => {
    if (!token) return;
    (async () => {
      const res = await call("/api/connect/verify", { method: "POST", body: JSON.stringify({ token }) });
      if (!res.ok) {
        setStep("error");
        setError("Token tidak valid atau kedaluwarsa. Mulai ulang dari NalaNiaga.");
        return;
      }
      const data = await res.json();
      setStoreName(data.storeName);
      if (data.deviceReady) {
        setDeviceId(data.deviceReady.id);
        setStep("success"); // sudah tersambung
      } else {
        setStep("device");
      }
    })();
  }, [token, call]);

  const createDevice = useCallback(async () => {
    const res = await call("/api/connect/device", { method: "POST", body: JSON.stringify({ token }) });
    if (!res.ok) {
      setStep("error");
      setError("Gagal membuat device.");
      return;
    }
    const data = await res.json();
    setDeviceId(data.deviceId);
    setStatus(data.status);
  }, [call, token]);

  useEffect(() => {
    if (step !== "device" || !deviceId) return;
    const loadQr = async () => {
      const res = await call(`/api/connect/device/${deviceId}/qr`);
      if (res.ok) setQr((await res.json()).qrCode);
    };
    loadQr();
    pollRef.current = setInterval(async () => {
      const res = await call(`/api/connect/device/${deviceId}/status`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
        if (data.status === "ready") {
          if (pollRef.current) clearInterval(pollRef.current);
          const done = await call("/api/connect/complete", {
            method: "POST",
            body: JSON.stringify({ token, deviceId }),
          });
          if (done.ok) setStep("success");
          else {
            const d = await done.json().catch(() => ({}));
            setStep("error");
            setError(d.error ?? "Gagal menyelesaikan koneksi. Silakan coba lagi dari NalaNiaga.");
          }
        }
      }
    }, 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [step, deviceId, token, call]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-400">Wavio × NalaNiaga</p>
        <h1 className="mt-3 text-2xl font-bold">Hubungkan WhatsApp</h1>
        {storeName && (
          <p className="mt-1 text-sm text-zinc-400">
            Toko: <b>{storeName}</b>
          </p>
        )}

        {step === "verify" && <p className="mt-6 text-sm text-zinc-400">Memverifikasi…</p>}

        {step === "device" && (
          <div className="mt-6">
            {!qr && !deviceId && (
              <button
                onClick={createDevice}
                className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400"
              >
                Buat Kode QR
              </button>
            )}
            {deviceId && (
              <>
                <p className="mt-4 text-sm text-zinc-400">
                  Buka WhatsApp di ponsel → <b>Perangkat Tertaut</b> → <b>Tautkan Perangkat</b> → scan.
                </p>
                <div className="mt-5 flex aspect-square items-center justify-center rounded-2xl border border-zinc-800 bg-white p-4">
                  {qr ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={qr} alt="QR" className="h-full w-full" />
                  ) : (
                    <span className="text-sm text-zinc-500">Memuat QR…</span>
                  )}
                </div>
                <p className="mt-4 text-sm text-zinc-400">Status: {status || "menunggu"}</p>
              </>
            )}
          </div>
        )}

        {step === "success" && (
          <div className="mt-6">
            <p className="text-sm text-emerald-400">✅ WhatsApp berhasil dihubungkan!</p>
            <p className="mt-2 text-sm text-zinc-400">Notifikasi toko akan aktif otomatis.</p>
          </div>
        )}

        {step === "error" && (
          <div className="mt-6">
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
          </div>
        )}

        {step !== "verify" && (
          <a href="https://nalaniaga.id" className="mt-6 inline-block text-sm text-emerald-400 hover:underline">
            Kembali ke NalaNiaga
          </a>
        )}
      </div>
    </main>
  );
}

export default function ConnectPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100">
          Memuat…
        </main>
      }
    >
      <ConnectWizard />
    </Suspense>
  );
}
