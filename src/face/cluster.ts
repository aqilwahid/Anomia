import { cosineSimilarity } from "./pipeline";

/**
 * Similarity thresholds for Human's "faceres" descriptor (1024-d, L2
 * normalised, cosine). Measured on Human's sample photos: the same person
 * across photos scored 0.47–0.85, different people averaged 0.40 but could
 * reach ~0.69 — so the descriptor alone is NOT reliable enough to decide.
 * Clustering stays conservative and the instructor always confirms.
 * Recalibrate once real training photos are available (docs/discovery.md, Fase 0).
 */
export const CLUSTER_THRESHOLD = 0.62;
export const SUGGEST_STRONG = 0.66;
export const SUGGEST_MIN = 0.5;

export interface ClusterItem {
  id: string;
  /** faces from the same photo can never be the same person */
  photoId: string;
  vector: number[] | null;
}

/**
 * Average-linkage agglomerative clustering with a cannot-link constraint:
 * two faces from the same photo are never merged. Faces without a
 * descriptor stay singletons. Returns a cluster index per item.
 *
 * Average linkage (instead of the previous single-linkage union-find) stops
 * a chain of look-alikes from pulling different people into one cluster.
 * O(n³) in the worst case, fine for the few hundred faces of a class.
 */
export function clusterFaces(items: ClusterItem[], threshold = CLUSTER_THRESHOLD): number[] {
  const n = items.length;
  const sim: Float32Array[] = Array.from({ length: n }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = items[i].vector;
      const b = items[j].vector;
      const s = a && b ? cosineSimilarity(a, b) : -1;
      sim[i][j] = s;
      sim[j][i] = s;
    }
  }

  let clusters: number[][] = items.map((_, i) => [i]);
  const photos: Set<string>[] = items.map((it) => new Set([it.photoId]));

  for (;;) {
    let bestA = -1;
    let bestB = -1;
    let best = threshold;
    for (let a = 0; a < clusters.length; a++) {
      if (!items[clusters[a][0]].vector) continue;
      for (let b = a + 1; b < clusters.length; b++) {
        if (!items[clusters[b][0]].vector) continue;
        let conflict = false;
        for (const p of photos[b]) {
          if (photos[a].has(p)) {
            conflict = true;
            break;
          }
        }
        if (conflict) continue;
        let total = 0;
        for (const i of clusters[a]) for (const j of clusters[b]) total += sim[i][j];
        const avg = total / (clusters[a].length * clusters[b].length);
        if (avg >= best) {
          best = avg;
          bestA = a;
          bestB = b;
        }
      }
    }
    if (bestA < 0) break;
    clusters[bestA] = clusters[bestA].concat(clusters[bestB]);
    for (const p of photos[bestB]) photos[bestA].add(p);
    clusters = clusters.filter((_, i) => i !== bestB);
    photos.splice(bestB, 1);
  }

  const result = new Array<number>(n).fill(0);
  clusters.forEach((members, c) => members.forEach((i) => (result[i] = c)));
  return result;
}

/** Mean of L2-normalised vectors, re-normalised. */
export function centroid(vectors: number[][]): number[] | null {
  if (vectors.length === 0) return null;
  const dim = vectors[0].length;
  const out = new Array<number>(dim).fill(0);
  for (const v of vectors) for (let i = 0; i < dim; i++) out[i] += v[i];
  const norm = Math.sqrt(out.reduce((s, v) => s + v * v, 0));
  return norm ? out.map((v) => v / norm) : out;
}
