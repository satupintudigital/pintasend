// Managed Turnstile siteverify worker (pola turnstile-spin).
// Browser → worker ini (POST { token }) → https://challenges.cloudflare.com/turnstile/v0/siteverify
// Secret TURNSTILE_SECRET_KEY disimpan di secret worker, tidak pernah ke browser.
const worker = {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
    }
    try {
      const body = await request.json();
      const token = typeof body?.token === "string" ? body.token : "";
      if (!token) {
        return Response.json({ success: false, error: "missing-input-response" }, { status: 400 });
      }

      const form = new FormData();
      form.append("secret", env.TURNSTILE_SECRET_KEY);
      form.append("response", token);
      const ip = request.headers.get("CF-Connecting-IP");
      if (ip) form.append("remoteip", ip);

      const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: form,
      });
      const outcome = await res.json();

      return Response.json(
        { success: Boolean(outcome?.success), "error-codes": outcome?.["error-codes"] ?? [] },
        { status: outcome?.success ? 200 : 400 },
      );
    } catch (e) {
      return Response.json({ success: false, error: String(e && e.message ? e.message : e) }, { status: 500 });
    }
  },
};

export default worker;
