import { expect, test } from "vitest";

const securityUrl = process.env.PRISM_SECURITY_URL ?? "http://localhost:8084";
const backendUrl = process.env.PRISM_BACKEND_URL ?? "http://localhost:8082";

async function getJson(path) {
  const response = await fetch(new URL(path, securityUrl), {
    signal: AbortSignal.timeout(5000),
  });
  expect(response.status, `${path} should return HTTP 200`).toBe(200);
  return response.json();
}

test("blockchain endpoint returns the live ledger structure", async () => {
  const ledger = await getJson("/api/security/blockchain");

  expect(Array.isArray(ledger.chain)).toBe(true);
  expect(typeof ledger.totalBlocks).toBe("number");
  expect(typeof ledger.pendingLogs).toBe("number");
  expect(typeof ledger.totalFraudLogs).toBe("number");
  expect(ledger.chain.length).toBeGreaterThan(0);
});

test("blockchain verification reports an intact chain", async () => {
  const verification = await getJson("/api/security/blockchain/verify");

  expect(verification.valid, verification.reason).toBe(true);
  expect(typeof verification.reason).toBe("string");
});

test("backend reports the EIF service health", async () => {
  const response = await fetch(new URL("/api/health/eif", backendUrl), {
    signal: AbortSignal.timeout(5000),
  });
  expect(response.status).toBe(200);

  const health = await response.json();
  expect(health.status).toBe("HEALTHY");
  expect(health.model_loaded).toBe(true);
});
