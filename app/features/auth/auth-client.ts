import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

type AuthClient = ReturnType<
  typeof createAuthClient<{ plugins: [ReturnType<typeof emailOTPClient>] }>
>;

export const authClient: AuthClient = createAuthClient({
  plugins: [emailOTPClient()],
});
