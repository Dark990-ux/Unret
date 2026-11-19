/** Initial, explainable matching weights (PRD §20). Calibrate with real data. */
export const MATCH_WEIGHTS = {
  serviceRelevance: 0.3,
  location: 0.25,
  availability: 0.2,
  reliability: 0.15,
  rating: 0.1,
} as const;

/** Number of professionals in the first distribution wave, and expansion size. */
export const MATCH_INITIAL_WAVE = 10;
export const MATCH_EXPANSION_WAVE = 10;
/** Expand distribution if fewer than this many offers after the expansion delay. */
export const MATCH_MIN_OFFERS = 2;
export const MATCH_EXPANSION_DELAY_HOURS = 12;
