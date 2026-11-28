export function normalizeTraining(data) {
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("The server returned invalid training statistics.");
  const count = (value) =>
    Number.isInteger(value) && value >= 0 ? value : null;
  // Verified evaluations are preferred: each one has provenance (which
  // model version, when, how many samples) that currentAccuracy lacks.
  const history = Array.isArray(data.evaluations)
    ? data.evaluations
        .filter(
          (item) =>
            typeof item.model_version === "string" &&
            item.model_version &&
            Number.isFinite(Date.parse(item.evaluated_at)) &&
            Number.isInteger(item.sample_count) &&
            item.sample_count > 0 &&
            typeof item.accuracy === "number" &&
            item.accuracy >= 0 &&
            item.accuracy <= 100,
        )
        .sort((a, b) => Date.parse(a.evaluated_at) - Date.parse(b.evaluated_at))
    : [];
  // Fallback: the training script's own validation accuracy, reported
  // through ai_status as e.g. "81.81%". Not independently verified, so it
  // is kept separate from the verified evaluation history above.
  const selfReported = (() => {
    const match = /^(\d+(?:\.\d+)?)%$/.exec(
      typeof data.currentAccuracy === "string" ? data.currentAccuracy.trim() : "",
    );
    if (!match) return null;
    const value = Number(match[1]);
    return value >= 0 && value <= 100 ? value : null;
  })();
  const verifiedAccuracy = history.length ? history.at(-1).accuracy : null;
  return {
    totalCorrections: count(data.totalCorrections),
    pendingTraining: count(data.pendingTraining),
    farmerPoints: count(data.farmerPoints),
    evaluations: history,
    accuracy: verifiedAccuracy ?? selfReported,
    accuracyVerified: verifiedAccuracy !== null,
    lastEvaluated: history.length ? history.at(-1).evaluated_at : null,
  };
}