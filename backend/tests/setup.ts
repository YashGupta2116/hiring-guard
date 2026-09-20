// Runs before every test file. Values here only apply when .env.test does not set them.
//
// That precedence needs `.env.test` to actually be read, and nothing was reading it: every value
// below fell through to its hard-coded default, so a machine whose Postgres is not on the default
// port failed the whole integration suite with "authentication failed" no matter what `.env.test`
// said. `dotenv` never overwrites an already-set variable, so an explicit `DATABASE_URL=... npm
// test` still wins over the file, and the file still wins over the defaults here.
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.test", quiet: true });

process.env.NODE_ENV = "test";
// POSTGRES_PORT is the same variable docker-compose.yml interpolates for the host mapping, so a
// machine that already has something on 5432 sets one value rather than rewriting this URL. An
// explicit DATABASE_URL still wins over both.
process.env.DATABASE_URL ??= `postgresql://postgres:postgres@localhost:${process.env.POSTGRES_PORT ?? "5432"}/veritrust_test`;
process.env.REDIS_URL ??= "redis://localhost:6379/1";
process.env.HASH_PEPPER ??= "test-pepper-test-pepper-test-pepper-0000";
process.env.JWT_ACCESS_SECRET ??= "test-jwt-secret-test-jwt-secret-test-jwt-secret";
process.env.JOIN_TOKEN_SECRET ??= "test-join-secret-test-join-secret-test-join-secret";
process.env.CANDIDATE_TOKEN_SECRET ??= "test-candidate-secret-test-candidate-secret";
process.env.MAIL_PROVIDER ??= "log";
process.env.STORAGE_LOCAL_DIR ??= "./.test-storage";
process.env.INTERNAL_SERVICE_TOKEN ??= "test-internal-token-test-internal-token";
// Fixed Ed25519 test keypair (PKCS#8 PEM, base64) so `getSigner()` works without running keys:generate.
process.env.EVIDENCE_SIGNING_PRIVATE_KEY ??=
  "LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1DNENBUUF3QlFZREsyVndCQ0lFSUFKd0Q2RzFZdzU5eVlpOHk0YUgrd1pnNFFhVHlDby95TFpSWWpFak5ZdVYKLS0tLS1FTkQgUFJJVkFURSBLRVktLS0tLQo=";
process.env.EVIDENCE_SIGNING_KEY_ID ??= "test-key-1";
