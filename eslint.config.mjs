import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Async data-fetch effects (await fetch → setState) and the display's
      // localStorage boot read are this app's standard patterns; the rule has
      // no async awareness and flags them all as "synchronous" setState.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated deploy artifacts — never lint these.
    ".open-next/**",
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
