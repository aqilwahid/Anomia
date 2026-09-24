import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

export function StepFooterNav({
  backHref,
  backLabel,
  nextHref,
  nextLabel,
  hint,
}: {
  backHref: string;
  backLabel: string;
  nextHref: string;
  nextLabel: string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="mt-space-xl pt-space-lg border-t border-border-subtle flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-space-md no-print">
      <Link
        href={backHref}
        className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-surface-card border border-border-subtle hover:bg-surface-slate text-on-surface font-label-md text-label-md transition-colors"
      >
        <ArrowLeft size={16} aria-hidden />
        <span>{backLabel}</span>
      </Link>
      {hint && <div className="text-body-sm text-on-surface-variant text-center sm:text-right sm:ml-auto">{hint}</div>}
      <Link
        href={nextHref}
        className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-lg text-label-lg shadow-sm transition-colors"
      >
        <span>{nextLabel}</span>
        <ArrowRight size={17} aria-hidden />
      </Link>
    </div>
  );
}
