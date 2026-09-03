export type PhotoRole = "portrait" | "group";

export interface ImageAsset {
  id: string;
  /** data URL for the local/dev store; swap for a storage key when HttpStore lands */
  dataUrl: string;
  width: number;
  height: number;
}

export interface Photo {
  id: string;
  classGroupId: string;
  imageAssetId: string;
  role: PhotoRole;
  createdAt: string;
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DetectedFaceStatus = "unlabeled" | "assigned" | "rejected" | "not_a_face";

export interface DetectedFace {
  id: string;
  photoId: string;
  classGroupId: string;
  box: FaceBox;
  /** crop rendered as a data URL so it survives even if the original photo is later deleted */
  cropDataUrl: string;
  detectorScore: number;
  qualityScore: number;
  status: DetectedFaceStatus;
  participantId: string | null;
  createdAt: string;
}

export interface FaceEmbedding {
  id: string;
  detectedFaceId: string;
  modelName: string;
  modelVersion: string;
  vector: number[];
  normalized: boolean;
}

export interface MatchSuggestion {
  id: string;
  detectedFaceId: string;
  participantId: string;
  similarity: number;
  status: "pending" | "accepted" | "rejected";
}
