import Link from "next/link";

export function StepFooterNav({
  backHref,
  backLabel,
  nextHref,
  nextLabel,
}: {
  backHref: string;
  backLabel: string;
  nextHref: string;
  nextLabel: string;
}) {
  return (
    <div className="mt-space-xl pt-space-lg flex flex-col-reverse sm:flex-row items-center justify-between gap-space-md">
      <Link
        href={backHref}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-space-xs px-space-lg py-2.5 rounded-lg bg-surface-card hover:bg-surface-slate text-on-surface font-label-md text-label-md shadow-sm transition-colors"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        <span>{backLabel}</span>
      </Link>
      <Link
        href={nextHref}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-space-xs px-space-xl py-3 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-lg text-label-lg shadow-md transition-all"
      >
        <span>{nextLabel}</span>
        <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
      </Link>
    </div>
  );
}
