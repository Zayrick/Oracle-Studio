import { authClient } from "./auth-client";

type RegistrationError = { code?: string; message?: string };

export const registrationClient = {
  sendCode(body: { email: string; name: string; turnstileToken: string }) {
    return authClient.$fetch<{ success: boolean }, RegistrationError>(
      "/registration/send-code",
      { method: "POST", body },
    );
  },
  verifyEmail(body: { email: string; name: string; otp: string }) {
    return authClient.$fetch<
      { token: string; expiresAt: number },
      RegistrationError
    >("/registration/verify-email", { method: "POST", body });
  },
  complete(body: { email: string; token: string; password: string }) {
    return authClient.$fetch<{ success: boolean }, RegistrationError>(
      "/registration/complete",
      { method: "POST", body },
    );
  },
};
