import { ConvexError } from "convex/values";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { DataModel } from "./_generated/dataModel";

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
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [CustomPassword],
});
