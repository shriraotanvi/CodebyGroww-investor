import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

export interface AuthPayload {
  userId: number;
  email: string;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export interface AuthedRequest extends Request {
  user?: AuthPayload;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing auth token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET) as AuthPayload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// For routes that are useful both logged-out (public stock pages) and
// logged-in (personalized attention score if the stock is on your
// watchlist) — attaches req.user when a valid token is present, otherwise
// just continues.
export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET) as AuthPayload;
    } catch {
      // ignore invalid token on optional-auth routes
    }
  }
  next();
}
