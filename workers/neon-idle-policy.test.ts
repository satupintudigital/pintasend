import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workerDirectories = [
  "template-sync",
  "campaign-dispatch",
  "webhook-delivery",
  "d1-resync",
  "message-retention",
];

function readWorkerFile(directory: string, file: string): string {
  return readFileSync(path.resolve(__dirname, directory, file), "utf8");
}

describe("Neon idle policy", () => {
  it("does not configure periodic triggers for Neon workers", () => {
    for (const directory of workerDirectories) {
      const config = readWorkerFile(directory, "wrangler.jsonc");
      expect(config, `${directory}/wrangler.jsonc`).not.toMatch(/\"triggers\"\s*:/);
      expect(config, `${directory}/wrangler.jsonc`).not.toMatch(/\"crons\"\s*:/);
    }
  });

  it("does not expose a scheduled handler that can wake Neon periodically", () => {
    for (const directory of workerDirectories) {
      const worker = readWorkerFile(directory, "worker.js");
      expect(worker, `${directory}/worker.js`).not.toMatch(/async\s+scheduled\s*\(/);
    }
  });
});
