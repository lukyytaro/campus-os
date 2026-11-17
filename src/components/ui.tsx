"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FocusEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";

/* ------------------------------------------------------------------ */
/* Tombol                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm",
  secondary:
    "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 active:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:active:bg-zinc-600",
  outline:
    "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 active:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
  ghost:
    "text-zinc-700 hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:active:bg-zinc-700",
  danger:
    "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-10 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
      {...props}
    >
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Field: label + kontrol + pesan error                                */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  required = false,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{hint}</p>
      ) : null}
    </div>
  );
}

const CONTROL_CLASS =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 text-[15px] text-zinc-900 placeholder:text-zinc-400 shadow-sm transition-[border-color,box-shadow] duration-150 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-blue-500";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input {...rest} className={`h-10 ${CONTROL_CLASS} ${className}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <select {...rest} className={`h-10 appearance-none pr-8 ${CONTROL_CLASS} ${className}`}>
      {children}
    </select>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return (
    <textarea
      {...rest}
      className={`min-h-24 py-2.5 leading-relaxed ${CONTROL_CLASS} ${className}`}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

type BadgeTone = "blue" | "green" | "amber" | "red" | "zinc" | "violet";

const BADGE_TONES: Record<BadgeTone, string> = {
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/30",
  green:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30",
  amber:
    "bg-amber-50 text-amber-700 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30",
  red: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/30",
  zinc: "bg-zinc-100 text-zinc-700 ring-zinc-600/15 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-400/20",
  violet:
    "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/30",
};

export function Badge({
  tone = "zinc",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Modal & dialog konfirmasi                                           */
/* ------------------------------------------------------------------ */

/**
 * Tumpukan modal yang sedang terbuka (m2): dipakai untuk reference-count
 * scroll-lock body dan memastikan hanya modal teratas yang merespons
 * Escape / menjebak fokus Tab. Tanpa ini, menutup modal dalam (mis.
 * "Mata kuliah baru" dari dalam modal form) akan membuka scroll body
 * selagi modal luar masih terbuka, dan satu Escape menutup keduanya.
 */
const modalStack: string[] = [];

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (node) => node.offsetParent !== null || node === document.activeElement,
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  // Stabilkan onClose agar effect hanya bergantung pada `open`.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    // Simpan elemen pemicu untuk pengembalian fokus saat menutup (m6).
    triggerRef.current = document.activeElement as HTMLElement | null;
    modalStack.push(id);
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      // Hanya modal teratas yang menangani keyboard.
      if (modalStack[modalStack.length - 1] !== id) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      // Focus trap (m6): Tab tidak boleh keluar dari panel.
      if (e.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const focusable = focusableIn(panel);
        if (focusable.length === 0) {
          e.preventDefault();
          panel.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey) {
          if (active === first || !panel.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last || !panel.contains(active)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", onKey);

    // Fokus awal: kontrol pertama di dalam panel, atau panel itu sendiri.
    const panel = panelRef.current;
    const firstFocusable = panel ? focusableIn(panel)[0] : undefined;
    (firstFocusable ?? panel)?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      const idx = modalStack.indexOf(id);
      if (idx !== -1) modalStack.splice(idx, 1);
      // Pulihkan scroll body hanya bila tidak ada modal lain yang terbuka.
      if (modalStack.length === 0) {
        document.body.style.overflow = "";
      }
      // Kembalikan fokus ke elemen pemicu (m6).
      const trigger = triggerRef.current;
      if (trigger && document.contains(trigger)) {
        trigger.focus();
      }
    };
  }, [open, id]);

  if (!open) return null;

  // Dirender lewat portal ke document.body: Modal dipakai di dalam halaman
  // yang berada di bawah wrapper animasi AppShell — tanpa portal, backdrop
  // `fixed inset-0` akan terperangkap di stacking context wrapper itu
  // (hanya menutupi area konten, tampak seperti blok abu-abu) dan kalah
  // dari header/bottom nav (z-40). Portal menjamin overlay selalu menutupi
  // seluruh viewport dan berada di atas segalanya.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onFocus={(e: FocusEvent<HTMLDivElement>) => {
          // Bila keyboard terbuka, browser tidak selalu menggeser panel
          // yang bisa di-scroll: pastikan kontrol yang fokus tetap
          // terlihat di dalam panel.
          const target = e.target as HTMLElement;
          if (target && target !== panelRef.current) {
            window.setTimeout(() => {
              target.scrollIntoView({ block: "nearest" });
            }, 120);
          }
        }}
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl outline-none sm:rounded-2xl dark:bg-zinc-900 ${
          wide ? "sm:max-w-2xl" : "sm:max-w-lg"
        }`}
      >
        <div className="sticky top-0 flex items-center justify-between gap-4 border-b border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-serif text-lg font-semibold text-zinc-900 [text-wrap:balance] dark:text-zinc-50">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)_+_1.25rem)]">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  danger = false,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-[15px] leading-relaxed text-zinc-600 [text-wrap:pretty] dark:text-zinc-400">
        {message}
      </p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onClose} disabled={loading}>
          Batal
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton, empty state, error                                        */
/* ------------------------------------------------------------------ */

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-zinc-200/80 dark:bg-zinc-800 ${className}`}
    />
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold text-zinc-900 [text-wrap:balance] dark:text-zinc-50">
        {title}
      </h3>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-zinc-500 [text-wrap:pretty] dark:text-zinc-400">
        {message}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-500/10">
      <Icon
        name="alert"
        className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-red-800 dark:text-red-200">
          Terjadi kesalahan
        </p>
        <p className="mt-0.5 text-sm text-red-700 [text-wrap:pretty] dark:text-red-300">
          {message}
        </p>
      </div>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry} className="shrink-0">
          Coba lagi
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Progress bar                                                        */
/* ------------------------------------------------------------------ */

export function ProgressBar({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
          <span className="font-medium text-zinc-900 tabular-nums dark:text-zinc-50">
            {pct}%
          </span>
        </div>
      )}
      <div
        className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-blue-600 transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toast — umpan balik singkat setelah aksi                            */
/* ------------------------------------------------------------------ */

interface ToastItem {
  id: number;
  message: string;
  tone: "success" | "error";
}

const ToastContext = createContext<(message: string, tone?: "success" | "error") => void>(
  () => {},
);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback(
    (message: string, tone: "success" | "error" = "success") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    [],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex max-w-full items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              toast.tone === "success"
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "bg-red-600 text-white"
            }`}
          >
            <Icon
              name={toast.tone === "success" ? "check" : "alert"}
              className="h-4 w-4 shrink-0"
            />
            <span className="break-words">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
