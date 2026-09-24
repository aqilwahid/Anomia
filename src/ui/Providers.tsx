"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";

/* ------------------------------------------------------------------ toast */

type ToastTone = "default" | "success" | "error";

export interface ToastInput {
  message: React.ReactNode;
  tone?: ToastTone;
  action?: { label: string; onClick: () => void };
  /** ms; default 5000, 8000 when there is an action */
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

interface ToastApi {
  show: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <Providers>");
  return ctx;
}

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration ?? (toast.action ? 7000 : 4500));
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const Icon = toast.tone === "error" ? AlertTriangle : toast.tone === "success" ? CheckCircle2 : Info;
  const iconColor =
    toast.tone === "error" ? "text-confidence-low" : toast.tone === "success" ? "text-confidence-high" : "text-inverse-primary";

  return (
    <div
      role="status"
      className="pointer-events-auto flex items-center gap-3 min-w-[260px] max-w-[min(92vw,480px)] pl-3.5 pr-2 py-2.5 rounded-xl bg-inverse-surface text-inverse-on-surface shadow-xl animate-pop-in"
    >
      <Icon size={18} className={`shrink-0 ${iconColor}`} aria-hidden />
      <div className="flex-1 text-body-md leading-snug">{toast.message}</div>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action!.onClick();
            onDismiss(toast.id);
          }}
          className="shrink-0 px-2.5 py-1 rounded-md font-label-md text-label-md text-inverse-primary hover:bg-white/10"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 p-1 rounded-md text-inverse-on-surface/60 hover:text-inverse-on-surface hover:bg-white/10"
        aria-label="Tutup notifikasi"
      >
        <X size={15} />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- confirm */

export interface ConfirmInput {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

type ConfirmFn = (input: ConfirmInput) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <Providers>");
  return ctx;
}

/* -------------------------------------------------------------- providers */

export function Providers({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const toastApi = useMemo<ToastApi>(
    () => ({
      show: (toast) => {
        const id = nextId.current++;
        setToasts((all) => [...all.slice(-1), { ...toast, id }]);
      },
    }),
    []
  );

  const [pending, setPending] = useState<(ConfirmInput & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback<ConfirmFn>(
    (input) => new Promise<boolean>((resolve) => setPending({ ...input, resolve })),
    []
  );
  const settle = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <ToastContext.Provider value={toastApi}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <Modal
          open={!!pending}
          onClose={() => settle(false)}
          title={pending?.title ?? ""}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => settle(false)}>
                {pending?.cancelLabel ?? "Batal"}
              </Button>
              <Button variant={pending?.tone === "danger" ? "danger" : "primary"} onClick={() => settle(true)} data-autofocus>
                {pending?.confirmLabel ?? "Ya, lanjutkan"}
              </Button>
            </>
          }
        >
          {pending?.message && <div className="text-body-md text-on-surface-variant">{pending.message}</div>}
        </Modal>
        <div className="fixed inset-x-0 bottom-4 z-[90] flex flex-col items-center gap-2 px-3 pointer-events-none no-print">
          {toasts.map((t) => (
            <ToastView key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}
