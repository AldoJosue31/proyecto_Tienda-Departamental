import { describe, expect, it } from "vitest";
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
    })).resolves.toMatch(/^local-/);
  });
});
