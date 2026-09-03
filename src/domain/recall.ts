export interface RecallState {
  participantId: string;
  correctCount: number;
  wrongCount: number;
  lastReviewedAt: string | null;
  dueAt: string | null;
}
