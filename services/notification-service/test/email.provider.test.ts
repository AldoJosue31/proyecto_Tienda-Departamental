import { describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import nodemailer from "nodemailer";
import { EmailProvider } from "../src/notifications/email.provider";

describe("EmailProvider", () => {
  it("acepta entregas locales sin conectar a un proveedor SMTP", async () => {
    const provider = new EmailProvider({ deliveryMode: "log", smtpUrl: null, fromEmail: "promociones@departamental.local" });
    await expect(provider.send({
      campaignId: "3f0abfc6-a317-48d3-b7f3-0d6fe0439a7e",
      customerId: "17793654-90d7-45a3-b761-f411eb52c34a",
      notificationId: "a77c82dc-1b70-452b-b92d-d7bfc2640c6c",
      email: "cliente@example.test",
      couponCode: "REGRESA10",
      validUntil: "2026-10-04T18:00:00.000Z",
    })).resolves.toEqual({ messageId: expect.stringMatching(/^local-/), simulated: true });
  });

  it("sends a separate invitation with a stable Message-ID and explicit expiration", async () => {
    const sendMail = vi.fn().mockResolvedValue({ accepted: ["employee@example.test"], messageId: "fixture" });
    vi.spyOn(nodemailer, "createTransport").mockReturnValue({ sendMail } as never);
    const provider = new EmailProvider({ deliveryMode: "smtp", smtpUrl: "smtp://mailpit:1025", fromEmail: "cuentas@departamental.local" });
    await expect(provider.sendOnboarding({ challengeId: "fixture-challenge", purpose: "EMPLOYEE_INVITATION", email: "employee@example.test", name: "Empleado", link: "http://localhost:3105/accept-invitation#token=fixture", expiresAt: "2026-10-12T18:00:00.000Z" })).resolves.toEqual({ messageId: "fixture", simulated: false });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ subject: "Tu invitación como empleado de Departamental", messageId: "<onboarding.fixture-challenge@departamental.local>", text: expect.stringContaining("hora de Ciudad de México") }));
  });

  it("rejects unaccepted recipients and simulation logs contain no link or token", async () => {
    const sendMail = vi.fn().mockResolvedValue({ accepted: [], messageId: "fixture" });
    vi.spyOn(nodemailer, "createTransport").mockReturnValue({ sendMail } as never);
    const request = { challengeId: "fixture-challenge", purpose: "EMAIL_VERIFICATION" as const, email: "customer@example.test", name: "Cliente", link: "http://localhost:3105/verify-email#token=secret-fixture-token", expiresAt: "2026-10-12T18:00:00.000Z" };
    const provider = new EmailProvider({ deliveryMode: "smtp", smtpUrl: "smtp://mailpit:1025", fromEmail: "cuentas@departamental.local" });
    await expect(provider.sendOnboarding(request)).rejects.toThrow("SMTP did not accept the recipient.");
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const simulated = new EmailProvider({ deliveryMode: "log", smtpUrl: null, fromEmail: "cuentas@departamental.local" });
    await expect(simulated.sendOnboarding(request)).resolves.toMatchObject({ simulated: true });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-fixture-token");
    expect(JSON.stringify(log.mock.calls)).not.toContain("verify-email");
  });
});
