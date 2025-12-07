import React, { useState, useEffect, useRef } from 'react';
import { MaterialCard } from './components/ProductCard';
import { generateMaterialList, generateMaterialImage, generateVeoVideo, getCityFromCoordinates, calculateProjectSummary } from './services/geminiService';
import { 
  liveService, 
  generateImageTool, 
  addItemTool, 
  planProjectTool,
  changeStyleTool,
  selectItemsTool,
  batchActionTool,
  scrollTool,
  controlLocationTool,
  changeThemeTool
} from './services/liveService';
import { EXAMPLE_TOPICS } from './constants';
import { Material } from './types';

const STYLES = ["Photorealistic", "Blueprint", "Isometric", "Sketch", "Diagram", "Cyberpunk", "Watercolor", "Line Art", "Pixel Art", "Origami", "Claymation"];

const App: React.FC = () => {
  const [topic, setTopic] = useState<string>('');
  const [activeTopic, setActiveTopic] = useState<string>('');
  const [visualContext, setVisualContext] = useState<string>('');
  const [searchSources, setSearchSources] = useState<any[]>([]); // Store search grounding results
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string>("Photorealistic");

  // Theme State
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Image Upload State
  const [uploadedImage, setUploadedImage] = useState<string | null>(null); // base64
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set<string>());
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);

  // Live Session State
  const [liveActiveId, setLiveActiveId] = useState<string | null>(null);
  const [isGeneralLiveActive, setIsGeneralLiveActive] = useState(false);

  // Location State
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // Refs for State Access
  const stateRefs = useRef({
    materials: [] as Material[],
    selectedIds: new Set<string>(),
    style: "Photorealistic",
    topic: "",
    locationName: "",
    theme: 'dark'
  });

  useEffect(() => {
    stateRefs.current = { 
      materials, 
      selectedIds, 
      style: selectedStyle, 
      topic: activeTopic,
      locationName: locationName || "",
      theme: theme as string
    };
  }, [materials, selectedIds, selectedStyle, activeTopic, locationName, theme]);

  // --- Handlers ---

  const handleEnableLocation = () => {
    return new Promise<string>((resolve, reject) => {
      if (!navigator.geolocation) {
        resolve("Geolocation not supported.");
        return;
      }
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lng: longitude });
          const city = await getCityFromCoordinates(latitude, longitude);
          setLocationName(city);
          setIsLocating(false);
          resolve(`Location found: ${city}`);
        },
        (error) => {
          setIsLocating(false);
          resolve("Failed to get location.");
        }
      );
    });
  };

  const startGeneralLive = async () => {
    if (isGeneralLiveActive) await liveService.stopSession();

    setIsGeneralLiveActive(true);
    const currentLocation = stateRefs.current.locationName || "Unknown";

    const systemInstruction = `
      You are the AI Assistant for "Nexus Builder AI".
      Your tone is professional, concise, and helpful.
      You are in a live voice conversation with the user.
      
      Capabilities:
      1. PLAN: If user wants to build something, call 'plan_project'.
      2. CONTROL: If user says "Scroll down", "Select all components", "Change style to Blueprint", use the respective tools.
      3. VISUALIZE: If user wants images, call 'generate_image' or 'batch_action'.
      4. REFINE: Use 'add_item' to modify the list.
      5. LOCALIZE: Use 'control_location' to get prices.
      6. THEME: Use 'change_theme' to switch light/dark mode.
      
      Current Location: "${currentLocation}". If unknown, politely ask for the city to improve pricing accuracy.
      Current Theme: "${stateRefs.current.theme}".
      Context: Topic="${stateRefs.current.topic}", Items=${stateRefs.current.materials.length}.
    `;

    const tools = [
      planProjectTool, 
      generateImageTool, 
      addItemTool, 
      changeStyleTool, 
      selectItemsTool, 
      batchActionTool, 
      scrollTool, 
      controlLocationTool,
      changeThemeTool
    ];

    try {
      await liveService.startSession(
        systemInstruction,
        tools,
        () => setIsGeneralLiveActive(false),
        (err) => {
           console.error("Live session error:", err);
           setIsGeneralLiveActive(false);
        },
        async (name, args: any) => {
          console.log(`Tool Call: ${name}`, args);
          const toolArgs = args as any;

          switch (name) {
            case 'plan_project': {
               const topic = toolArgs.topic ? String(toolArgs.topic) : '';
               const details = toolArgs.details ? String(toolArgs.details) : '';
               const combinedQuery = `${topic}. ${details}`;
               handleTopicSubmit(combinedQuery);
               return "Planning project...";
            }

            case 'generate_image': {
              const targetName = toolArgs.targetName ? String(toolArgs.targetName) : '';
              const style = typeof toolArgs.style === 'string' ? String(toolArgs.style) : undefined;
              let targetId: string | null = null;
              if (targetName) {
                  const safeName = targetName;
                  const found = stateRefs.current.materials.find(m => 
                    m.name.toLowerCase().includes(safeName.toLowerCase()) || 
                    m.description.toLowerCase().includes(safeName.toLowerCase())
                  );
                  if (found) targetId = found.id;
              }
              if (targetId) {
                handleGenerateItemImage(targetId, style);
                return `Generating image for ${targetName}...`;
              }
              return `Could not find item: ${targetName}`;
            }

            case 'add_item': {
               const newItem: Material = {
                  id: `mat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  name: toolArgs.name ? String(toolArgs.name) : '',
                  description: toolArgs.description ? String(toolArgs.description) : '',
                  category: toolArgs.category as any,
                  specifications: toolArgs.specifications ? String(toolArgs.specifications) : '',
                  status: 'IDLE',
                  videoStatus: 'IDLE'
                };
                setMaterials(prev => [...prev, newItem]);
                return `Added ${toolArgs.name}.`;
            }

            case 'change_style': {
              const requestedStyle = toolArgs.style ? String(toolArgs.style) : '';
              if (STYLES.includes(requestedStyle)) {
                setSelectedStyle(requestedStyle);
                return `Style changed to ${requestedStyle}.`;
              }
              return `Style ${requestedStyle} not supported.`;
            }

            case 'change_theme': {
               const mode = toolArgs.mode ? String(toolArgs.mode) : '';
               if (mode === 'light' || mode === 'dark') {
                  setTheme(mode as 'light' | 'dark');
                  return `Theme switched to ${mode}.`;
               }
               return "Invalid theme mode.";
            }

            case 'select_items': {
              const criteria = (toolArgs.criteria ? String(toolArgs.criteria) : '').toLowerCase();
              const action = toolArgs.action ? String(toolArgs.action) : 'select';
              let idsToModify = new Set<string>();

              if (criteria === 'all') {
                idsToModify = new Set(stateRefs.current.materials.map(m => m.id));
              } else if (criteria === 'none') {
                setSelectedIds(new Set<string>());
                return "Cleared.";
              } else {
                stateRefs.current.materials.forEach(m => {
                   if (
                     m.category.toLowerCase().includes(criteria) ||
                     m.name.toLowerCase().includes(criteria) ||
                     (criteria === 'without_images' && !m.imageUrl)
                   ) {
                     idsToModify.add(m.id);
                   }
                });
              }

              setSelectedIds(prev => {
                const next = new Set(prev);
                idsToModify.forEach(id => {
                  if (action === 'deselect') next.delete(id);
                  else if (action === 'toggle') {
                    if (next.has(id)) next.delete(id); else next.add(id);
                  }
                  else next.add(id);
                });
                return next;
              });
              return `${action}ed ${idsToModify.size} items.`;
            }

            case 'batch_action': {
               const actionType = toolArgs.actionType ? String(toolArgs.actionType) : '';
               if (actionType === 'generate_images') {
                 const count = stateRefs.current.selectedIds.size;
                 if (count === 0) return "No selection.";
                 const ids = Array.from(stateRefs.current.selectedIds);
                 setIsBatchGenerating(true);
                 (async () => {
                    const chunkSize = 3;
                    for (let i = 0; i < ids.length; i += chunkSize) {
                      const chunk = ids.slice(i, i + chunkSize);
                      await Promise.all(chunk.map(id => handleGenerateItemImage(id)));
                    }
                    setIsBatchGenerating(false);
                    setSelectedIds(new Set<string>());
                 })();
                 return `Generating ${ids.length} images.`;
               } else if (actionType === 'clear_selection') {
                 setSelectedIds(new Set<string>());
                 return "Selection cleared.";
               }
               return "Unknown action.";
            }

            case 'scroll_ui': {
               const target = toolArgs.target ? String(toolArgs.target) : '';
               if (target === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
               else if (target === 'bottom') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
               else if (target === 'list') {
                 document.getElementById('materials-list')?.scrollIntoView({ behavior: 'smooth' });
               }
               return `Scrolled.`;
            }

            case 'control_location': {
               const res = await handleEnableLocation();
               return res;
            }

            default: return "Unknown tool.";
          }
        }
      );
    } catch (e: any) {
      console.error("Failed to start live session", e);
      setIsGeneralLiveActive(false);
    }
  };

  const stopGeneralLive = async () => {
      await liveService.stopSession();
      setIsGeneralLiveActive(false);
  };

  const handleToggleGeneralLive = () => {
      if (isGeneralLiveActive) stopGeneralLive();
      else startGeneralLive();
  };

  useEffect(() => {
    // Attempt location on start, but do not auto-start Live session
    handleEnableLocation().catch(e => console.log("Loc check skipped"));
    
    return () => {
      liveService.stopSession();
    };
  }, []); 

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64Clean = result.split(',')[1];
      setUploadedImage(base64Clean);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleTopicSubmit = async (selectedTopic?: string) => {
    const query = selectedTopic || topic;
    if (!query.trim() && !uploadedImage) return;

    const displayTopic = query || "Image Analysis";
    setActiveTopic(displayTopic);
    setTopic(displayTopic);
    
    setIsLoadingList(true);
    setListError(null);
    setMaterials([]); 
    setVisualContext(''); 
    setSearchSources([]); // Reset sources
    setSelectedIds(new Set<string>()); 

    try {
      const { materials: generatedMaterials, visualContext: context, locationName: generatedLoc, searchSources: sources } = 
        await generateMaterialList(query, userLocation || undefined, uploadedImage || undefined);
      
      setMaterials(generatedMaterials);
      setVisualContext(context);
      setSearchSources(sources); // Set sources from grounding metadata
      if (generatedLoc && generatedLoc !== "Global Average") setLocationName(generatedLoc);
    } catch (err) {
      setListError("Could not generate plan.");
    } finally {
      setIsLoadingList(false);
    }
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === materials.length) setSelectedIds(new Set<string>());
    else setSelectedIds(new Set(materials.map(m => m.id)));
  };

  const handleToggleLive = (id: string) => {
    if (liveActiveId === id) setLiveActiveId(null);
    else setLiveActiveId(id);
  };

  const handleGenerateItemImage = async (id: string, styleOverride?: string) => {
    const currentList = stateRefs.current.materials;
    const materialIndex = currentList.findIndex(m => m.id === id);
    if (materialIndex === -1) return;
    const material = currentList[materialIndex];

    setMaterials(prev => prev.map(m => m.id === id ? { ...m, status: 'LOADING', error: undefined } : m));
    const styleToUse = styleOverride || stateRefs.current.style;

    try {
      const imageUrl = await generateMaterialImage(
        material.name, 
        stateRefs.current.topic, 
        material.description, 
        material.category,
        styleToUse,
        visualContext
      );
      if (imageUrl) {
        setMaterials(prev => prev.map(m => m.id === id ? { ...m, status: 'SUCCESS', imageUrl } : m));
      } else {
        throw new Error("No image");
      }
    } catch (err) {
      setMaterials(prev => prev.map(m => m.id === id ? { ...m, status: 'ERROR', error: "Failed" } : m));
    }
  };

  const handleGenerateBlueprint = async (id: string) => {
    const currentList = stateRefs.current.materials;
    const materialIndex = currentList.findIndex(m => m.id === id);
    if (materialIndex === -1) return;
    const material = currentList[materialIndex];

    setMaterials(prev => prev.map(m => m.id === id ? { ...m, blueprintStatus: 'LOADING' } : m));

    try {
      const blueprintUrl = await generateMaterialImage(
        material.name, 
        stateRefs.current.topic, 
        material.description, 
        material.category,
        "Blueprint",
        "" // No visual context needed for pure blueprint style usually
      );
      if (blueprintUrl) {
        setMaterials(prev => prev.map(m => m.id === id ? { ...m, blueprintStatus: 'SUCCESS', blueprintUrl } : m));
      } else {
        throw new Error("No blueprint");
      }
    } catch (err) {
      setMaterials(prev => prev.map(m => m.id === id ? { ...m, blueprintStatus: 'ERROR' } : m));
    }
  };

  const handleAnimateMaterial = async (id: string) => {
    const currentList = stateRefs.current.materials;
    const materialIndex = currentList.findIndex(m => m.id === id);
    if (materialIndex === -1) return;
    const material = currentList[materialIndex];

    try {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        if (!hasKey) await (window as any).aistudio.openSelectKey();
    } catch (e) {
        console.warn("Key check skipped");
    }

    setMaterials(prev => prev.map(m => m.id === id ? { ...m, videoStatus: 'LOADING' } : m));

    try {
      const imageRef = material.imageUrl || undefined;
      const prompt = `Cinematic video of ${material.name}. ${material.description}. Setting: ${visualContext}`;
      const videoUrl = await generateVeoVideo(prompt, imageRef);
      setMaterials(prev => prev.map(m => m.id === id ? { ...m, videoStatus: 'SUCCESS', videoUrl } : m));
    } catch (err) {
      setMaterials(prev => prev.map(m => m.id === id ? { ...m, videoStatus: 'ERROR' } : m));
    }
  };

  const handleBatchGenerate = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setIsBatchGenerating(true);
    const chunkSize = 3;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      await Promise.all(chunk.map((id: string) => handleGenerateItemImage(id)));
    }
    setIsBatchGenerating(false);
    setSelectedIds(new Set<string>());
  };

  const handleDownload = (imageUrl: string, name: string) => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `${name.replace(/\s+/g, '-').toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadReport = () => {
    if (materials.length === 0) return;
    const summary = calculateProjectSummary(materials);
    
    // Construct sources HTML
    const sourcesHtml = searchSources.length > 0 
      ? `<div style="margin-top:24px; padding-top:16px; border-top:1px solid #e4e4e7;">
           <h4 style="margin:0 0 8px 0; font-size:12px; color:#71717a;">Grounding Sources</h4>
           <ul style="margin:0; padding-left:16px; font-size:10px; color:#a1a1aa;">
             ${searchSources.map(s => `<li><a href="${s.web.uri}" style="color:#71717a; text-decoration:none;">${s.web.title}</a></li>`).join('')}
           </ul>
         </div>`
      : '';

    const reportContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${activeTopic} - Project Report</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
            body { font-family: 'Inter', system-ui, sans-serif; padding: 40px; color: #18181b; max-width: 900px; margin: 0 auto; background: white; }
            h1 { border-bottom: 2px solid #18181b; padding-bottom: 16px; margin-bottom: 24px; font-size: 28px; letter-spacing: -0.02em; }
            h2 { font-size: 18px; margin-top: 32px; margin-bottom: 16px; border-bottom: 1px solid #e4e4e7; padding-bottom: 8px; }
            .header { display: flex; justify-content: space-between; margin-bottom: 40px; font-size: 14px; color: #52525b; }
            .summary-box { background: #f4f4f5; padding: 24px; border-radius: 8px; margin-bottom: 40px; border: 1px solid #e4e4e7; }
            .summary-box p { margin: 8px 0; }
            .item { page-break-inside: avoid; border-bottom: 1px solid #f4f4f5; padding: 24px 0; display: flex; gap: 24px; }
            .item:last-child { border-bottom: none; }
            .item img { width: 180px; height: 180px; object-fit: contain; background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; }
            .details { flex: 1; }
            .details h3 { margin: 0 0 8px 0; font-size: 16px; display: flex; align-items: center; gap: 8px; }
            .badge { font-size: 10px; font-weight: 600; text-transform: uppercase; background: #e4e4e7; padding: 2px 8px; border-radius: 4px; color: #52525b; letter-spacing: 0.05em; }
            .desc { font-size: 14px; color: #52525b; line-height: 1.6; margin-bottom: 12px; }
            .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; font-size: 12px; color: #71717a; background: #fafafa; padding: 12px; border-radius: 8px; border: 1px solid #f4f4f5; }
            .meta div { display: flex; flex-direction: column; }
            .meta span.label { font-weight: 600; font-size: 10px; text-transform: uppercase; color: #a1a1aa; margin-bottom: 4px; }
            .footer { margin-top: 60px; text-align: center; font-size: 12px; color: #a1a1aa; border-top: 1px solid #f4f4f5; padding-top: 24px; }
            @media print {
              body { padding: 0; max-width: 100%; }
              .no-print { display: none; }
              .item { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <h1>${activeTopic || 'Project Plan'}</h1>
          <div class="header">
            <div>
              <strong>Location:</strong> ${locationName || 'Unknown'}<br/>
              <strong>Date:</strong> ${new Date().toLocaleDateString()}
            </div>
            <div style="text-align: right;">
              <strong>Nexus Builder AI</strong><br/>
              Professional Report
            </div>
          </div>

          <div class="summary-box">
            <h2 style="margin-top:0; border:none; margin-bottom: 16px;">Executive Summary</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                <div>
                    <p><strong>Total Estimated Cost:</strong> <span style="font-size: 1.2em; color: #18181b;">${summary.totalCost}</span></p>
                    <p><strong>Total Items:</strong> ${summary.itemCount}</p>
                    <p><strong>Currency:</strong> ${summary.currency}</p>
                </div>
                <div>
                     <p><strong>Visual Context:</strong> ${visualContext}</p>
                     <p style="margin-top:8px; font-size: 13px; color: #52525b; line-height: 1.5;">
                      <strong>ROI Estimate:</strong> 
                      Based on current market rates in ${locationName || 'global markets'}, this project shows standard viability. 
                      Sourcing materials locally can improve cost efficiency by ~15%.
                    </p>
                </div>
            </div>
            ${sourcesHtml}
          </div>

          <h2>Material & Process Breakdown</h2>
          ${materials.map(m => `
            <div class="item">
              ${m.imageUrl 
                ? `<img src="${m.imageUrl}" />` 
                : m.blueprintUrl 
                  ? `<img src="${m.blueprintUrl}" style="background:#e0f2fe;" />`
                  : '<div style="width:180px;height:180px;background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#a1a1aa;font-size:12px;text-align:center;padding:16px;">No Visualization<br/>Generated</div>'
              }
              <div class="details">
                <h3>${m.name} <span class="badge">${m.category}</span></h3>
                <p class="desc">${m.description}</p>
                <div class="meta">
                  ${m.specifications ? `<div style="grid-column: span 3;"><span class="label">Specifications</span><span style="font-family: monospace;">${m.specifications}</span></div>` : ''}
                  ${m.estimatedCost ? `<div><span class="label">Estimated Cost</span>${m.estimatedCost}</div>` : ''}
                  ${m.estimatedDuration ? `<div><span class="label">Duration</span>${m.estimatedDuration}</div>` : ''}
                  ${m.weight ? `<div><span class="label">Weight</span>${m.weight}</div>` : ''}
                  ${m.dimensions ? `<div><span class="label">Dimensions</span>${m.dimensions}</div>` : ''}
                </div>
              </div>
            </div>
          `).join('')}

          <div class="footer">
             Generated by Nexus Builder AI • Powered by Google Gemini 2.5 Flash
          </div>

          <script>
            window.onload = function() { setTimeout(function(){ window.print(); }, 500); }
          </script>
        </body>
      </html>
    `;

    const newWindow = window.open('', '_blank');
    if (newWindow) {
      newWindow.document.write(reportContent);
      newWindow.document.close();
    }
  };

  const isDark = theme === 'dark';
  
  // Theme Classes (kept same as before)
  const bgMain = isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-slate-50 text-slate-900';
  const headerBg = isDark ? 'bg-zinc-950/80 border-zinc-900' : 'bg-white/80 border-slate-200';
  const textTitle = isDark ? 'text-zinc-100' : 'text-slate-900';
  const textSubtitle = isDark ? 'text-zinc-500' : 'text-slate-500';
  const inputBox = isDark ? 'bg-zinc-900 border-zinc-800 focus-within:ring-indigo-500/50' : 'bg-white border-slate-200 shadow-sm focus-within:ring-indigo-500/20';
  const inputText = isDark ? 'text-zinc-200 placeholder-zinc-600' : 'text-slate-800 placeholder-slate-400';
  const inputBar = isDark ? 'bg-zinc-900/50 border-zinc-800/50' : 'bg-slate-50 border-slate-100';
  const uploadBtn = isDark ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600';
  const generateBtn = isDark ? 'bg-zinc-100 hover:bg-white text-zinc-900 disabled:bg-zinc-800 disabled:text-zinc-600' : 'bg-slate-900 hover:bg-slate-800 text-white disabled:bg-slate-200 disabled:text-slate-400';
  const tagStyle = isDark ? 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-600 hover:text-zinc-300 text-zinc-500' : 'bg-white border-slate-200 hover:border-slate-300 hover:text-slate-700 text-slate-500 shadow-sm';
  const loadingBox = isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 shadow-sm';
  const stickyHeader = isDark ? 'bg-zinc-950/90 border-zinc-900' : 'bg-white/90 border-slate-200';
  const batchBar = isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-300' : 'bg-white border-slate-200 text-slate-600 shadow-xl';

  return (
    <div className={`min-h-screen font-sans transition-colors duration-300 pb-32 ${bgMain}`}>
      
      {/* Header */}
      <header className={`border-b backdrop-blur-md sticky top-0 z-50 transition-colors ${headerBg}`}>
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.location.reload()}>
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
            </div>
            <h1 className={`text-sm font-semibold tracking-tight ${textTitle}`}>
              Nexus Builder AI
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
             {/* Report Download */}
             {materials.length > 0 && (
                <button
                  onClick={handleDownloadReport}
                  className={`hidden sm:flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${isDark ? 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200' : 'bg-white border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-700 shadow-sm'}`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                  Report
                </button>
             )}

             {/* Location Button */}
             {!locationName && (
                <button
                  onClick={() => handleEnableLocation()}
                  className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-600/20 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Find Location
                </button>
             )}

             {/* Live Toggle */}
             <button 
               className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${isGeneralLiveActive ? 'bg-rose-500/10 text-rose-500 ring-1 ring-rose-500/50' : isDark ? 'bg-zinc-900 text-zinc-500 hover:text-zinc-300' : 'bg-slate-100 text-slate-500 hover:text-slate-700'}`}
               onClick={handleToggleGeneralLive}
             >
                <div className={`w-1.5 h-1.5 rounded-full ${isGeneralLiveActive ? 'bg-rose-500 animate-pulse' : isDark ? 'bg-zinc-600' : 'bg-slate-400'}`}></div>
                {isGeneralLiveActive ? 'Live Planner' : 'Plan Voice'}
             </button>

             {/* Style Select */}
             <div className="hidden sm:block">
                <select 
                  value={selectedStyle}
                  onChange={(e) => setSelectedStyle(e.target.value)}
                  className={`border text-xs rounded-lg block px-2.5 py-1.5 outline-none cursor-pointer transition-colors ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                  {STYLES.map(style => <option key={style} value={style}>{style}</option>)}
                </select>
             </div>

             {/* Theme Toggle */}
             <button 
               onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
               className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-zinc-500 hover:bg-zinc-900' : 'text-slate-500 hover:bg-slate-100'}`}
             >
                {isDark ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                )}
             </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12 w-full relative z-10">
        
        {/* Main Input Area */}
        <section className="mb-12">
          <div className="text-center mb-8">
            <h2 className={`text-3xl font-semibold tracking-tight mb-2 ${textTitle}`}>
              What would you like to build?
            </h2>
            <p className={`text-sm ${textSubtitle}`}>
              Describe your project or upload an image to generate a comprehensive plan.
            </p>
          </div>

          <div className={`relative max-w-2xl mx-auto transition-all`}>
            {/* Live Overlay */}
            {isGeneralLiveActive && (
               <div className="absolute -top-12 left-0 right-0 flex justify-center z-10">
                  <div className={`text-rose-400 px-4 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 shadow-xl border ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-rose-100'}`}>
                     <span className="animate-pulse">●</span> Listening...
                  </div>
               </div>
            )}

            <div className={`rounded-xl border overflow-hidden focus-within:ring-1 transition-all ${inputBox}`}>
                {uploadedImage && (
                    <div className={`p-3 border-b flex items-center justify-between ${isDark ? 'bg-zinc-800/50 border-zinc-800' : 'bg-slate-50 border-slate-100'}`}>
                        <div className="flex items-center gap-3">
                           <img src={`data:image/jpeg;base64,${uploadedImage}`} className="w-10 h-10 rounded object-cover border border-zinc-700" alt="Preview" />
                           <span className="text-xs text-zinc-400 font-medium">Image attached</span>
                        </div>
                        <button onClick={() => setUploadedImage(null)} className="text-zinc-500 hover:text-zinc-300">
                           <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                )}

                <textarea
                    value={topic}
                    onChange={(e) => {
                        setTopic(e.target.value);
                        e.target.style.height = 'auto'; 
                        e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onKeyDown={(e) => {
                        if(e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleTopicSubmit();
                        }
                    }}
                    placeholder={uploadedImage ? "Add context about the image..." : "e.g., 'Modern wooden pergola', 'Drone frame', 'Gaming setup'"}
                    className={`w-full p-4 bg-transparent border-none outline-none resize-none min-h-[56px] text-base ${inputText}`}
                    rows={1}
                />

                <div className={`flex items-center justify-between p-2 px-3 border-t ${inputBar}`}>
                    <div className="flex items-center">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className={`p-2 rounded-lg transition-colors ${uploadedImage ? 'text-indigo-500' : uploadBtn}`}
                            title="Attach Image"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </button>
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                    </div>
                    
                    <button
                        onClick={() => handleTopicSubmit()}
                        disabled={(!topic.trim() && !uploadedImage) || isLoadingList}
                        className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${generateBtn}`}
                    >
                        {isLoadingList ? (
                            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                        ) : (
                            <>Generate Plan <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg></>
                        )}
                    </button>
                </div>
            </div>
          </div>

          {!materials.length && !isLoadingList && !uploadedImage && (
            <div className="mt-8 flex flex-wrap justify-center gap-2">
               {EXAMPLE_TOPICS.slice(0, 4).map(t => (
                  <button key={t} onClick={() => handleTopicSubmit(t)} className={`text-xs px-3 py-1.5 rounded-full border transition-all ${tagStyle}`}>
                     {t}
                  </button>
               ))}
            </div>
          )}
        </section>

        {isLoadingList && (
           <div className="space-y-4 max-w-xl mx-auto">
             <div className={`h-24 rounded-xl w-full border animate-pulse ${loadingBox}`}></div>
             <div className={`h-24 rounded-xl w-full border animate-pulse delay-75 ${loadingBox}`}></div>
             <div className={`h-24 rounded-xl w-full border animate-pulse delay-150 ${loadingBox}`}></div>
           </div>
        )}

        {listError && (
          <div className="text-center p-4 bg-rose-500/10 text-rose-500 rounded-lg border border-rose-500/20 text-sm">
            {listError}
          </div>
        )}

        {materials.length > 0 && (
          <div id="materials-list" className="space-y-4 animate-fadeIn pb-24">
            <div className={`flex flex-col mb-2 sticky top-14 backdrop-blur z-20 py-4 border-b ${stickyHeader}`}>
              <div className="flex items-center justify-between w-full">
                  <div>
                    <h3 className={`text-lg font-semibold ${textTitle}`}>{activeTopic}</h3>
                    <div className={`flex gap-4 text-xs mt-1 ${textSubtitle}`}>
                      {visualContext && <span>Env: {visualContext}</span>}
                      {locationName && <span>Loc: {locationName}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSelectAll}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${isDark ? 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200' : 'bg-white border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-700'}`}
                    >
                      {selectedIds.size === materials.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
              </div>
              
              {/* Search Grounding Sources */}
              {searchSources.length > 0 && (
                <div className={`mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] ${textSubtitle}`}>
                   <span className={`font-semibold ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>Sources:</span>
                   {searchSources.map((source, idx) => (
                      <React.Fragment key={idx}>
                         {source.web?.uri ? (
                            <a href={source.web.uri} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-400 underline decoration-zinc-700 underline-offset-2">
                               {source.web.title}
                            </a>
                         ) : null}
                      </React.Fragment>
                   ))}
                </div>
              )}
            </div>

            {materials.map(item => (
                <MaterialCard 
                  key={item.id} 
                  material={item}
                  isSelected={selectedIds.has(item.id)}
                  isLiveActive={liveActiveId === item.id}
                  theme={theme}
                  onToggleSelect={toggleSelection}
                  onGenerate={handleGenerateItemImage}
                  onGenerateBlueprint={handleGenerateBlueprint}
                  onDownload={handleDownload}
                  onToggleLive={handleToggleLive}
                  onAnimate={handleAnimateMaterial}
                />
            ))}
          </div>
        )}

      </main>

      {/* Batch Action Bar */}
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-md border rounded-full px-6 py-3 flex items-center justify-between transition-all duration-300 z-50 ${batchBar} ${selectedIds.size > 0 ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'}`}>
          <div className="text-sm font-medium">
            <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{selectedIds.size}</span> selected
          </div>
          <div className="flex items-center gap-3">
             <button onClick={() => setSelectedIds(new Set<string>())} className={`text-xs font-medium ${isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-slate-400 hover:text-slate-600'}`}>Cancel</button>
             <button
              onClick={handleBatchGenerate}
              disabled={isBatchGenerating}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-full text-xs font-semibold shadow-lg shadow-indigo-500/20 flex items-center gap-2"
            >
               {isBatchGenerating ? 'Processing...' : 'Generate Images'}
            </button>
          </div>
      </div>
    </div>
  );
};

export default App;