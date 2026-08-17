import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Output build OpenNext + wrangler (generated, bukan source):
    ".open-next/**",
    ".wrangler/**",
    "**/.wrangler/**", // artefak wrangler di subfolder (mis. workers/d1-resync)
    "workers/**/node_modules/**",
  ]),
]);

export default eslintConfig;
