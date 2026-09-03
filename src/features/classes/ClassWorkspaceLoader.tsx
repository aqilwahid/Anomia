"use client";

import dynamic from "next/dynamic";

// @vladmandic/human resolves to a Node/tfjs-node build under Next's
// server compilation target, which breaks the build even behind a
// dynamic import inside the component. Excluding the whole component
// from SSR is the fix Next.js docs recommend for browser-only ML libs.
const ClassWorkspace = dynamic(
  () => import("./ClassWorkspace").then((m) => m.ClassWorkspace),
  { ssr: false }
);

export function ClassWorkspaceLoader({ classGroupId }: { classGroupId: string }) {
  return <ClassWorkspace classGroupId={classGroupId} />;
}
