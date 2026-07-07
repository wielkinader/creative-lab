// Single source of truth for algorithm tuning. Every constant the optimiser
// uses lives here so the whole run can be retuned from one place.

export interface Config {
  /** Longest side, in px, of the low-res image all scoring happens at. */
  scoringResolution: number;
  /** Random shapes tried per committed shape. */
  candidatesPerShape: number;
  /** Hill-climb mutations applied to the best candidate. */
  mutationsPerShape: number;
  /** Fixed shape opacity. Translucency lets shapes mix into gradients. */
  shapeAlpha: number;
  /** Shape budget bounds and default (number of shapes to place). */
  budgetMin: number;
  budgetMax: number;
  budgetDefault: number;
  /** Candidate max size as a fraction of the canvas, first shape -> last shape. */
  sizeBiasStart: number;
  sizeBiasEnd: number;
}

export const DEFAULT_CONFIG: Config = {
  scoringResolution: 256,
  candidatesPerShape: 60,
  mutationsPerShape: 100,
  shapeAlpha: 0.6,
  budgetMin: 50,
  budgetMax: 1000,
  budgetDefault: 300,
  sizeBiasStart: 0.6,
  sizeBiasEnd: 0.1,
};
