import { defineApp } from "convex/server";
import { v } from "convex/values";

// Typed backend environment (read via `env` from "./_generated/server").
// RESEND_API_KEY enables OTP verification emails; without it, signup and
// sign-in for unverified addresses fail closed with a setup error.
const app = defineApp({
  env: {
    RESEND_API_KEY: v.optional(v.string()),
    AUTH_EMAIL_FROM: v.optional(v.string()),
  },
});

export default app;
