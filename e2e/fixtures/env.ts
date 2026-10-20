import dotenv from "dotenv";
import path from "node:path";

// Loads the local-only e2e config (see .env.example for the template).
dotenv.config({
  path: path.resolve(import.meta.dirname, "../../.env"),
});

export const env = {
  /** Frontend (Vite dev server) URL that Playwright drives. */
  baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
  port: Number(process.env.PLAYWRIGHT_PORT ?? 5173),
  /** Local Laravel backend (docker-compose.e2e.yml), for direct API assertions. */
  backendUrl: process.env.BACKEND_URL ?? "http://localhost:8085",
  backendApiUrl: process.env.BACKEND_API_URL ?? "http://localhost:8085/api/v1",
  apiKey: process.env.VITE_API_KEY ?? "Tpvra20!3o#ynyq",
  /** Disposable e2e-only admin fixture, see waqfnami E2ETestAdminSeeder. */
  adminEmail: process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@waqf.test",
  adminPassword: process.env.E2E_ADMIN_PASSWORD ?? "E2eTest#12345",
  /** Separate admin for logout specs - logout revokes all of a user's tokens. */
  logoutAdminEmail: process.env.E2E_LOGOUT_ADMIN_EMAIL ?? "e2e-logout-admin@waqf.test",
};
