import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Coordinates centered around an orchard near Ipoh, Perak, Malaysia
const ORCHARD_CENTER = [2.9310862705353444, 101.79819826037814];

// Mock data representing the spatial boundaries of Plot A and Plot B
const PLOT_BOUNDARIES = {
  plotA: [
    [2.9312, 101.7981], 
    [2.9312, 101.7983], 
    [2.93099, 101.7983], 
    [2.93099, 101.7981], 
  ],
};

// Mock dataset for live edge computing sensor nodes
const INITIAL_NODES = [
  { id: 'NODE-01', name: 'Micro Node Alpha', position: [2.931092, 101.798196], status: 'active', drops: 4 },
  { id: 'NODE-02', name: 'Micro Node Beta', position: [2.931086, 101.798200], status: 'active', drops: 7 },
  { id: 'NODE-03', name: 'Micro Node Gamma', position: [2.931080, 101.798197], status: 'alert', drops: 3 },
];

export default function OrchardMap() {
  const [nodes, setNodes] = useState(INITIAL_NODES);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  // Module C: Handle AI Retraining Feedback submission loop
  const handleFeedbackSubmit = (category) => {
    // In production, this issues a network payload to your cloud backend VPS
    console.log(`Feedback submitted for ${selectedAlert.id}: Categorized as ${category}`);
    
    setFeedbackSuccess(true);
    setTimeout(() => {
      // Toggle node state back to active since feedback clears the alert status
      setNodes(prev => prev.map(n => n.id === selectedAlert.id ? { ...n, status: 'active' } : n));
      setSelectedAlert(null);
      setFeedbackSuccess(false);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="bg-gradient-to-r from-green-400 to-green-600 text-white rounded justify-center tracking-wider border border-green-500 rounded-lg p-1 bg-gradient-to-r from-green-800 to-green-500 text-3xl font-black tracking-tight text-transparent">Real-Time Orchard Map</h1>
          <p className="text-slate-400 text-sm mt-1">Live grid positioning, multi-sensor nodes, and drop alert validations.</p>
        </div>
        <div className="flex gap-2">
          <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs px-3 py-1.5 rounded-xl font-medium">
            🌳 Plot A Tracked
          </span>
          <span className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs px-3 py-1.5 rounded-xl font-medium animate-pulse">
            ⚠️ 1 Pending Alert
          </span>
        </div>
      </header>

      {/* Main Grid Layout split into Map Canvas and Panel Systems */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEAFLET MAP CONTAINER FRAME */}
       <div className="lg:col-span-2 bg-slate-800 border border-slate-700/50 rounded-2xl h-[55vh] md:h-[60vh] overflow-hidden shadow-xl relative z-10">
          <MapContainer center={ORCHARD_CENTER} zoom={21} maxZoom={22} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            {/* Draw Orchard Plot Boundaries */}
            <Polygon 
              positions={PLOT_BOUNDARIES.plotA} 
              pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.15, weight: 2 }}
            />

            {/* Loop and map individual Edge Node configurations */}
            {nodes.map((node) => (
              <Marker key={node.id} position={node.position}>
                <Popup>
                  <div className="p-1 font-sans text-slate-900">
                    <h4 className="font-bold text-sm text-emerald-900">{node.name}</h4>
                    <p className="text-xs text-slate-600 mt-0.5">ID: {node.id}</p>
                    <div className="mt-2 flex items-center justify-between text-xs border-t pt-2">
                      <span className="font-medium">Total Yields:</span>
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded font-bold">{node.drops}</span>
                    </div>
                    {node.status === 'alert' && (
                      <button
                        onClick={() => setSelectedAlert(node)}
                        className="mt-3 w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-1.5 px-2 rounded text-center text-xs transition block"
                      >
                        🚨 Review Drop Alert
                      </button>
                    )}
                  </div>
                </Popup>
                        </Marker>))}
          </MapContainer>
        </div>

        {/* SIDE PANELS: MANAGE PLOT & LATEST DROP TERMINAL */}
        <div className="space-y-6 flex flex-col justify-between">
          
          {/* Latest Drop Alert Panel */}
          <div className="bg-slate-800 border border-slate-700/60 p-5 rounded-2xl shadow-lg">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Live Notification Node</h3>
            
            {nodes.some(n => n.status === 'alert') ? (
              nodes.filter(n => n.status === 'alert').map(alertNode => (
                <div key={alertNode.id} className="border border-amber-500/30 bg-amber-500/5 p-4 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 uppercase animate-pulse">Critical Fall</span>
                    <span className="text-xs text-slate-400">Just Now</span>
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-sm">{alertNode.name}</h4>
                    <p className="text-xs text-slate-400 mt-0.5">Vibration & Camera Multi-Sensor Verified</p>
                  </div>
                  
                  {/* Image Placeholder representing Raspberry Pi Camera Inference Snapshot */}
                  <div className="bg-slate-950 rounded-lg h-24 flex items-center justify-center text-slate-600 font-medium text-xs border border-slate-800">
                    📸 [AI Camera Frame Preview]
                  </div>

                  <button 
                    onClick={() => setSelectedAlert(alertNode)}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs py-2.5 rounded-xl transition shadow-md"
                  >
                    Launch Validation Review
                  </button>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 py-4 text-center">Monitoring network. No unresolved sensor impacts reported.</p>
            )}
          </div>

          {/* Manage Plot Info Panel */}
          <div className="bg-slate-800 border border-slate-700/60 p-5 rounded-2xl shadow-lg">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Manage Plot Metadata</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">
              Configure geolocation coordinates, register new LiteRT microcontrollers, or modify physical bounds.
            </p>
            <button className="w-full bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs py-2.5 rounded-xl font-medium transition">
              ➕ Append New Sensor Node
            </button>
          </div>

        </div>
      </div>

      {/* MODULE C MODAL INTERFACE: SELF-LEARNING RETRAINING FEEDBACK LOOP */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 max-w-md w-full p-6 rounded-2xl shadow-2xl space-y-4">
            <div>
              <h3 className="text-lg font-black text-white">AI Fall Validation Review</h3>
              <p className="text-xs text-slate-400 mt-1">
                Provide classification adjustments for <strong>{selectedAlert.id}</strong> to optimize the local edge logic model.
              </p>
            </div>

            {feedbackSuccess ? (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-xl text-xs text-center font-bold animate-pulse">
                🚀 Feedback Logged! Queued for Weekly AI Retraining Loop.
              </div>
            ) : (
              <>
                <div className="p-3 bg-slate-950 rounded-xl space-y-1 text-xs border border-slate-800">
                  <p className="text-slate-400"><strong className="text-slate-200">Sensor Coordinates:</strong> 4.5970, 101.0900</p>
                  <p className="text-slate-400"><strong className="text-slate-200">Hardware Element:</strong> Raspberry Pi Zero 2 W</p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Categorical Resolution Target</p>
                  
                  {/* Correct Action Confirmation Button */}
                  <button 
                    onClick={() => handleFeedbackSubmit('Correct Durian Fall')}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold p-3 rounded-xl transition flex justify-between items-center"
                  >
                    <span>✅ Correct Durian Harvest Drop</span>
                    <span>Confirm</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
                    <p className="col-span-2 text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">Flag False Alarm Interference</p>
                    <button onClick={() => handleFeedbackSubmit('False Alarm: Wind')} className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs p-2.5 rounded-xl transition text-left">🍃 Strong Wind</button>
                    <button onClick={() => handleFeedbackSubmit('False Alarm: Heavy Rain')} className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs p-2.5 rounded-xl transition text-left">🌧️ Heavy Rain</button>
                    <button onClick={() => handleFeedbackSubmit('False Alarm: Animal')} className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs p-2.5 rounded-xl transition text-left">🐒 Animal Activity</button>
                    <button onClick={() => handleFeedbackSubmit('False Alarm: Falling Branch')} className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs p-2.5 rounded-xl transition text-left">🌿 Falling Branch</button>
                  </div>
                </div>

                <button 
                  onClick={() => setSelectedAlert(null)}
                  className="w-full bg-slate-950 hover:bg-slate-800 border border-slate-800/60 text-slate-400 text-xs py-2.5 rounded-xl font-medium transition mt-2"
                >
                  Dismiss Window
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}