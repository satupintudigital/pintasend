import { registerTenantOwner, validateRegisterInput, EmailAlreadyTakenError } from "@/lib/register";
import { signIn } from "@/lib/auth";
import { getPublicCatalog } from "@/lib/catalog";

// Turnstile siteverify — bila env belum terisi (dev/sandbox), izinkan.
async function verifyTurnstile(token: unknown): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_TURNSTILE_SITEVERIFY_URL;
  if (!url) return true; // belum dikonfigurasi → izinkan utk dev/sandbox
  if (typeof token !== "string" || !token) return false;
  try {
    const res = await fetch(url, { method: "POST", body: token });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { name?: unknown; email?: unknown; password?: unknown; tenantName?: unknown; turnstileToken?: unknown; plan?: unknown; addon?: unknown }
    | null;
  if (!body) return Response.json({ error: "Body JSON tidak valid" }, { status: 400 });

  const input = {
    name: typeof body.name === "string" ? body.name : "",
    email: typeof body.email === "string" ? body.email : "",
    password: typeof body.password === "string" ? body.password : "",
    tenantName: typeof body.tenantName === "string" ? body.tenantName : "",
  };
  const validationError = validateRegisterInput(input);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });

  const turnstileOk = await verifyTurnstile(body.turnstileToken);
  if (!turnstileOk) {
    return Response.json({ error: "Verifikasi captcha gagal, coba lagi" }, { status: 400 });
  }

  // Redirect target: /checkout dgn query yang dikirim client (whitelist plan/addon valid).
  let redirectTo = "/checkout";
  const catalog = await getPublicCatalog().catch(() => null);
  const planId = typeof body.plan === "string" ? body.plan : "";
  const addon = typeof body.addon === "string" ? body.addon : "";
  const params = new URLSearchParams();
  if (planId && catalog?.plans.some((p) => p.id === planId)) params.set("plan", planId);
  if (addon && catalog?.addons.some((a) => a.key === addon)) params.set("addon", addon);
  const qs = params.toString();
  if (qs) redirectTo += `?${qs}`;

  try {
    const { tenantId } = await registerTenantOwner(input);
    // Auto sign-in → langsung masuk dashboard/checkout (tenant pending tetap
    // boleh login — gate pending hanya utk operasi WhatsApp, bukan login).
    await signIn("credentials", { email: input.email, password: input.password, redirect: false });
    return Response.json({ ok: true, tenantId, redirectTo });
  } catch (e) {
    if (e instanceof EmailAlreadyTakenError) {
      return Response.json({ error: e.message }, { status: 409 });
    }
    console.error("register: gagal:", e);
    return Response.json({ error: "Gagal membuat akun" }, { status: 500 });
  }
}