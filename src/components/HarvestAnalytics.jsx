import { useParams } from "react-router-dom";
import Detections from "./Detections";
import HarvestChart from "./HarvestChart";

export default function HarvestAnalytics() {
  const { eventId } = useParams();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-emerald-950">
          Harvest Analytics &amp; Logs
        </h1>
        <p className="mt-2 text-sm text-slate-700">
          Search event history, revisit farmer feedback, and export the filtered
          simulation records.
        </p>
      </header>
      <Detections mode="history" />
      {!eventId && (
        <section
          aria-label="Sample analytics"
          className="rounded-xl border border-emerald-900/20 bg-amber-50 p-4"
        >
          <p className="mb-3 text-sm text-amber-950">
            <strong>Sample chart:</strong> the existing weekly chart is
            illustrative only. Its values are not calculated from detection
            history or farmer feedback.
          </p>
          <HarvestChart />
        </section>
      )}
    </div>
  );
}
