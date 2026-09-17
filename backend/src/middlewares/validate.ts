import type { Request, RequestHandler } from "express";
import type { z } from "zod";

export type RequestSchemas = {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
};

export type ValidatedInput<S extends RequestSchemas> = {
  [K in keyof S]: S[K] extends z.ZodType ? z.output<S[K]> : never;
};

/**
 * Validates body, query and params with zod. Throws ZodError (handled by error-handler → 400).
 * Express 5 makes req.query read-only, so parsed values are stored on req.input.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    req.input = {
      body: schemas.body ? schemas.body.parse(req.body ?? {}) : undefined,
      query: schemas.query ? schemas.query.parse(req.query) : undefined,
      params: schemas.params ? schemas.params.parse(req.params) : undefined,
    };
    next();
  };
}

/** Typed access to what validate() parsed. Pass the same schemas object used in the route. */
export function getInput<S extends RequestSchemas>(req: Request, _schemas: S): ValidatedInput<S> {
  if (!req.input) {
    throw new Error("getInput() called on a route without validate() middleware");
  }
  return req.input as ValidatedInput<S>;
}
