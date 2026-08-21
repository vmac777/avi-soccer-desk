import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
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
