// Generates JWT_PRIVATE_KEY + JWKS for Convex Auth (email/password).
// Run: node scripts/generate-auth-keys.mjs
// Then set them with:
//   npx convex env set JWT_PRIVATE_KEY "<output>"
//   npx convex env set JWKS '<output>'
//   npx convex env set SITE_URL http://localhost:5173  (use your Vercel URL in prod)
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const publicKey = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });

process.stdout.write(`JWT_PRIVATE_KEY="${privateKey.trimEnd().replace(/\n/g, " ")}"\n`);
process.stdout.write(`JWKS=${jwks}\n`);
