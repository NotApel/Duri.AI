import React, { useState } from 'react';
import { Save, CheckCircle } from 'lucide-react';

export default function Settings() {
  const [saved, setSaved] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-white">System & Profile Settings</h1>
        <p className="text-slate-400 text-sm mt-1">
          Manage administrator account information and local runtime parameters.
        </p>
      </header>

      {saved && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          Settings successfully saved!
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* ADMINISTRATOR PROFILE CARD */}
        <div className="lg:col-span-1">
          <div className="bg-yellow-50 border border-slate-700/60 p-5 rounded-2xl shadow-xl flex items-center gap-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl"></div>
            <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center text-xl font-black text-white shadow-md shrink-0">
              AB
            </div>
            <div>
              <h3 className="text-lg font-black text-amber-900">Admin</h3>
              <p className="text-xs text-slate-700">Orchard Administrator</p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-[10px] text-emerald-400 font-bold tracking-wider uppercase">Level: Root Supervisor</span>
              </div>
            </div>
          </div>
        </div>

        {/* LOCAL APP CONFIGURATION SETTINGS */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSave} className="bg-gradient-to-bl from-green-500 to-green-700 border border-slate-700/60 p-6 rounded-2xl shadow-xl space-y-5">
            <h3 className="text-lg font-bold text-slate-100 uppercase tracking-widest">System Parameters</h3>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs">
                <div>
                  <p className="font-bold text-slate-200">Push Alert Flags</p>
                  <p className="text-[10px] text-slate-300">Receive immediate audio sound notifications</p>
                </div>
                <input type="checkbox" defaultChecked className="w-4 h-4 accent-emerald-300 rounded cursor-pointer" />
              </div>

              <div className="flex justify-between items-center text-xs border-t border-slate-700/40 pt-4">
                <div>
                  <p className="font-bold text-slate-200">Local Cache Sync</p>
                  <p className="text-[10px] text-slate-300">Keep data logs active for complete offline storage</p>
                </div>
                <input type="checkbox" defaultChecked className="w-4 h-4 accent-emerald-300 rounded cursor-pointer" />
              </div>

              <div className="flex justify-between items-center text-xs border-t border-slate-700/40 pt-4">
                <div>
                  <p className="font-bold text-slate-200">AI Sensitivity Thresh</p>
                  <p className="text-[10px] text-slate-300">Confidence interval bound before alert generation</p>
                </div>
                <select className="bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-300 text-[11px] focus:outline-none">
                  <option>&gt; 85% Confidence</option>
                  <option>&gt; 90% Confidence</option>
                  <option>&gt; 95% Confidence</option>
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-700/40 flex justify-end">
              <button 
                type="submit"
                className="bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-200 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-md transition cursor-pointer"
              >
                <Save className="w-4 h-4" /> Save Changes
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}