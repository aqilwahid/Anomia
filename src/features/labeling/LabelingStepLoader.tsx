"use client";

import dynamic from "next/dynamic";

// Labeling can mark missed faces / rescan photos, which pulls in
// @vladmandic/human. That package resolves to a Node/tfjs-node build under
// Next's server target, so the whole step is rendered client-only.
const LabelingStep = dynamic(() => import("./LabelingStep").then((m) => m.LabelingStep), {
  ssr: false,
  loading: () => (
    <div className="w-full max-w-[1400px] mx-auto px-layout-gutter-mobile md:px-layout-gutter-desktop py-space-md">
      <div className="h-[420px] rounded-2xl bg-surface-card border border-border-subtle animate-pulse" />
    </div>
  ),
});

export function LabelingStepLoader({ classGroupId }: { classGroupId: string }) {
  return <LabelingStep classGroupId={classGroupId} />;
}
