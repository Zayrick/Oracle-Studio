import { useEffect, useRef } from "react";
import { REGISTRATION_TURNSTILE_ACTION } from "@/features/auth/shared";

type Turnstile = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "auto";
      size: "flexible";
      callback(token: string): void;
      "expired-callback"(): void;
      "error-callback"(): void;
      "timeout-callback"(): void;
    },
  ): string;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let scriptPromise: Promise<Turnstile> | undefined;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    const failed = () => {
      window.clearTimeout(timer);
      script.remove();
      scriptPromise = undefined;
      reject(new Error("Turnstile could not load"));
    };
    const timer = window.setTimeout(failed, 15_000);
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onerror = failed;
    script.onload = () => {
      if (!window.turnstile) return failed();
      // The load event is the readiness signal for an asynchronous script.
      window.clearTimeout(timer);
      resolve(window.turnstile);
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function RegistrationTurnstile({
  siteKey,
  onTokenChange,
  onError,
}: {
  siteKey: string;
  onTokenChange(token: string): void;
  onError(): void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: Turnstile; id: string } | null>(null);

  useEffect(() => {
    let active = true;
    onTokenChange("");
    const fail = () => {
      if (!active) return;
      onTokenChange("");
      onError();
    };
    void loadTurnstile()
      .then((api) => {
        if (!active || !container.current) return;
        const id = api.render(container.current, {
          sitekey: siteKey,
          action: REGISTRATION_TURNSTILE_ACTION,
          theme: "auto",
          size: "flexible",
          callback: (token) => {
            if (!active) return;
            onTokenChange(token);
          },
          "expired-callback": fail,
          "error-callback": fail,
          "timeout-callback": fail,
        });
        widget.current = { api, id };
      })
      .catch(fail);
    return () => {
      active = false;
      if (widget.current) widget.current.api.remove(widget.current.id);
      widget.current = null;
    };
  }, [siteKey, onTokenChange, onError]);

  return <div ref={container} className="min-w-0" />;
}
