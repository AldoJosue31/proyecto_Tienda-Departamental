import { AccountFrame } from "@/components/auth/account-frame";
import { RegisterForm } from "@/components/auth/register-form";
import { safeReturnPath } from "@/lib/auth/safe-return-path";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AccountFrame title="Crea tu cuenta de cliente" description="Completa tus datos y confirma tu correo antes de iniciar sesión."><RegisterForm nextPath={safeReturnPath(next)} /></AccountFrame>;
}
