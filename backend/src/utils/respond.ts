import type { Response } from "express";

export type ListMeta = {
  nextCursor: string | null;
  limit: number;
};

export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ data });
}

export function created<T>(res: Response, data: T): void {
  ok(res, data, 201);
}

export function accepted<T>(res: Response, data: T): void {
  ok(res, data, 202);
}

export function list<T>(res: Response, data: T[], meta: ListMeta): void {
  res.status(200).json({ data, meta });
}

export function noContent(res: Response): void {
  res.status(204).end();
}
