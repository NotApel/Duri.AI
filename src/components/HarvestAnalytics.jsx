import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// Mock dataset tracking fruit drop validations within the 2m² patch
const HARVEST_LOGS = [
  { id: 'TRK-901', timestamp: '2026-06-17 08:32', node: 'NODE-03', status: 'Correct Fall', weight: '1.8kg' },
  { id: 'TRK-902', timestamp: '2026-06-17 11:15', node: 'NODE-03', status: 'Correct Fall', weight: '2.1kg' },
  { id: 'TRK-903', timestamp: '2026-06-16 14:02', node: 'NODE-01', status: 'Correct Fall', weight: '1.5kg' },
  { id: 'TRK-904', timestamp: '2026-06-15 03:40', node: 'NODE-02', status: 'False Alarm: Animal', weight: '0.0kg' },
  { id: 'TRK-905', timestamp: '2026-06-14 19:11', node: 'NODE-01', status: 'Correct Fall', weight: '2.4kg' },
];

export default function HarvestAnalytics() {
  const [logs] = useState(HARVEST_LOGS);

  // 1. EXPORT TO SPREADSHEET FUNCTION (CSV)
  const exportToCSV = () => {
    const headers = ['Record ID,Timestamp,Sensor Node,Classification,Estimated Weight\n'];
    const rows = logs.map(log => 
      `${log.id},${log.timestamp},${log.node},${log.status},${log.weight}`
    );
    
    const csvContent = "data:text/csv;charset=utf-8," + headers.concat(rows).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `DuriAI_Harvest_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 2. EXPORT TO DOCUMENT FUNCTION (PDF)
  const exportToPDF = () => {
    const doc = new jsPDF();
    
    // Document Branding Headers
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("DURI.AI HARVEST INTELLIGENCE REPORT", 14, 20);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 27);
    doc.text("Target Grid Center: 2.931086, 101.798198 (2m² Plot Area)", 14, 32);
    
    // Mapping logs into data table format
    const tableBody = logs.map(log => [log.id, log.timestamp, log.node, log.status, log.weight]);
    
    doc.autoTable({
      startY: 40,
      head: [['Record ID', 'Timestamp', 'Sensor Node', 'Classification', 'Est. Weight']],
      body: tableBody,
      headStyles: { fillColor: [6, 95, 70] }, // Dark Emerald matching farm brand
      theme: 'striped'
    });

    doc.save(`DuriAI_Harvest_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="shadow-lg bold justify-center tracking-wider border border-green-500 rounded-lg p-1 bg-gradient-to-r from-green-800 to-green-500 text-3xl font-black tracking-tight text-white"
          >
            Harvest Analytics & Logs
          </h1>
          <p className="text-slate-900 text-sm mt-1"
          >
            Audit historical drops, export sensor data, and analyze classification states.
          </p>
        </div>
        
        {/* EXPORT ACTION UTILITIES */}
        <div className="flex gap-2">
          <button 
            onClick={exportToCSV}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-md"
          >
            📥 Export CSV Spreadsheet
          </button>
          <button 
            onClick={exportToPDF}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-md"
          >
            📄 Generate PDF Summary
          </button>
        </div>
      </header>

      {/* HISTORICAL LOG TRACKING TABLE */}
      <div className="bg-gradient-to-br from-green-900 to-green-950 border border-slate-700/60 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm text-slate-300">
            <thead className="bg-gradient-to-r from-green-800 to-green-900 text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-700/50">
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
      </div>
    </div>
  );
}