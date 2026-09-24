import type { FacePipeline } from "./pipeline";

export const MODEL_NAME = "human-faceres";
export const MODEL_VERSION = "3.3.6";

let instance: Promise<FacePipeline> | null = null;

/**
 * One shared pipeline per tab, loaded lazily on first use — the models
 * (~9 MB) are only fetched when the instructor actually uploads or marks a face.
 * Import this only from client components rendered with `ssr: false`.
 */
export function getFacePipeline(): Promise<FacePipeline> {
  if (!instance) {
    instance = (async () => {
      const { HumanFacePipeline } = await import("./humanPipeline");
      const pipeline = new HumanFacePipeline();
      await pipeline.init();
      return pipeline;
    })().catch((err) => {
      instance = null;
      throw err;
    });
  }
  return instance;
}
