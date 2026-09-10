import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  useLocation,
  useNavigate,
  useRevalidator,
  useRouteLoaderData,
} from "react-router";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  isAuthDialogMode,
  safeRedirect,
  type AuthDialogMode,
} from "@/features/auth/shared";
import type { loader } from "@/root";

const LazyAuthForm = lazy(() =>
  import("@/components/account/auth-form").then(({ AuthForm }) => ({
    default: AuthForm,
  })),
);

type DialogRequest = {
  mode: AuthDialogMode;
  email?: string;
  redirectTo?: string;
  passwordReset?: boolean;
};

const AuthDialogContext = createContext<{
  prepareDialog: (request: DialogRequest) => void;
  handle: DialogPrimitive.Handle<unknown>;
} | null>(null);

export function AuthDialogProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const turnstileSiteKey =
    useRouteLoaderData<typeof loader>("root")?.turnstileSiteKey ?? "";
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [handle] = useState(() => DialogPrimitive.createHandle());
  const [triggerId, setTriggerId] = useState<string | null>(null);
  const [details, setDetails] = useState<
    (DialogRequest & { key: number }) | null
  >(null);
  const nextKey = useRef(0);

  const prepareDialog = useCallback((request: DialogRequest) => {
    setPending(false);
    setDetails({ ...request, key: ++nextKey.current });
  }, []);

  useEffect(() => {
    const search = new URLSearchParams(location.search);
    const mode = search.get("auth");
    if (!isAuthDialogMode(mode)) return;
    prepareDialog({
      mode,
      email: (search.get("email") ?? "").slice(0, 254),
      redirectTo: safeRedirect(search.get("redirectTo")),
    });
    setOpen(true);
    setTriggerId(null);
    // Consume deep links once so a later refresh does not reopen a completed flow.
    search.delete("auth");
    search.delete("email");
    search.delete("redirectTo");
    void navigate(
      {
        pathname: location.pathname,
        search: search.toString(),
        hash: location.hash,
      },
      { replace: true, preventScrollReset: true },
    );
  }, [
    location.pathname,
    location.search,
    location.hash,
    navigate,
    prepareDialog,
  ]);

  async function finishSignIn() {
    await revalidator.revalidate();
    setOpen(false);
    if (details?.redirectTo) {
      await navigate(safeRedirect(details.redirectTo), { replace: true });
    }
  }

  return (
    <AuthDialogContext value={{ prepareDialog, handle }}>
      {children}
      <Dialog
        handle={handle}
        triggerId={triggerId}
        open={open}
        onOpenChange={(nextOpen, eventDetails) => {
          if (pending) return;
          setOpen(nextOpen);
          setTriggerId(eventDetails.trigger?.id ?? null);
        }}
      >
        {details ? (
          <DialogContent
            className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
            showCloseButton={!pending}
            aria-describedby={undefined}
          >
            <Suspense
              fallback={
                <>
                  <DialogHeader>
                    <DialogTitle>
                      {details.mode === "login"
                        ? "登录账户"
                        : details.mode === "register"
                          ? "创建账户"
                          : "重置密码"}
                    </DialogTitle>
                  </DialogHeader>
                  <Spinner aria-label="正在加载" />
                </>
              }
            >
              <LazyAuthForm
                key={details.key}
                mode={details.mode}
                initialEmail={details.email ?? ""}
                turnstileSiteKey={turnstileSiteKey}
                dialog={{
                  passwordReset: details.passwordReset,
                  onPendingChange: setPending,
                  onSignedIn: finishSignIn,
                  onModeChange: (mode, email, passwordReset) =>
                    prepareDialog({ ...details, mode, email, passwordReset }),
                }}
              />
            </Suspense>
          </DialogContent>
        ) : null}
      </Dialog>
    </AuthDialogContext>
  );
}

export function AuthDialogTrigger({
  mode,
  email,
  redirectTo,
  children,
  ...buttonProps
}: DialogRequest &
  Pick<
    ComponentProps<typeof Button>,
    "children" | "variant" | "size" | "className" | "disabled"
  >) {
  const context = useContext(AuthDialogContext);
  const id = useId();
  if (!context)
    throw new Error("AuthDialogTrigger requires AuthDialogProvider");
  return (
    <DialogTrigger
      id={id}
      handle={context.handle}
      render={<Button {...buttonProps} />}
      onClick={() => context.prepareDialog({ mode, email, redirectTo })}
    >
      {children}
    </DialogTrigger>
  );
}
