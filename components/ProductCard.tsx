import React, { useState } from 'react';
import { Material, MaterialCategory } from '../types';

interface MaterialItemProps {
  material: Material;
  isSelected: boolean;
  isLiveActive: boolean;
  theme: 'dark' | 'light';
  onToggleSelect: (id: string) => void;
  onGenerate: (id: string) => void;
  onGenerateBlueprint: (id: string) => void;
  onDownload: (imageUrl: string, filename: string) => void;
  onToggleLive: (id: string) => void;
  onAnimate: (id: string) => void;
}

const getCategoryBadgeStyle = (category: MaterialCategory, theme: 'dark' | 'light') => {
  if (theme === 'dark') {
    switch (category) {
      case 'Step': return 'bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20';
      case 'Tool': return 'bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20';
      case 'Component': 
      default: return 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20';
    }
  } else {
    switch (category) {
      case 'Step': return 'bg-purple-100 text-purple-700 ring-1 ring-purple-200';
      case 'Tool': return 'bg-orange-100 text-orange-700 ring-1 ring-orange-200';
      case 'Component': 
      default: return 'bg-blue-100 text-blue-700 ring-1 ring-blue-200';
    }
  }
};

export const MaterialCard: React.FC<MaterialItemProps> = ({ 
  material, 
  isSelected, 
  isLiveActive,
  theme,
  onToggleSelect, 
  onGenerate, 
  onGenerateBlueprint,
  onDownload,
  onToggleLive,
  onAnimate
}) => {
  const [activeView, setActiveView] = useState<'image' | 'blueprint'>('image');

  const isIdle = material.status === 'IDLE';
  const isLoading = material.status === 'LOADING';
  const isSuccess = material.status === 'SUCCESS';
  const isError = material.status === 'ERROR';

  const isBpIdle = !material.blueprintStatus || material.blueprintStatus === 'IDLE';
  const isBpLoading = material.blueprintStatus === 'LOADING';
  const isBpSuccess = material.blueprintStatus === 'SUCCESS';

  const isVideoLoading = material.videoStatus === 'LOADING';
  const isVideoSuccess = material.videoStatus === 'SUCCESS';
  const isVideoError = material.videoStatus === 'ERROR';

  const isDark = theme === 'dark';

  // Dynamic Styles
  const cardBase = isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-slate-200 shadow-sm';
  const cardHover = isDark ? 'hover:border-zinc-700 hover:bg-zinc-900' : 'hover:border-slate-300 hover:shadow-md';
  const cardSelected = isDark ? 'bg-zinc-900/80 border-indigo-500/50 ring-indigo-500/20' : 'bg-indigo-50 border-indigo-400 ring-indigo-200';
  
  const textMain = isDark ? 'text-zinc-100' : 'text-slate-900';
  const textMuted = isDark ? 'text-zinc-400' : 'text-slate-500';
  const textSubtle = isDark ? 'text-zinc-500' : 'text-slate-400';
  
  const checkboxBase = isDark ? 'bg-zinc-800 border-zinc-700 hover:border-zinc-600' : 'bg-slate-100 border-slate-300 hover:border-slate-400';
  
  const buttonBase = isDark ? 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-sm';

  const specsBox = isDark ? 'bg-zinc-950/30 border-zinc-800/50' : 'bg-slate-50 border-slate-200';
  const tagBox = isDark ? 'bg-zinc-800 text-zinc-400 border-zinc-700/50' : 'bg-slate-100 text-slate-600 border-slate-200';

  // Determine what to show in content area
  const showContent = isSuccess || isLoading || isVideoSuccess || isVideoLoading || isBpSuccess || isBpLoading;
  
  // Auto-switch view if one is ready and other isn't, or user selected
  let currentImageUrl = material.imageUrl;
  if (activeView === 'blueprint' && material.blueprintUrl) {
    currentImageUrl = material.blueprintUrl;
  } else if (activeView === 'image' && !material.imageUrl && material.blueprintUrl) {
    // Fallback if image not ready but blueprint is
    currentImageUrl = material.blueprintUrl;
  }

  return (
    <div className={`
      relative group transition-all duration-200 rounded-xl border
      ${isSelected ? `${cardSelected} ring-1` : `${cardBase} ${cardHover}`}
      ${isLiveActive ? 'ring-2 ring-rose-500/50 border-rose-500/50' : ''}
    `}>

      {/* Live Indicator Dot */}
      {isLiveActive && (
        <div className="absolute top-4 right-4 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
            </span>
        </div>
      )}

      <div 
        className="p-5 flex items-start gap-4 select-none"
      >
        {/* Checkbox */}
        <div className="pt-1" onClick={(e) => e.stopPropagation()}>
           <div 
             className={`w-5 h-5 cursor-pointer rounded border flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : `${checkboxBase} text-transparent`}`}
             onClick={() => onToggleSelect(material.id)}
           >
             <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
           </div>
        </div>

        <div className="flex-1 min-w-0" onClick={() => onToggleSelect(material.id)}>
          {/* Header Badges */}
          <div className="flex items-center gap-2 mb-2 flex-wrap text-[11px] font-medium">
            <span className={`px-2 py-0.5 rounded-md ${getCategoryBadgeStyle(material.category, theme)}`}>
              {material.category}
            </span>
            
            {material.estimatedCost && (
              <span className={`px-2 py-0.5 rounded-md border ${tagBox}`}>
                {material.estimatedCost}
              </span>
            )}
            {material.estimatedDuration && (
              <span className={`px-2 py-0.5 rounded-md border ${tagBox}`}>
                {material.estimatedDuration}
              </span>
            )}
            
            {(material.weight || material.dimensions) && (
              <span className={`px-2 py-0.5 rounded-md border font-mono hidden sm:inline-block ${tagBox}`}>
                 {material.weight && `${material.weight}`}
                 {material.weight && material.dimensions && ' • '}
                 {material.dimensions && `${material.dimensions}`}
              </span>
            )}
          </div>

          <h3 className={`font-semibold text-lg leading-tight mb-1 truncate ${textMain}`}>
            {material.name}
          </h3>
          <p className={`text-sm leading-relaxed mb-3 font-light ${textMuted}`}>
            {material.description}
          </p>

          {material.specifications && (
            <div className={`mt-3 flex items-start gap-2 text-xs font-mono p-2.5 rounded border ${specsBox} ${textSubtle}`}>
               <svg className="w-4 h-4 opacity-70 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
               <span className="break-words">{material.specifications}</span>
            </div>
          )}
        </div>

        {/* Actions Column */}
        <div className="flex flex-col gap-2 pt-1">
          {/* Generate Button */}
          {isIdle && (
            <button 
              onClick={(e) => { e.stopPropagation(); onGenerate(material.id); }}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:text-indigo-500 ${buttonBase}`}
              title="Generate Visualization"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </button>
          )}
          {isLoading && (
            <div className="w-8 h-8 flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-400 border-t-indigo-500"></div>
            </div>
          )}
          {isError && (
            <button 
              onClick={(e) => { e.stopPropagation(); onGenerate(material.id); }}
              className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center text-[10px] font-bold"
            >
              RTY
            </button>
          )}

          {/* Blueprint Button */}
          {isBpIdle && (
            <button
              onClick={(e) => { e.stopPropagation(); onGenerateBlueprint(material.id); }}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:text-cyan-500 ${buttonBase}`}
              title="Generate Blueprint"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </button>
          )}
          {isBpLoading && (
            <div className="w-8 h-8 flex items-center justify-center">
               <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-400 border-t-cyan-500"></div>
            </div>
          )}

          {/* Animate / Video Button */}
          {(isSuccess && !isVideoLoading && !isVideoSuccess) && (
             <button
                onClick={(e) => { e.stopPropagation(); onAnimate(material.id); }}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:text-purple-500 ${buttonBase}`}
                title="Generate Video (Veo)"
             >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
             </button>
          )}
          {isVideoLoading && (
            <div className="w-8 h-8 flex items-center justify-center" title="Processing Video...">
               <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-400 border-t-purple-500"></div>
            </div>
          )}
           {isVideoError && (
            <button 
              onClick={(e) => { e.stopPropagation(); onAnimate(material.id); }}
              className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </button>
          )}

          {/* Mic Button */}
          <button 
            onClick={(e) => { e.stopPropagation(); onToggleLive(material.id); }}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all border ${isLiveActive ? 'bg-rose-500/10 border-rose-500/50 text-rose-500' : isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}
          >
             {isLiveActive ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
             ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
             )}
          </button>
        </div>
      </div>

      {/* Generated Content Area */}
      {showContent && (
        <div className={`relative min-h-[120px] rounded-b-xl overflow-hidden border-t ${isDark ? 'bg-zinc-950/30 border-zinc-800' : 'bg-slate-50 border-slate-200'}`}>
          
          {/* Tabs for Image vs Blueprint */}
          {(material.imageUrl && material.blueprintUrl) && !isVideoSuccess && !isVideoLoading && (
             <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex bg-black/50 backdrop-blur rounded-full p-1 border border-white/10">
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveView('image'); }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeView === 'image' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  Render
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveView('blueprint'); }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeView === 'blueprint' ? 'bg-cyan-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  Blueprint
                </button>
             </div>
          )}

          {/* Veo Loading Progress */}
          {isVideoLoading && !isVideoSuccess && (
             <div className={`absolute inset-0 z-20 flex flex-col items-center justify-center backdrop-blur-sm p-6 ${isDark ? 'bg-zinc-900/90' : 'bg-white/90'}`}>
                <div className="w-full max-w-xs space-y-3">
                   <div className="flex justify-between items-center text-xs font-medium text-purple-500">
                      <span>Generating Video</span>
                      <span>Veo 3.1</span>
                   </div>
                   <div className={`w-full rounded-full h-1.5 overflow-hidden ${isDark ? 'bg-zinc-800' : 'bg-slate-200'}`}>
                      <div className="bg-purple-500 h-1.5 rounded-full w-1/3 animate-[loading_1.5s_ease-in-out_infinite]"></div>
                   </div>
                </div>
             </div>
          )}
          
          {/* Image Loading (Normal or Blueprint) */}
          {(isLoading || isBpLoading) && (
            <div className={`absolute inset-0 flex items-center justify-center backdrop-blur-sm ${isDark ? 'bg-zinc-900/50' : 'bg-white/50'}`}>
                <div className={`flex items-center gap-3 px-4 py-2 rounded-full border shadow-xl ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'}`}>
                   <span className={`w-2 h-2 rounded-full animate-pulse ${isBpLoading ? 'bg-cyan-500' : 'bg-indigo-500'}`}></span>
                   <span className={`text-xs font-medium ${textMuted}`}>{isBpLoading ? 'Drafting Blueprint...' : 'Rendering...'}</span>
                </div>
            </div>
          )}
          
          {/* Video Player */}
          {isVideoSuccess && material.videoUrl && (
             <div className="relative group/video bg-black w-full aspect-video flex items-center justify-center">
                <video 
                   src={material.videoUrl} 
                   controls 
                   autoPlay 
                   loop 
                   className="w-full h-full object-contain"
                />
                 <div className="absolute top-3 right-3 pointer-events-none">
                    <span className="bg-black/60 backdrop-blur text-white text-[10px] font-bold px-2 py-1 rounded-md border border-white/10">
                        Veo
                    </span>
                 </div>
             </div>
          )}

          {/* Image Display */}
          {currentImageUrl && !isVideoSuccess && !isVideoLoading && (
            <div className="relative group/image">
              <img 
                src={currentImageUrl} 
                alt={material.name} 
                className={`w-full h-auto max-h-[400px] object-contain mx-auto ${isDark ? 'bg-zinc-950/50' : 'bg-slate-50'}`}
              />
              
              <div className="absolute top-3 right-3 opacity-0 group-hover/image:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload(currentImageUrl!, material.name + (activeView === 'blueprint' ? '_blueprint' : ''));
                  }}
                  className={`px-3 py-1.5 rounded-md border text-xs font-medium shadow-lg backdrop-blur-sm ${isDark ? 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 border-zinc-700' : 'bg-white/90 hover:bg-slate-50 text-slate-700 border-slate-200'}`}
                >
                  Download {activeView === 'blueprint' ? 'BP' : ''}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};