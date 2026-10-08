import { z } from "zod";

const customerShipmentStatusSchema = z.enum(["PENDING", "PACKING", "SHIPPED", "DELIVERED", "CANCELLED"]);

export const customerShipmentWireSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
  status: customerShipmentStatusSchema,
  packedAt: z.string().datetime().nullable(),
  shippedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});

export const customerShipmentsWireResponseSchema = z.object({
  shipments: z.array(customerShipmentWireSchema),
});

export const customerShipmentSchema = customerShipmentWireSchema.omit({ customerId: true });
export const customerShipmentsResponseSchema = z.object({
  shipments: z.array(customerShipmentSchema),
});

export type CustomerShipment = z.infer<typeof customerShipmentSchema>;
export type CustomerShipmentStatus = z.infer<typeof customerShipmentStatusSchema>;

export function toCustomerShipment(shipment: z.infer<typeof customerShipmentWireSchema>): CustomerShipment {
  return customerShipmentSchema.parse(shipment);
}
