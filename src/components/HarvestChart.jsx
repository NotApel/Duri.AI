import React from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';


// Mock yield data over a week
const harvestData = [
  { day: 'Mon', drops: 4, weight: 8.2 },
  { day: 'Tue', drops: 7, weight: 14.1 },
  { day: 'Wed', drops: 3, weight: 5.8 },
  { day: 'Thu', drops: 11, weight: 22.4 },
  { day: 'Fri', drops: 8, weight: 16.0 },
  { day: 'Sat', drops: 14, weight: 29.5 },
  { day: 'Sun', drops: 9, weight: 18.2 },
];

export default function HarvestChart({ setCurrentView }) {
  return (
    <div className="bg-yellow-50 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-4">
      <div className="flex justify-between items-center border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-xl font-bold text-neutral-800">Weekly Yield Trends</h3>
          <p className="text-xs text-slate-900">Durian drop count over the last 7 days</p>
        </div>
        <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full font-bold">
          +24% vs last week
        </span>
      </div>

      {/* CHART CONTAINER */}
      <div className="h-64 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={harvestData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="dropGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
              </linearGradient>
            </defs>
            
            <CartesianGrid strokeDasharray="3 3" stroke="#2e333b" opacity={0.5} />
            <XAxis dataKey="day" stroke="#2e333b" fontSize={12} tickLine={false} />
            <YAxis stroke="#2e333b" fontSize={12} tickLine={false} />
            
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#0f172a', 
                borderColor: '#334155', 
                borderRadius: '0.75rem',
                color: '#fff',
                fontSize: '12px'
              }} 
            />
            
            <Area 
              type="monotone" 
              dataKey="drops" 
              stroke="#10b981" 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#dropGradient)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
