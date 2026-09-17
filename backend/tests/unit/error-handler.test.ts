import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorHandler } from "../../src/middlewares/error-handler.js";
import { requestId } from "../../src/middlewares/request-id.js";
import { getInput, validate } from "../../src/middlewares/validate.js";
import { AppError } from "../../src/utils/app-error.js";

const schemas = {
  body: z.object({ durationMinutes: z.number().int().min(15).max(240) }),
  query: z.object({ limit: z.coerce.number().int().max(100).default(20) }),
};

function buildApp() {
  const app = express();
  app.use(requestId, express.json());
  app.get("/app-error", () => {
    throw new AppError("INVALID_STATE_TRANSITION", "Session must be ADMITTED to start.", { currentStatus: "ARMED" });
  });
  app.get("/async-crash", async () => {
    throw new Error("database password is hunter2");
  });
  app.post("/validated", validate(schemas), (req, res) => {
    const { body, query } = getInput(req, schemas);
    res.json({ data: { durationMinutes: body.durationMinutes, limit: query.limit } });
  });
  app.use(errorHandler);
  return app;
}

describe("error handler", () => {
  const app = buildApp();

  it("maps AppError to its status, code and details", async () => {
    const res = await request(app).get("/app-error");
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: "INVALID_STATE_TRANSITION",
      message: "Session must be ADMITTED to start.",
      details: { currentStatus: "ARMED" },
    });
  });

  it("hides internal messages for unknown async errors", async () => {
    const res = await request(app).get("/async-crash");
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(res.body)).not.toContain("hunter2");
  });

  it("returns field-level details for zod failures", async () => {
    const res = await request(app).post("/validated").send({ durationMinutes: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.details.fields[0].path).toBe("durationMinutes");
  });

  it("passes parsed and coerced values to the handler", async () => {
    const res = await request(app).post("/validated?limit=50").send({ durationMinutes: 60 });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ durationMinutes: 60, limit: 50 });
  });
});
