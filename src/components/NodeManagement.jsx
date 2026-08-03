import React, { useState } from 'react';

// Live mock dataset matching your Raspberry Pi Zero 2 W infrastructure
const INITIAL_HARDWARE = [
  { id: 'NODE-01', location: 'Alpha West Corner', battery: 84, status: 'Connected', version: 'v1.0.4', lastPing: '2 mins ago' },
  { id: 'NODE-02', location: 'Alpha East Ridge', battery: 92, status: 'Connected', version: 'v1.0.4', lastPing: '5 mins ago' },
  { id: 'NODE-03', location: 'Beta Boundary Tree', battery: 11, status: 'Low Battery', version: 'v1.0.2', lastPing: '1 min ago' },
];

export default function NodeManagement() {
  const [nodes, setNodes] = useState(INITIAL_HARDWARE);
  const [updatingId, setUpdatingId] = useState(null);

  // Simulating an Over-The-Air (OTA) firmware/LiteRT model distribution flight
  const triggerOTAUpdate = (id) => {
    setUpdatingId(id);
    setTimeout(() => {
      setNodes(prev => prev.map(node => 
        node.id === id ? { ...node, version: 'v1.1.0 (Latest)', status: 'Connected' } : node
      ));
      setUpdatingId(null);
    }, 3000);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-white">System & Node Management</h1>
        <p className="text-slate-400 text-sm mt-1">
          Monitor active Raspberry Pi microcontrollers, track battery levels, and push edge model updates.
        </p>
      </header>

      {/* CORE INFRASTRUCTURE MATRIX LIST */}
      <div className="bg-slate-800 border border-slate-700/60 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 bg-slate-900 border-b border-slate-700/40 flex justify-between items-center">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Edge Node Diagnostics</h3>
          <span className="bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs px-2.5 py-1 rounded-full font-medium">
            3 Active Microcontrollers
          </span>
        </div>

        <div className="divide-y divide-slate-700/40">
          {nodes.map((node) => (
            <div key={node.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-700/20 transition">
              
              {/* Node Basic Vitals */}
              <div className="flex items-start gap-3.5">
                <span className="text-3xl p-2.5 bg-slate-950 rounded-xl border border-slate-800">📡</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-white font-bold text-sm">{node.id}</h4>
                    <span className="text-xs text-slate-500">•</span>
                    <p className="text-xs text-slate-400 font-medium">{node.location}</p>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 mt-1.5">
                    <span className="flex items-center gap-1">
                      🔋 <strong className={`${node.battery < 20 ? 'text-rose-400 font-black' : 'text-slate-200'}`}>{node.battery}%</strong> Capacity
                    </span>
                    <span>⏱️ Ping: {node.lastPing}</span>
                    <span>🤖 Model AI: <code className="bg-slate-950 px-1.5 py-0.5 rounded text-emerald-400 border border-slate-800">{node.version}</code></span>
                  </div>
                </div>
              </div>

              {/* Status Badge & OTA Framework Controls */}
              <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-0 pt-3 sm:pt-0 border-slate-700/30">
                <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                  node.status === 'Connected' 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse'
                }`}>
                  {node.status}
                </span>

                <button
                  disabled={updatingId !== null || node.version.includes('Latest')}
                  onClick={() => triggerOTAUpdate(node.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-md ${
                    node.version.includes('Latest')
                      ? 'bg-slate-950 border border-slate-800 text-slate-600 cursor-not-allowed'
                      : updatingId === node.id
                      ? 'bg-amber-600 text-slate-950 cursor-wait animate-pulse'
                      : 'bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-200'
                  }`}
                >
                  {updatingId === node.id ? '⚡ Pushing Weights...' : node.version.includes('Latest') ? 'Up to Date' : 'Update Edge Model'}
                </button>
              </div>

            </div>
          ))}
        </div>
      </div>
    </div>
  );
}