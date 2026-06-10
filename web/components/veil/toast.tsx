"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./primitives";
import { shortHash, txUrl } from "@/lib/etherscan";

type ToastTone = "info" | "success" | "error";

export type ToastInput = {
  message: string;
  tone?: ToastTone;
  txHash?: `0x${string}`;
  ttlMs?: number;
};

type ToastState = ToastInput & { id: number };

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const idRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((input: ToastInput) => {
    idRef.current += 1;
    const id = idRef.current;
    setToast({ ...input, id });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, input.ttlMs ?? 3600);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { toast, flash };
}

export function ToastView({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;
  const tone = toast.tone ?? "info";
  const link = txUrl(toast.txHash);
  return (
    <div
      className={[
        "veil-toast-in fixed bottom-7 left-1/2 -translate-x-1/2 z-[200] inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-[var(--bg2)] border text-sm shadow-[0_20px_50px_-16px_rgba(0,0,0,0.7)]",
        tone === "error"
          ? "border-[color-mix(in_oklab,var(--sell)_45%,transparent)]"
          : tone === "success"
            ? "border-[color-mix(in_oklab,var(--accent)_55%,transparent)]"
            : "border-[var(--line2)]",
      ].join(" ")}
    >
      <Icon
        name={tone === "error" ? "lock" : tone === "success" ? "check" : "lock"}
        size={14}
        className={tone === "error" ? "text-[var(--sell)]" : "text-[var(--accent)]"}
      />
      <span className="max-w-[520px] break-words">{toast.message}</span>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer noopener"
          className="font-[var(--font-mono)] text-[11px] text-[var(--accent)] hover:underline"
        >
          {shortHash(toast.txHash)} ↗
        </a>
      )}
    </div>
  );
}
