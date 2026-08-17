import { describe, expect, it } from "vitest";
import { classifyMedia, MEDIA_KIND_LABEL } from "./mediaInfo";

describe("classifyMedia", () => {
  it("text → bukan media", () => {
    expect(classifyMedia("text")).toEqual({ kind: "other", isMedia: false });
    expect(classifyMedia(null)).toEqual({ kind: "other", isMedia: false });
    expect(classifyMedia(undefined)).toEqual({ kind: "other", isMedia: false });
    expect(classifyMedia("")).toEqual({ kind: "other", isMedia: false });
  });

  it("tipe media dikenal → kind sesuai (case-insensitive)", () => {
    expect(classifyMedia("image")).toEqual({ kind: "image", isMedia: true });
    expect(classifyMedia("Video")).toEqual({ kind: "video", isMedia: true });
    expect(classifyMedia("document")).toEqual({ kind: "document", isMedia: true });
    expect(classifyMedia("sticker")).toEqual({ kind: "sticker", isMedia: true });
    expect(classifyMedia("audio")).toEqual({ kind: "audio", isMedia: true });
  });

  it("voice → audio", () => {
    expect(classifyMedia("voice")).toEqual({ kind: "audio", isMedia: true });
  });

  it("type asing tanpa mimetype → media other", () => {
    expect(classifyMedia("location")).toEqual({ kind: "other", isMedia: true });
  });

  it("type asing dgn mimetype → fallback ke kind dari mimetype", () => {
    expect(classifyMedia("masked", "image/jpeg")).toEqual({ kind: "image", isMedia: true });
    expect(classifyMedia("unknown", "video/mp4")).toEqual({ kind: "video", isMedia: true });
    expect(classifyMedia("unknown", "audio/mpeg")).toEqual({ kind: "audio", isMedia: true });
    expect(classifyMedia("unknown", "application/pdf")).toEqual({ kind: "document", isMedia: true });
    expect(classifyMedia("unknown", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toEqual({
      kind: "document",
      isMedia: true,
    });
    expect(classifyMedia("unknown", "text/plain")).toEqual({ kind: "other", isMedia: true });
  });

  it("label tiap kind tersedia", () => {
    expect(MEDIA_KIND_LABEL.image).toBe("Gambar");
    expect(MEDIA_KIND_LABEL.document).toBe("Dokumen");
    expect(MEDIA_KIND_LABEL.sticker).toBe("Stiker");
  });
});
