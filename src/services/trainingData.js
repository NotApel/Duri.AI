export function normalizeTraining(data) {
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("The server returned invalid training statistics.");
  const count = (value) =>
    Number.isInteger(value) && value >= 0 ? value : null;
  // Current backend fields currentAccuracy/accuracyHistory/lastRetrained are
  // hardcoded placeholders. Only evaluation records with provenance are displayed.
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
  return {
    totalCorrections: count(data.totalCorrections),
    pendingTraining: count(data.pendingTraining),
    farmerPoints: count(data.farmerPoints),
    evaluations: history,
    accuracy: history.length ? history.at(-1).accuracy : null,
    lastEvaluated: history.length ? history.at(-1).evaluated_at : null,
  };
}
