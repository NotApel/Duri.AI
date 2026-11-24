// Single source of truth for how an AI result becomes a detection status.
// Confidence is a percentage (0-100) for the predicted class.
function thresholdFrom(env = process.env) {
  const value = Number(env.CONFIDENCE_THRESHOLD ?? 90);
  if (!Number.isFinite(value) || value < 50 || value > 100)
    throw new Error("CONFIDENCE_THRESHOLD must be between 50 and 100.");
  return value;
}

const CONFIDENCE_THRESHOLD = thresholdFrom();

function classify(prediction, confidence, threshold = CONFIDENCE_THRESHOLD) {
  if (!["DURIAN", "NOT_DURIAN"].includes(prediction))
    throw new Error("Prediction must be DURIAN or NOT_DURIAN.");
  if (!Number.isFinite(confidence))
    throw new Error("Confidence must be a number.");
  // Below the threshold the AI is unsure, so the farmer decides.
  if (confidence < threshold)
    return { status: "PENDING", verifyRequired: true };
  return prediction === "DURIAN"
    ? { status: "VERIFIED", verifyRequired: false }
    : { status: "REJECTED", verifyRequired: false };
}

module.exports = { CONFIDENCE_THRESHOLD, thresholdFrom, classify };