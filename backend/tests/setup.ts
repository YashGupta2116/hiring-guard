// Runs before every test file. Values here only apply when .env.test does not set them.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/veritrust_test";
process.env.REDIS_URL ??= "redis://localhost:6379/1";
process.env.HASH_PEPPER ??= "test-pepper-test-pepper-test-pepper-0000";
process.env.JWT_ACCESS_SECRET ??= "test-jwt-secret-test-jwt-secret-test-jwt-secret";
process.env.JOIN_TOKEN_SECRET ??= "test-join-secret-test-join-secret-test-join-secret";
process.env.CANDIDATE_TOKEN_SECRET ??= "test-candidate-secret-test-candidate-secret";
process.env.MAIL_PROVIDER ??= "log";
process.env.STORAGE_LOCAL_DIR ??= "./.test-storage";
