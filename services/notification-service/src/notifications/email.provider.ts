import { Inject, Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { randomUUID } from "node:crypto";
import type { NotificationRuntimeConfig } from "../config/environment";
import { NOTIFICATION_RUNTIME_CONFIG } from "./notification.config";
import type { EmailRequest } from "./notification.types";

@Injectable()
export class EmailProvider {
  private readonly logger = new Logger(EmailProvider.name);
  private readonly transporter: Transporter | null;
  constructor(@Inject(NOTIFICATION_RUNTIME_CONFIG) private readonly config: Pick<NotificationRuntimeConfig, "deliveryMode" | "smtpUrl" | "fromEmail">) { this.transporter = config.deliveryMode === "smtp" && config.smtpUrl ? nodemailer.createTransport({ url:config.smtpUrl,connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000 }) : null; }

  async send(request: EmailRequest): Promise<{ messageId: string; simulated: boolean }> {
    if (!this.transporter) { const id = "local-" + randomUUID(); this.logger.log("Coupon delivery simulated. notificationId=" + request.notificationId); return { messageId: id, simulated: true }; }
    const result = await this.transporter.sendMail({ from: this.config.fromEmail, to: request.email, subject: "Tu cupón " + request.couponCode + " está listo", text: "Gracias por volver a Departamental. Usa el cupón " + request.couponCode + " antes del " + new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(new Date(request.validUntil)) + ".", messageId: "<" + request.campaignId + "." + request.customerId + "@departamental.local>" });
    if (!result.accepted?.map(String).some((recipient: string) => recipient.toLowerCase() === request.email.toLowerCase())) throw new Error("SMTP did not accept the recipient.");
    return { messageId: result.messageId || "smtp-" + randomUUID(), simulated: false };
  }
}
