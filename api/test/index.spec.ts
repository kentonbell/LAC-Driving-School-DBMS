import { describe, it, expect } from "vitest";
import worker from "../src/index";

describe("Worker boundary", () => {
  it("reports health without secrets and does not cache responses", async () => {
    const response = await worker.fetch(
      new Request("https://lac.example/health"),
      {},
    );
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("fails closed without database configuration or a valid access code", async () => {
    const req = new Request("https://lac.example/api/dashboard");
    expect((await worker.fetch(req, {})).status).toBe(503);
    expect(
      (
        await worker.fetch(req, {
          DATABASE_URL: "postgresql://fake:fake@example.test/fake",
        })
      ).status,
    ).toBe(401);
  });
  it("only allows cross-origin browser requests from the configured frontend", async () => {
    const env = { FRONTEND_ORIGIN: "https://lac.example" };
    const req = (origin: string) =>
      new Request("https://api.example/api/chat", {
        method: "OPTIONS",
        headers: { Origin: origin },
      });
    expect((await worker.fetch(req("https://evil.example"), env)).status).toBe(
      403,
    );
    const allowed = await worker.fetch(req(env.FRONTEND_ORIGIN), env);
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      env.FRONTEND_ORIGIN,
    );
  });
});
