import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // scripts/ too: check-schema-drift.mjs gates every build, and a
    // checker whose own regexes rot fails silently by passing.
    //
    // supabase/functions/_shared/ too. Those modules run under Deno, so the
    // suite can only reach the parts that touch no Deno global — which is
    // deliberate: the HTML extraction is the half that rots when a publisher
    // reshapes their markup, and it is pure string work.
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "scripts/**/*.{test,spec}.{ts,tsx}",
      "supabase/functions/**/*.{test,spec}.{ts,tsx}",
    ],
    // The Supabase client throws at module load when these are missing, so any
    // test that transitively imports it needs them present. They came from a
    // local .env that is gitignored, which made the suite pass on a developer
    // machine and fail everywhere else — CI caught it on its first run.
    //
    // Deliberately not real credentials. A unit test that can reach the live
    // database is a unit test that will eventually write to it.
    env: {
      VITE_SUPABASE_URL: "http://localhost:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-anon-key-not-a-real-key",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
