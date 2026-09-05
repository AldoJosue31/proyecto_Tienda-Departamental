import { Controller, Get, Param, UseGuards } from "@nestjs/common";

import { ApiException } from "../common/api-exception";
import { InternalNotificationGuard } from "../common/internal-notification.guard";
import { UsersRepository } from "./users.repository";

@Controller("internal/users")
@UseGuards(InternalNotificationGuard)
export class NotificationContactController {
  constructor(private readonly users: UsersRepository) {}

  @Get(":id/notification-contact")
  async contact(@Param("id") id: string): Promise<{ contact: { customerId: string; email: string } }> {
    const user = await this.users.findActiveById(id);
    if (!user) throw new ApiException(404, "USER_NOT_FOUND", "Usuario no disponible para notificación");
    return { contact: { customerId: user.id, email: user.email } };
  }
}
