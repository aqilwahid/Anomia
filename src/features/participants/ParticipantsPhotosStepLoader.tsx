"use client";

import dynamic from "next/dynamic";

// @vladmandic/human resolves to a Node/tfjs-node build under Next's
// server compilation target, which breaks the build even behind a
// dynamic import inside the component. Excluding the whole component
// from SSR is the fix Next.js docs recommend for browser-only ML libs.
const ParticipantsPhotosStep = dynamic(
  () => import("./ParticipantsPhotosStep").then((m) => m.ParticipantsPhotosStep),
  {
    ssr: false,
    loading: () => (
      <div className="w-full max-w-[1400px] mx-auto px-layout-gutter-mobile md:px-layout-gutter-desktop py-space-lg">
        <div className="h-[420px] rounded-2xl bg-surface-card border border-border-subtle animate-pulse" />
      </div>
    ),
  }
);

export function ParticipantsPhotosStepLoader({ classGroupId }: { classGroupId: string }) {
  return <ParticipantsPhotosStep classGroupId={classGroupId} />;
}
