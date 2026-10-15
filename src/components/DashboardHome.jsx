// src/components/DashboardHome.jsx
import { useState, useEffect } from "react";
import HarvestChart from "./HarvestChart";
import { fetchAlerts, fetchNodes, fetchStats } from "../services/api";

const plotId = import.meta.env.VITE_PLOT_ID || "1";

function buildSectors(nodes, detections) {
  const dropsByNode = new Map();
  for (const detection of detections) {
    if (detection.detection_status !== "VERIFIED") continue;
    const name = detection.node_name;
    if (name) dropsByNode.set(name, (dropsByNode.get(name) || 0) + 1);
  }

  return nodes.map((node) => ({
    id: node.node_id,
    name: node.node_name || `Node ${node.node_id}`,
    health: node.status === "ONLINE" ? "Online" : "Offline",
    drops: dropsByNode.get(node.node_name) || 0,
  }));
}

export default function DashboardHome() {
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [stats, setStats] = useState({
    totalDrops: 0,
    networkVitality: { online: 0, total: 0 },
  });
  const [sectors, setSectors] = useState([]);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [detections, nodes, summary] = await Promise.all([
          fetchAlerts(), fetchNodes(plotId), fetchStats(),
        ]);
        if (!Array.isArray(detections) || !Array.isArray(nodes) || !Number.isFinite(summary?.verified)) {
          throw new Error("Unexpected dashboard data");
        }
        if (!active) return;
        setStats({
          totalDrops: summary.verified,
          networkVitality: {
            online: nodes.filter((node) => node.status === "ONLINE").length,
            total: nodes.length,
          },
        });
        setSectors(buildSectors(nodes, detections));
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
        if (active) setError("Could not load orchard data. Check the connection and try again.");
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchData();
    return () => { active = false; };
  }, []);

  // Dynamic search bar filtering
  const filteredSectors = sectors.filter(
    (sector) =>
      sector.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(sector.id).toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-lg">Loading orchard data...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-400 text-lg">⚠️ {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* SECTION 1: GLOBAL HEADER SEARCH BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl  bg-green-500 shadow-md">
        <div>
          <h1 className="text-2xl font-black text-neutral-50">
            Welcome back, Admin!
          </h1>
          <p className="text-xs text-neutral-50 mt-0.5">
            Monitor and manage your orchard's infrastructure and harvest data.
          </p>
        </div>
        <div className="relative w-full md:w-72">
          <span className="absolute left-3.5 top-3 text-slate-500 text-sm">
            🔍
          </span>
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-50 text-slate-950 text-xs rounded-xl pl-10 pr-4 py-3 border border-slate-800 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SECTION 2: SUMMARY OF ALL SECTIONS */}
        <div className="lg:col-span-2 space-y-5">
          <h3 className="shadow-md text-2xl bg-green-500 rounded-lg p-1 font-bold text-neutral-50 uppercase tracking-widest text-center">
            Orchard Infrastructure Summary
          </h3>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="shadow-md bg-yellow-50 border border-slate-700/50 p-5 rounded-2xl">
              <span className="text-xl">🍈</span>
              <h4 className="text-xs text-slate-900 mt-2 font-medium">
                Verified Drops
              </h4>
              <p className="text-2xl font-black text-green-700 mt-0.5">
                {stats.totalDrops} Drops
              </p>
            </div>
            <div className="shadow-md bg-yellow-50 border border-slate-700/50 p-5 rounded-2xl">
              <span className="text-xl">🔋</span>
              <h4 className="text-xs text-slate-900 mt-2 font-medium">
                Network Vitality
              </h4>
              <p className="text-2xl font-black text-green-700 mt-0.5">
                {stats.networkVitality.online} / {stats.networkVitality.total} Online
              </p>
            </div>
          </div>

          {/* Render Filtered Search Results */}
          <div className="bg-yellow-50 border border-slate-700/50 rounded-2xl p-5 space-y-3 shadow-lg">
            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Node Overview
            </h4>
            <div className="space-y-2">
              {filteredSectors.length > 0 ? (
                filteredSectors.map((sector) => (
                  <div
                    key={sector.id}
                    className="bg-green-700 p-3 rounded-xl flex justify-between items-center text-xs border border-slate-900"
                  >
                    <div>
                      <p className="font-bold text-slate-100">{sector.name}</p>
                      <p className="text-slate-300 mt-0.5">
                        Hardware ID: {sector.id}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${sector.health === "Online" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}
                      >
                        {sector.health}
                      </span>
                      <p className="text-slate-400 font-semibold mt-1">
                        {sector.drops} recent verified
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500 py-2 text-center">
                  No nodes match your search, or none are registered for this plot.
                </p>
              )}
            </div>
          </div>
          {/* Harvest Analytics Chart */}
          <div className="mt-6">
            <HarvestChart />
          </div>
        </div>
      </div>
    </div>
  );
}
