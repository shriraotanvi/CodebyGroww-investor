import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { queryOne, type UserRow } from "../db.js";
import { signToken } from "../auth.js";
import { seedDemoUser } from "../seed.js";

export const authRouter = Router();

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1).max(60).optional(),
});

authRouter.post("/register", async (req, res, next) => {
  try {
    const parsed = credsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    const { email, password, displayName } = parsed.data;

    const existing = await queryOne("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existing) return res.status(409).json({ error: "An account with this email already exists" });

    const hash = bcrypt.hashSync(password, 10);
    const inserted = await queryOne<{ id: number }>(
      "INSERT INTO users (email, password_hash, display_name, created_at) VALUES ($1, $2, $3, $4) RETURNING id",
      [email.toLowerCase(), hash, displayName || email.split("@")[0], Date.now()]
    );

    const token = signToken({ userId: inserted!.id, email: email.toLowerCase() });
    res.status(201).json({ token, user: { id: inserted!.id, email: email.toLowerCase(), displayName } });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const parsed = credsSchema.omit({ displayName: true }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    const { email, password } = parsed.data;

    const user = await queryOne<UserRow>("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signToken({ userId: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email, displayName: user.display_name } });
  } catch (err) {
    next(err);
  }
});

// One-click demo access so the app is immediately usable without signup.
authRouter.post("/demo", async (_req, res, next) => {
  try {
    const user = await seedDemoUser();
    const token = signToken({ userId: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email, displayName: user.display_name } });
  } catch (err) {
    next(err);
  }
});
