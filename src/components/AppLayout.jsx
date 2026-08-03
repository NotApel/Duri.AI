import React from 'react';
import { LayoutDashboard, ClipboardList, Map, Settings, LogOut, TreePine, Hexagon } from 'lucide-react';

export default function AppLayout({ children, onLogout, currentView, setCurrentView }) {
  return (
    <div className="min-h-screen bg-yellow-100 text-slate-100 flex flex-col md:flex-row font-sans">
      
      {/* DESKTOP SIDEBAR - Hidden on Mobile */}
      <aside className="hidden md:flex flex-col w-64 bg-linear-to-tl from-green-900 to-green-600 p-6 space-y-6 border-r border-emerald-800/30">
        <div className="flex items-center space-x-2">
          <span className="text-2xl">🌳</span>
          <span className="text-2xl font-bold tracking-wider text-emerald-400">DURI.AI</span>
        </div>
        <p className="text-xs text-slate-200 uppercase tracking-widest font-semibold px-2">Harvest Control</p>
        
        <nav className="flex flex-col space-y-2 flex-1">
          <button 
            onClick={() => setCurrentView('dashboard')}
            className={`text-left p-3 rounded-xl transition gap-3 flex items-center ${currentView === 'dashboard' ? 'bg-emerald-600 text-white font-medium shadow-lg' : 'hover:bg-emerald-900/40 text-slate-300'}`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </button>
          <button 
            onClick={() => setCurrentView('analytics')}
            className={`text-left p-3 rounded-xl transition gap-3 flex items-center ${currentView === 'analytics' ? 'bg-emerald-600 text-white font-medium shadow-lg' : 'hover:bg-emerald-900/40 text-slate-300'}`}
          >
            <ClipboardList className="w-4 h-4" />
            Harvest Logs
          </button>
          <button 
            onClick={() => setCurrentView('map')}
            className={`text-left p-3 rounded-xl transition gap-3 flex items-center ${currentView === 'map' ? 'bg-emerald-600 text-white font-medium shadow-lg' : 'hover:bg-emerald-900/40 text-slate-300'}`}
          >
            <Map className="w-4 h-4" />
            Orchard Map
          </button>
          <button 
            onClick={() => setCurrentView('nodes')}
            className={`text-left p-3 rounded-xl transition gap-3 flex items-center ${currentView === 'nodes' ? 'bg-emerald-600 text-white font-medium shadow-lg' : 'hover:bg-emerald-900/40 text-slate-300'}`}
          >
            <Hexagon className="w-4 h-4" />
            Node Status
          </button>
          <button onClick={() => setCurrentView('settings')} 
          className={`text-left p-3 rounded-xl transition gap-3 flex items-center ${currentView === 'settings' ? 'bg-emerald-600 text-white font-medium shadow-lg' : 'hover:bg-emerald-900/40 text-slate-300'}`}
          >
          <Settings className="w-4 h-4" />
          Settings
          </button>
        </nav>

        <button 
          onClick={onLogout}
          className="text-left p-3 rounded-xl hover:bg-rose-950/40 text-rose-400 border border-rose-900/30 font-medium transition flex items-center gap-3"
        >
          <LogOut className="w-4 h-4" />
          Log Out
        </button>
      </aside>

      {/* MOBILE TOP BAR - Hidden on Desktop */}
      <header className="md:hidden bg-green-700 px-5 py-2 flex justify-between items-center border-b border-emerald-900/30 shadow-md">
        <div className="flex items-center space-x-2">
          <span className="text-lg text-emerald-400 font-medium tracking-wide animate-pulse">Online</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xl">🌳</span>
          <span className="text-xl font-bold text-emerald-100">DURI.AI</span>
        </div>
        <div>
          <button 
            onClick={onLogout}
            className="text-rose-400 hover:text-rose-300 px-3 py-1 rounded-lg text-xs font-semibold transition "
          >
            <LogOut className="w-4 h-4 inline-block mr-1" />
            Log Out
          </button>
        </div>
      </header>

      {/* MAIN CONTENT PANELS */}
      <main className="flex-1 p-5 md:p-10 pb-24 md:pb-10 overflow-y-auto max-w-7xl mx-auto w-full">
        {children}
      </main>

      {/* MOBILE BOTTOM NAVIGATION BAR - Hidden on Desktop */}
      <nav className="max-w-300 p-5 md:hidden fixed bottom-0 left-0 right-0 bg-emerald-950/95 backdrop-blur-md border-t border-emerald-900/40 shadow-xl inline-flex justify-around py-3 z-50 rounded-2xl">
        <button 
          onClick={() => setCurrentView('dashboard')} 
          className={`hover:bg-emerald-900/40 flex flex-col items-center gap-1 text-xs transition ${currentView === 'dashboard' ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}
        >
          <LayoutDashboard className="w-5 h-5" />
            Dashboard
        </button>
        <button 
          onClick={() => setCurrentView('analytics')} 
          className={`hover:bg-emerald-900/40 flex flex-col items-center gap-1 text-xs transition ${currentView === 'analytics' ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}
        >
        <ClipboardList className="w-5 h-5" />
        <span>Logs</span>
        </button>
        <button 
          onClick={() => setCurrentView('map')} 
          className={`hover:bg-emerald-900/40 flex flex-col items-center gap-1 text-xs transition ${currentView === 'map' ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}
        >
          
          <Map className="w-5 h-5" />
          <span>Map</span>
        </button>
        <button 
          onClick={() => setCurrentView('nodes')} 
          className={`hover:bg-emerald-900/40 flex flex-col items-center gap-1 text-xs transition ${currentView === 'nodes' ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}
        >
          <Hexagon className="w-5 h-5" />
          Nodes
        </button>
      </nav>

    </div>
  );
}