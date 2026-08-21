import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * Lint was decorative: ~180 violations and `no-unused-vars` switched off, so
 * nobody ran it and CI could not gate on it. A check that is red on day one
 * only teaches people to ignore red.
 *
 * This makes it gateable without pretending the debt is gone. Everything that
 * indicates a bug is an error and the count is zero. `no-explicit-any` is the
 * one real backlog — 129 of them — so it is a warning under a ratchet in the
 * `lint` script: the number can go down, never up.
 */
export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // tsc owns this now: noUnusedLocals and noUnusedParameters are on, and
      // two tools reporting the same thing just doubles the noise.
      "@typescript-eslint/no-unused-vars": "off",

      // The backlog. Warned, ratcheted in the lint script, not ignored.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // shadcn/ui is generated vendor code kept as-is so it can be re-generated.
    // Its empty prop interfaces and mixed component/variant exports are how the
    // upstream templates are written, not decisions made here.
    files: ["src/components/ui/**"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
      "react-refresh/only-export-components": "off",
    },
  },
  {
    // Deno edge functions: same rules, different runtime. Excluding them would
    // drop lint coverage on the code that holds the authorization checks.
    files: ["supabase/functions/**/*.ts"],
    languageOptions: {
      globals: { Deno: "readonly" },
    },
  },
  {
    // Config files are CommonJS by convention and run in Node, not the browser.
    files: ["*.config.{ts,js}"],
    languageOptions: { globals: globals.node },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
