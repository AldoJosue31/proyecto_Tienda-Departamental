import { Inject, Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { randomUUID } from "node:crypto";
import type { NotificationRuntimeConfig } from "../config/environment";
import { NOTIFICATION_RUNTIME_CONFIG } from "./notification.config";
import type { EmailRequest } from "./notification.types";
import type { OnboardingEmailRequest } from "../onboarding/onboarding.types";

@Injectable()
export class EmailProvider {
  private readonly logger = new Logger(EmailProvider.name);
  private readonly transporter: Transporter | null;
  constructor(@Inject(NOTIFICATION_RUNTIME_CONFIG) private readonly config: Pick<NotificationRuntimeConfig, "deliveryMode" | "smtpUrl" | "fromEmail">) { this.transporter = config.deliveryMode === "smtp" && config.smtpUrl ? nodemailer.createTransport({ url:config.smtpUrl,connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000 }) : null; }

  async send(request: EmailRequest): Promise<{ messageId: string; simulated: boolean }> {
    return this.deliver({ email: request.email, subject: "Tu cupón " + request.couponCode + " está listo", text: "Gracias por volver a Departamental. Usa el cupón " + request.couponCode + " antes del " + new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(new Date(request.validUntil)) + ".", messageId: "<" + request.campaignId + "." + request.customerId + "@departamental.local>", simulation: "Coupon delivery simulated. notificationId=" + request.notificationId });
  }

  async sendOnboarding(request: OnboardingEmailRequest): Promise<{ messageId: string; simulated: boolean }> {
    const invitation = request.purpose === "EMPLOYEE_INVITATION";
    const deadline = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(request.expiresAt));
    return this.deliver({
      email: request.email,
      subject: invitation ? "Tu invitación como empleado de Departamental" : "Confirma tu correo en Departamental",
      text: [
        "Hola " + request.name + ",",
        "",
        invitation ? "Un administrador te invitó a trabajar con Departamental. Abre el enlace y elige tu contraseña para aceptar la invitación." : "Confirma tu correo para completar tu registro como cliente de Departamental. Abre el enlace y confirma tu solicitud.",
        request.link,
        "",
        "Este enlace vence el " + deadline + " (hora de Ciudad de México). Solo puede usarse una vez.",
        "Si no esperabas este mensaje, puedes ignorarlo. Abrir el enlace no inicia sesión ni activa tu cuenta automáticamente.",
      ].join("\n"),
      messageId: "<onboarding." + request.challengeId + "@departamental.local>",
      simulation: "Onboarding delivery simulated. challengeId=" + request.challengeId,
    });
  }

  private async deliver(message: { email: string; subject: string; text: string; messageId: string; simulation: string }): Promise<{ messageId: string; simulated: boolean }> {
    if (!this.transporter) { const id = "local-" + randomUUID(); this.logger.log(message.simulation); return { messageId: id, simulated: true }; }
    const result = await this.transporter.sendMail({ from: this.config.fromEmail, to: message.email, subject: message.subject, text: message.text, messageId: message.messageId });
    if (!result.accepted?.map(String).some((recipient: string) => recipient.toLowerCase() === message.email.toLowerCase())) throw new Error("SMTP did not accept the recipient.");
    return { messageId: result.messageId || "smtp-" + randomUUID(), simulated: false };
  }
}
