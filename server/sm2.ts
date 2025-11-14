/**
 * SM-2 Spaced Repetition Algorithm Implementation
 * Based on the SuperMemo 2 algorithm
 * 
 * Quality ratings:
 * 5 - perfect response
 * 4 - correct response after a hesitation
 * 3 - correct response recalled with serious difficulty
 * 2 - incorrect response; where the correct one seemed easy to recall
 * 1 - incorrect response; the correct one remembered
 * 0 - complete blackout
 */

export interface SM2Result {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewDate: Date;
}

/**
 * Calculate next review parameters using SM-2 algorithm
 * @param quality - Response quality (0-5)
 * @param previousEaseFactor - Current ease factor
 * @param previousInterval - Current interval in days
 * @param previousRepetitions - Current repetition count
 * @returns Updated SM-2 parameters
 */
export function calculateSM2(
  quality: number,
  previousEaseFactor: number,
  previousInterval: number,
  previousRepetitions: number
): SM2Result {
  let easeFactor = previousEaseFactor;
  let interval = previousInterval;
  let repetitions = previousRepetitions;

  // Calculate new ease factor
  // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  // Ensure ease factor doesn't go below 1.3
  if (easeFactor < 1.3) {
    easeFactor = 1.3;
  }

  // If quality < 3, reset repetitions and interval
  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    // Increment repetitions
    repetitions += 1;

    // Calculate new interval based on repetition number
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 6;
    } else {
      interval = Math.round(previousInterval * easeFactor);
    }
  }

  // Calculate next review date
  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + interval);

  return {
    easeFactor,
    interval,
    repetitions,
    nextReviewDate,
  };
}

/**
 * Convert binary correctness to SM-2 quality rating
 * @param isCorrect - Whether the answer was correct
 * @param wasHesitant - Optional: whether there was hesitation (not implemented in UI yet)
 * @returns Quality rating (0-5)
 */
export function correctnessToQuality(isCorrect: boolean, wasHesitant: boolean = false): number {
  if (isCorrect) {
    return wasHesitant ? 4 : 5;
  } else {
    return 2; // Incorrect but seemed easy to recall
  }
}
