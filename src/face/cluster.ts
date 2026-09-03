import { cosineSimilarity } from "./pipeline";

/**
 * Greedy single-linkage clustering: any two faces with similarity above
 * the threshold end up in the same cluster (via union-find), so a chain
 * of near-duplicates can pull in a borderline match. Deliberately
 * conservative is safer than deliberately clever here — the instructor
 * always reviews and can split a wrongly-merged cluster.
 *
 * Threshold is NOT calibrated against real photos yet, and Human's
 * "faceres" embedding has a different similarity distribution than
 * ArcFace — recalibrate once real training photos are available
 * (see docs/discovery.md, Fase 0).
 */
export function clusterBySimilarity(embeddings: number[][], threshold = 0.6): number[] {
  const n = embeddings.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }

  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (cosineSimilarity(embeddings[i], embeddings[j]) >= threshold) {
        union(i, j);
      }
    }
  }

  const idToIndex = new Map<number, number>();
  return parent.map((_, i) => {
    const root = find(i);
    if (!idToIndex.has(root)) idToIndex.set(root, idToIndex.size);
    return idToIndex.get(root)!;
  });
}
