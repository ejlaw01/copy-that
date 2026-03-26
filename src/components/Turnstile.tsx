"use client";

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback": () => void;
          "expired-callback": () => void;
          size: string;
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

export interface TurnstileHandle {
  reset: () => void;
}

interface TurnstileProps {
  onToken: (token: string) => void;
}

export const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(
  function Turnstile({ onToken }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
    },
  }));

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile) return;
    if (widgetIdRef.current) return;

    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: onToken,
      "error-callback": () => {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
      "expired-callback": () => {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
      size: "invisible",
    });
  }, [onToken]);

  useEffect(() => {
    if (window.turnstile) {
      renderWidget();
      return;
    }

    window.onTurnstileLoad = renderWidget;

    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad";
    script.async = true;
    document.head.appendChild(script);

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
      // Clean up the script element and global callback to prevent
      // accumulation on repeated mounts and stale callback references.
      script.remove();
      delete window.onTurnstileLoad;
    };
  }, [renderWidget]);

  return <div ref={containerRef} />;
});
