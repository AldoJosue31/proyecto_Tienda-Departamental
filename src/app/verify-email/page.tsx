import { AccountFrame } from "@/components/auth/account-frame";
import { EmailVerification } from "@/components/auth/email-verification";
import { safeReturnPath } from "@/lib/auth/safe-return-path";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AccountFrame title="Confirma tu correo" description="Confirma que solicitaste esta cuenta. Abrir el enlace todavía no activa tu registro."><EmailVerification nextPath={safeReturnPath(next)} /></AccountFrame>;
}
