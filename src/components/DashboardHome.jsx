// src/components/DashboardHome.jsx
import React, { useState, useEffect } from "react";
import HarvestChart from "./HarvestChart";

export default function DashboardHome() {
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State for real data from database
  const [stats, setStats] = useState({
    totalDrops: 0,
    networkVitality: { online: 0, total: 0 },
    trackedPerimeter: 0,
  });
  const [sectors, setSectors] = useState([]);

  // Fetch data from database
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Fetch detections (for drops count)
        const detectionsRes = await fetch(
          "http://localhost:3000/api/detections",
        );
        const detections = await detectionsRes.json();

        // 2. Fetch stats
        const statsRes = await fetch(
          "http://localhost:3000/api/analytics/stats",
        );
        const statsData = await statsRes.json();

        // 3. Fetch sensor nodes
        const nodesRes = await fetch("http://localhost:3000/api/plots/1/nodes");
        const nodes = await nodesRes.json();

        // Calculate metrics from real data
        const totalDrops = detections.length || 0;
        const onlineNodes = nodes.filter((n) => n.status === "ONLINE").length;
        const totalNodes = nodes.length || 3;

        // Build sectors from nodes data
        const sectorData = nodes.map((node, index) => {
          // Count detections per node (if detection table has node_id)
          const nodeDetections = detections.filter(
            (d) => d.node_id === node.node_id || d.node_name === node.node_name,
          );
          return {
            name: node.node_name || `Node ${String.fromCharCode(65 + index)}`,
            nodes:
              node.node_name || `NODE-${String(index + 1).padStart(2, "0")}`,
            health: node.status === "ONLINE" ? "Optimal" : "Low Battery Alert",
            drops: nodeDetections.length || 0,
            battery: node.battery_level || 0,
            status: node.status || "OFFLINE",
          };
        });

        // If no nodes in database, use default sectors with 0 values
        const finalSectors =
          sectorData.length > 0
            ? sectorData
            : [
                {
                  name: "Sector Alpha (GMI Plot)",
                  nodes: "NODE-01, NODE-02",
                  health: "Optimal",
                  drops: 0,
                  battery: 87,
                  status: "ONLINE",
                },
                {
                  name: "Sector Beta (Boundary)",
                  nodes: "NODE-03",
                  health: "Low Battery Alert",
                  drops: 0,
                  battery: 12,
                  status: "OFFLINE",
                },
                {
                  name: "Sector Gamma (Nursery)",
                  nodes: "Unassigned",
                  health: "Standby",
                  drops: 0,
                  battery: 0,
                  status: "OFFLINE",
                },
              ];

        setStats({
          totalDrops: totalDrops,
          networkVitality: { online: onlineNodes, total: totalNodes || 3 },
          trackedPerimeter: Math.round((totalNodes || 3) * 0.67 * 100) / 100,
        });
        setSectors(finalSectors);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
        setError("Failed to load data. Please check your backend.");
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Dynamic search bar filtering
  const filteredSectors = sectors.filter(
    (sector) =>
      sector.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sector.nodes.toLowerCase().includes(searchQuery.toLowerCase()),
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl border bg-linear-to-r from-green-700 to-green-500 backdrop-blur-sm shadow-md">
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
            placeholder="Search sectors or nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-50 text-slate-950 text-xs rounded-xl pl-10 pr-4 py-3 border border-slate-800 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SECTION 2: SUMMARY OF ALL SECTIONS */}
        <div className="lg:col-span-2 space-y-5">
          <h3 className="shadow-md text-2xl bg-linear-to-r from-green-700 to-green-500 rounded-lg p-1 font-bold text-neutral-50 uppercase tracking-widest text-center">
            Orchard Infrastructure Summary
          </h3>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="shadow-md bg-yellow-50 border border-slate-700/50 p-5 rounded-2xl">
              <span className="text-xl">🍈</span>
              <h4 className="text-xs text-slate-900 mt-2 font-medium">
                Total Area Yield
              </h4>
              <p className="text-2xl font-black text-emerald-400 mt-0.5">
                {stats.totalDrops} Drops
              </p>
            </div>
            <div className="shadow-md bg-yellow-50 border border-slate-700/50 p-5 rounded-2xl">
              <span className="text-xl">🔋</span>
              <h4 className="text-xs text-slate-900 mt-2 font-medium">
                Network Vitality
              </h4>
              <p className="text-2xl font-black text-blue-400 mt-0.5">
                {stats.networkVitality.online} / {stats.networkVitality.total}{" "}
                Stable
              </p>
            </div>
            <div className="shadow-md bg-yellow-50 border border-slate-700/50 p-5 rounded-2xl">
              <span className="text-xl">📐</span>
              <h4 className="text-xs text-slate-900 mt-2 font-medium">
                Tracked Perimeter
              </h4>
              <p className="text-2xl font-black text-amber-400 mt-0.5">
                {stats.trackedPerimeter} m² Matrix
              </p>
            </div>
          </div>

          {/* Render Filtered Search Results */}
          <div className="bg-yellow-50 border border-slate-700/50 rounded-2xl p-5 space-y-3 shadow-lg">
            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Sector Overview Logs
            </h4>
            <div className="space-y-2">
              {filteredSectors.length > 0 ? (
                filteredSectors.map((sector, idx) => (
                  <div
                    key={idx}
                    className="bg-linear-to-r from-green-700 to-green-800 p-3 rounded-xl flex justify-between items-center text-xs border border-slate-900"
                  >
                    <div>
                      <p className="font-bold text-slate-100">{sector.name}</p>
                      <p className="text-slate-300 mt-0.5">
                        Hardware: {sector.nodes}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${sector.health === "Optimal" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}
                      >
                        {sector.health}
                      </span>
                      <p className="text-slate-400 font-semibold mt-1">
                        {sector.drops} verified
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500 py-2 text-center">
                  No structural farm entries match your search criteria.
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
