import { AccountFrame } from "@/components/auth/account-frame";
import { AcceptInvitation } from "@/components/auth/accept-invitation";

export default function AcceptInvitationPage() {
  return <AccountFrame title="Acepta tu invitación" description="Elige tu propia contraseña para activar tu cuenta de empleado."><AcceptInvitation /></AccountFrame>;
}
