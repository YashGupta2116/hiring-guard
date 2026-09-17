import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";

const app = createApp();

describe("app foundation", () => {
  it("GET /api/v1/health returns ok in the success envelope", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ok");
  });

  it("returns the 404 error envelope for unknown routes", async () => {
    const res = await request(app).get("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: "NOT_FOUND" });
    expect(typeof res.body.error.requestId).toBe("string");
  });

  it("returns VALIDATION_FAILED for malformed JSON", async () => {
    const res = await request(app).post("/api/v1/health").set("Content-Type", "application/json").send("{bad json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("echoes a safe incoming X-Request-Id and replaces an unsafe one", async () => {
    const safe = await request(app).get("/api/v1/health").set("X-Request-Id", "trace-12345678");
    expect(safe.headers["x-request-id"]).toBe("trace-12345678");

    const unsafe = await request(app).get("/api/v1/health").set("X-Request-Id", "<script>");
    expect(unsafe.headers["x-request-id"]).not.toBe("<script>");
  });

  it("sets security headers and hides x-powered-by", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
