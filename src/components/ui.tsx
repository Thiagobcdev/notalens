import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-xl border border-line bg-surface", className)} {...props} />;
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </header>
  );
}

const tonsBadge = {
  neutro: "bg-surface-2 text-muted",
  pos: "bg-pos-bg text-pos",
  neg: "bg-neg-bg text-neg",
  warn: "bg-warn-bg text-warn",
  brand: "bg-brand/10 text-brand",
} as const;

export function Badge({ tom = "neutro", className, ...props }: ComponentProps<"span"> & { tom?: keyof typeof tonsBadge }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", tonsBadge[tom], className)}
      {...props}
    />
  );
}

export function Button({ className, variante = "primario", ...props }: ComponentProps<"button"> & { variante?: "primario" | "secundario" }) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-60",
        variante === "primario" ? "bg-brand text-brand-fg hover:bg-brand/90" : "border border-line bg-surface hover:bg-surface-2",
        className,
      )}
      {...props}
    />
  );
}

export function Stat({ label, value, hint, tom }: { label: string; value: ReactNode; hint?: ReactNode; tom?: "pos" | "neg" }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cn("tabular mt-1 text-2xl font-semibold", tom === "pos" && "text-pos", tom === "neg" && "text-neg")}>{value}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}
