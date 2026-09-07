export interface CouponEmailRequestedEvent {
  eventId: string;
  eventType: "coupon.email.requested.v1";
  occurredAt: string;
  correlationId: string | null;
  campaignId: string;
  customerId: string;
  couponCode: string;
  validUntil: string;
}

export type DeliveryStatus = "PENDING" | "PROCESSING" | "SENT" | "FAILED" | "UNDELIVERABLE";
export type NotificationFailureCode = "DELIVERY_FAILED" | "UNDELIVERABLE";

export interface NotificationContact { customerId: string; email: string; }
export interface EmailRequest { customerId: string; email: string; campaignId: string; couponCode: string; validUntil: string; notificationId: string; }
