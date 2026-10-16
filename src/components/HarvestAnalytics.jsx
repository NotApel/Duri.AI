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

      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="shadow-lg justify-center tracking-wider border border-green-500 rounded-lg p-1 bg-linear-to-r from-green-800 to-green-500 text-3xl font-black text-white">
            Harvest Analytics & Logs
          </h1>
          <p className="text-slate-900 text-sm mt-1">
            Audit historical drops, export sensor data, and analyze classification states.
          </p>
        </div>
        
        {/* EXPORT ACTION UTILITIES */}
        <div className="flex gap-2">
          <button 
            onClick={exportToCSV}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-md cursor-pointer"
          >
            📥 Export CSV Spreadsheet
          </button>
          <button 
            onClick={exportToPDF}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-md cursor-pointer"
          >
            📄 Generate PDF Summary
          </button>
        </div>
      </header>

      {/* HISTORICAL LOG TRACKING TABLE */}
      <div className="bg-linear-to-br from-green-900 to-green-950 border border-slate-700/60 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm text-slate-300">
            <thead className="bg-linear-to-r from-green-800 to-green-900 text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-700/50">
              <tr>
                <th className="p-4">Record ID</th>
                <th className="p-4">Timestamp</th>
                <th className="p-4">Sensor Node</th>
                <th className="p-4">AI / User Classification</th>
                <th className="p-4 text-right">Est. Weight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-700/30 transition">
                  <td className="p-4 font-mono text-emerald-400 font-bold">{log.id}</td>
                  <td className="p-4 text-slate-400">{log.timestamp}</td>
                  <td className="p-4 font-semibold">{log.node}</td>
                  <td className="p-4">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                      log.status.includes('Correct') 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="p-4 text-right font-medium text-white">{log.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4">
          <HarvestChart data={logs} />
        </div>
      </div>

    </div>
  );
}
