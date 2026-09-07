import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(webRoot, relativePath), "utf8");

describe("Fase 12: campañas y notificaciones asíncronas", () => {
  it("mantiene Notification aislado con PostgreSQL, red y contenedor propios", () => {
    const compose = read("compose.yaml");
    expect(compose).toContain("notification-service:");
    expect(compose).toContain("notification-postgres:");
    expect(compose).toContain("notification-internal:");
    expect(compose).toContain("notification_postgres_data:");
    expect(compose).not.toMatch(/notification-service:[\s\S]{0,1500}\n\s+ports:/);
  });

  it("implementa los dos Outbox y los contratos de eventos, con reintento y DLQ", () => {
    const crmOutbox = read("services/crm-service/src/crm/campaign-outbox.service.ts");
    const crmService = read("services/crm-service/src/crm/crm.service.ts");
    const notificationOutbox = read("services/notification-service/src/notifications/notification-outbox.service.ts");
    const notificationConsumer = read("services/notification-service/src/notifications/notification.consumer.ts");
    const delivery = read("services/notification-service/src/notifications/notification-delivery.service.ts");
    expect(crmOutbox).toContain("crm_campaign_outbox_events");
    expect(crmService).toContain("coupon.email.requested.v1");
    expect(notificationOutbox).toContain("notification_outbox_events");
    expect(delivery).toContain("notification.sent.v1");
    expect(delivery).toContain("notification.failed.v1");
    expect(notificationConsumer).toContain('const DLQ = QUEUE + ".dlq"');
    expect(delivery).toContain("status = 'PENDING'");
    expect(delivery).toContain("status = 'FAILED'");
  });

  it("protege campañas para ADMIN desde Gateway, BFF y el servicio", () => {
    const kong = read("infra/kong/kong.yml.template");
    expect(kong).toContain("name: crm-campaign-create");
    expect(kong).toContain("name: crm-campaign-detail");
    expect(read("services/crm-service/src/crm/crm.controller.ts")).toContain('@Post("campaigns")');
    expect(read("services/crm-service/src/crm/crm.controller.ts")).toContain('@Roles("ADMIN")');
    expect(read("src/app/api/crm/campaigns/route.ts")).toContain('user.role !== "ADMIN"');
    expect(read("src/app/api/crm/campaigns/[id]/route.ts")).toContain('user.role !== "ADMIN"');
  });

  it("no comparte Auth DB y deja el envío local como configuración de desarrollo", () => {
    const contact = read("services/notification-service/src/notifications/auth-contact.client.ts");
    const provider = read("services/notification-service/src/notifications/email.provider.ts");
    expect(contact).toContain("/internal/users/");
    expect(contact).not.toContain("auth_service");
    expect(provider).toContain('deliveryMode === "smtp"');
    expect(provider).toContain('"local-" + randomUUID()');
  });

  it("muestra el total antes de confirmar y sigue estados de entrega en el frontend", () => {
    expect(existsSync(path.join(webRoot, "src/app/api/crm/campaigns/route.ts"))).toBe(true);
    const workspace = read("src/components/crm-workspace.tsx");
    expect(workspace).toContain("Confirmación requerida");
    expect(workspace).toContain("Preparar campaña");
    expect(workspace).toContain("Confirmar y enviar");
    expect(workspace).toContain("Notification procesa la cola");
  });
});
