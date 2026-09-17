import { generateKeyPairSync, randomBytes } from "node:crypto";

const { privateKey } = generateKeyPairSync("ed25519");
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

console.log("# Add these to backend/.env (keep them secret)\n");
console.log(`EVIDENCE_SIGNING_PRIVATE_KEY=${Buffer.from(pem).toString("base64")}`);
console.log(`EVIDENCE_SIGNING_KEY_ID=local-${new Date().toISOString().slice(0, 10)}`);
console.log(`HASH_PEPPER=${randomBytes(32).toString("hex")}`);
console.log(`JWT_ACCESS_SECRET=${randomBytes(32).toString("hex")}`);
console.log(`JOIN_TOKEN_SECRET=${randomBytes(32).toString("hex")}`);
console.log(`CANDIDATE_TOKEN_SECRET=${randomBytes(32).toString("hex")}`);
