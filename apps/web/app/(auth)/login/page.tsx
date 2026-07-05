import { forwardAuthCodeIfPresent } from "@/lib/auth/forward-auth-code";
import { LoginForm } from "./login-form";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
    code?: string;
    token_hash?: string;
    type?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  forwardAuthCodeIfPresent(params);

  const callbackError = params.error === "auth_callback_failed";
  const callbackErrorMessage = params.message ?? null;

  return (
    <LoginForm
      callbackError={callbackError}
      callbackErrorMessage={callbackErrorMessage}
    />
  );
}