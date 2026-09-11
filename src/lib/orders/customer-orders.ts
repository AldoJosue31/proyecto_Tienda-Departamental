import { z } from "zod";

const orderStatusSchema = z.enum(["PENDING", "RESERVED", "CONFIRMED", "CANCELLED"]);
const orderChannelSchema = z.enum(["ONLINE", "PHYSICAL"]);

const customerOrderItemSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  categoryId: z.string().min(1),
  variantId: z.string().min(1),
  branchId: z.string().min(1),
  productName: z.string().min(1),
  sku: z.string().min(1),
  variantLabel: z.string().min(1),
  quantity: z.number().int().positive(),
  listUnitPrice: z.number().nonnegative(),
  unitPrice: z.number().nonnegative(),
  lineDiscountTotal: z.number().nonnegative(),
  lineTotal: z.number().nonnegative(),
  currency: z.string().min(3).max(3),
  reservationId: z.string().nullable(),
});

export const customerOrderSchema = z.object({
  id: z.string().min(1),
  branchId: z.string().min(1),
  channel: orderChannelSchema,
  status: orderStatusSchema,
  currency: z.string().min(3).max(3),
  subtotal: z.number().nonnegative(),
  discountTotal: z.number().nonnegative(),
  total: z.number().nonnegative(),
  cancellationReason: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  version: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  items: z.array(customerOrderItemSchema),
});

export const customerOrdersResponseSchema = z.object({ orders: z.array(customerOrderSchema) });
export const customerOrderResponseSchema = z.object({ order: customerOrderSchema });

export type CustomerOrder = z.infer<typeof customerOrderSchema>;
export type CustomerOrderStatus = z.infer<typeof orderStatusSchema>;
