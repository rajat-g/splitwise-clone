import { ConvexError } from "convex/values";
import { Password } from "@convex-dev/auth/providers/Password";
import { Email } from "@convex-dev/auth/providers/Email";
import { convexAuth } from "@convex-dev/auth/server";
import type { DataModel } from "./_generated/dataModel";
import { env } from "./_generated/server";

const OTP_MAX_AGE_S = 15 * 60;

async function sixDigitCode(): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.getRandomValues) {
    throw new ConvexError("Email verification is unavailable right now. Try again later.");
  }
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

const VerifyEmail = Email({
  id: "email-otp",
  maxAge: OTP_MAX_AGE_S,
  generateVerificationToken: sixDigitCode,
  sendVerificationRequest: async ({ identifier: to, token: code, expires }) => {
    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) {
      throw new ConvexError(
        "Email sending is not configured. Set RESEND_API_KEY on the Convex deployment, then try again."
      );
    }
    // Default is Resend's onboarding address (delivers to your own address
    // only — fine for testing). Production needs a verified domain here.
    const from = env.AUTH_EMAIL_FROM ?? "FairSplit <onboarding@resend.dev>";
    const minutes = Math.max(1, Math.round((expires.getTime() - Date.now()) / 60000));
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: `Your FairSplit code is ${code}`,
        text: `Someone (hopefully you) requested a verification code for ${to} on FairSplit.\n\nEnter this code within ${minutes} minutes:\n\n${code}\n\nIf that wasn't you, ignore this email — nothing is signed in.`,
      }),
    });
    if (!res.ok) {
      throw new ConvexError("Couldn't send the verification email. Check the address and try again.");
    }
  },
});

const CustomPassword = Password<DataModel>({
  profile(params) {
    const email = String(params.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError("Enter a valid email address.");
    }
    const name =
      typeof params.name === "string" && params.name.trim()
        ? params.name.trim().slice(0, 40)
        : email.split("@")[0].slice(0, 40);
    return { email, name };
  },
  validatePasswordRequirements: (password: string) => {
    if (typeof password !== "string" || password.length < 8) {
      throw new ConvexError("Password must be at least 8 characters.");
    }
  },
  // Require mailbox proof before any session: signup/sign-in for an
  // unverified address sends an OTP instead of signing in. Sessions (and
  // therefore group invites) can only ever attach to verified emails,
  // which closes email-squatting impersonation.
  verify: VerifyEmail,
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [CustomPassword],
});
