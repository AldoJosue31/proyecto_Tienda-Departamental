import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthOnboardingClient } from "../src/onboarding/auth-onboarding.client";
import type { OnboardingDeliveryRecord } from "../src/onboarding/onboarding.types";

const record: OnboardingDeliveryRecord = {
  id: "delivery", challengeId: "challenge", userId: "user", purpose: "EMAIL_VERIFICATION", generation: 1,
  expiresAt: new Date(Date.now() + 60_000).toISOString(), correlationId: "onboarding-fixture", attempts: 1, encrypted: null,
};
const authorization = { authorized: true, contact: { userId: "user", email: "Customer@example.test", name: "Cliente" }, publicOrigin: "http://localhost:3105", returnPath: "/checkout", expiresAt: record.expiresAt };
function client() { return new AuthOnboardingClient({ authServiceUrl: "http://auth-service:3001", authOnboardingInternalServiceKey: "dedicated-fixture-key" }); }
afterEach(() => vi.unstubAllGlobals());

describe("Private onboarding authorization", () => {
  it("sends only the challenge identity with its dedicated credential", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(authorization)));
    vi.stubGlobal("fetch", fetchMock);
    expect(await client().authorize(record)).toMatchObject({ contact: { email: "customer@example.test" } });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://auth-service:3001/internal/auth/onboarding-deliveries/authorize");
    expect(options.headers["x-internal-service-key"]).toBe("dedicated-fixture-key");
    expect(JSON.parse(options.body)).toEqual({ challengeId: "challenge", userId: "user", purpose: "EMAIL_VERIFICATION", generation: 1 });
    expect(options.body).not.toContain("encrypted");
  });

  it("does not authorize revoked challenges or a contact for another identity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ authorized: false }))));
    expect(await client().authorize(record)).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...authorization, contact: { ...authorization.contact, userId: "other" } }))));
    await expect(client().authorize(record)).rejects.toThrow("invalid response");
  });

  it("treats outage and unauthorized internal credentials as recoverable failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    await expect(client().authorize(record)).rejects.toThrow("unavailable");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("denied", { status: 401 })));
    await expect(client().authorize(record)).rejects.toThrow("failed");
  });
});
