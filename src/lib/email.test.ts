// Test kontrak modul email: tanpa key harus gagal/skip dengan aman (guard),
// dan sendWelcomeEmail tidak pernah melempar ke pemanggil (alur signup).
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// Mock SDK resend — jangan pernah hit API sungguhan di unit test.
// __sendMock diekspos via static agar bisa diatur per-test.
vi.mock("resend", () => {
  const send = vi.fn();
  class FakeResend {
    static __sendMock = send;
    emails = { send };
    constructor() {
      // key tidak dipakai di mock
    }
  }
  return { Resend: FakeResend };
});

import { Resend } from "resend";
import { _resetEmailClient, sendEmail, sendWelcomeEmail } from "./email";

const sendMock = (Resend as unknown as { __sendMock: Mock }).__sendMock;

beforeEach(() => {
  _resetEmailClient();
  sendMock.mockReset();
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.WAVIO_PUBLIC_BASE_URL;
});

describe("sendEmail", () => {
  it("melempar error saat RESEND_API_KEY belum diset", async () => {
    process.env.RESEND_API_KEY = "";
    await expect(
      sendEmail({ from: "a@b.c", to: "x@y.z", subject: "s", html: "<p>h</p>" }),
    ).rejects.toThrow(/RESEND_API_KEY belum diset/);
  });

  it("mengembalikan id saat SDK sukses", async () => {
    process.env.RESEND_API_KEY = "re_test";
    sendMock.mockResolvedValueOnce({ data: { id: "em_123" }, error: null });
    const { id } = await sendEmail({
      from: "a@b.c",
      to: "x@y.z",
      subject: "s",
      html: "<p>h</p>",
    });
    expect(id).toBe("em_123");
  });

  it("melempar error saat SDK mengembalikan error", async () => {
    process.env.RESEND_API_KEY = "re_test";
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: "invalid api key", name: "invalid_api_key", statusCode: 401 },
    });
    await expect(
      sendEmail({ from: "a@b.c", to: "x@y.z", subject: "s", html: "<p>h</p>" }),
    ).rejects.toThrow(/invalid api key/);
  });
});

describe("sendWelcomeEmail", () => {
  it("skip tanpa error saat RESEND_API_KEY belum diset", async () => {
    process.env.RESEND_API_KEY = "";
    await expect(sendWelcomeEmail({ email: "x@y.z", name: "Test" })).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("mengirim email dan tidak melempar saat SDK error", async () => {
    process.env.RESEND_API_KEY = "re_test";
    sendMock.mockRejectedValueOnce(new Error("network down"));
    await expect(sendWelcomeEmail({ email: "x@y.z", name: "Test" })).resolves.toBeUndefined();
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("menggunakan sender default wavio dan meng-escape nama", async () => {
    process.env.RESEND_API_KEY = "re_test";
    sendMock.mockResolvedValueOnce({ data: { id: "em_1" }, error: null });
    await sendWelcomeEmail({ email: "x@y.z", name: "<Budi> & Co" });
    const arg = sendMock.mock.calls[0][0] as {
      from: string;
      to: string;
      subject: string;
      html: string;
    };
    expect(arg.to).toBe("x@y.z");
    expect(arg.subject).toContain("Wavio");
    expect(arg.from).toContain("wavio.satupintudigital.co.id");
    expect(arg.html).toContain("&lt;Budi&gt;");
    expect(arg.html).not.toContain("<Budi>");
  });
});
