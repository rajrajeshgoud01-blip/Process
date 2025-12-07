import { GoogleGenAI, Type } from "@google/genai";
import { Material, MaterialCategory } from "../types";

// Note: We instantiate GoogleGenAI inside each function to ensure the latest API Key is used
// especially after the user selects it via the UI dialog or if env varies.

/**
 * Identifies the city name from coordinates using Gemini.
 */
export const getCityFromCoordinates = async (lat: number, lng: number): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Identify the city and country for these coordinates: Latitude ${lat}, Longitude ${lng}. Return ONLY the city and country name (e.g. "New York, USA"). Do not add any other text.`,
    });
    return response.text?.trim() || "Unknown Location";
  } catch (error) {
    console.warn("City detection failed", error);
    return "Unknown Location";
  }
};

/**
 * Calculates total estimated cost from the material list.
 */
export const calculateProjectSummary = (materials: Material[]) => {
  let minTotal = 0;
  let maxTotal = 0;
  let currency = '$';

  materials.forEach(m => {
    if (!m.estimatedCost || m.estimatedCost === 'N/A') return;
    
    // Attempt to parse currency symbol
    const match = m.estimatedCost.match(/([^\d\s\.,]+)/);
    if (match) currency = match[1];

    // Extract numbers
    const numbers = m.estimatedCost.match(/(\d+[\d,\.]*)/g);
    if (numbers) {
      const vals = numbers.map(n => parseFloat(n.replace(/,/g, '')));
      if (vals.length === 1) {
        minTotal += vals[0];
        maxTotal += vals[0];
      } else if (vals.length >= 2) {
        minTotal += vals[0];
        maxTotal += vals[1];
      }
    }
  });

  return {
    totalCost: `${currency}${minTotal.toLocaleString()} - ${currency}${maxTotal.toLocaleString()}`,
    itemCount: materials.length,
    currency
  };
};

/**
 * Generates a comprehensive list of materials, tools, and process steps for a given topic or image.
 * Supports Search Grounding, Maps Grounding, and Thinking Mode.
 */
export const generateMaterialList = async (
  topic: string, 
  location?: { lat: number, lng: number },
  imageBase64?: string,
  useThinking: boolean = false
): Promise<{ materials: Material[], visualContext: string, locationName: string, searchSources: any[] }> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // --- Model Selection ---
    // User requested "Thinking Mode" with gemini-3-pro-preview and specific budget.
    // Otherwise default to gemini-2.5-flash for speed and standard tool usage.
    const modelName = useThinking ? 'gemini-3-pro-preview' : 'gemini-2.5-flash';

    const locationPrompt = location 
      ? `CONTEXT: User is located at Latitude: ${location.lat}, Longitude: ${location.lng}. 
         1. Identify this specific City/Region.
         2. CRITICAL: Use Google Maps/Search to find REAL-TIME LOCAL MARKET RATES and AVAILABILITY in this city. 
         3. Use the LOCAL CURRENCY symbol (e.g., ₹, €, £, ¥) for costs.
         4. Set the "locationName" field to the detected City, Country.`
      : `CONTEXT: Use global average prices in USD. Set "locationName" to "Global Average".`;

    const userPrompt = imageBase64 
      ? `Analyze the provided image. Identify the main object, structure, or project shown. 
         User context/request: "${topic}".
         Create a comprehensive project breakdown to build or recreate what is in the image.`
      : `You are an expert technical planner and industrial engineer. Create a comprehensive project breakdown for: "${topic}".`;

    const contents = [];
    if (imageBase64) {
      contents.push({
        inlineData: {
          mimeType: 'image/jpeg', // Assuming jpeg for simplicity or generic
          data: imageBase64
        }
      });
    }
    
    contents.push({ text: `
      ${userPrompt}
      
      ${locationPrompt}
      
      ${useThinking ? "Use your advanced reasoning capabilities to plan complex projects with high precision." : "Using the 'googleSearch' and 'googleMaps' tools is MANDATORY to ensure cost and specification accuracy."}
      
      You must return a raw JSON object (do not wrap in markdown code blocks) containing:
      1. "visualContext": A short, descriptive string (max 15 words) establishing a consistent visual setting.
      2. "locationName": The identified city/region.
      3. "items": An array containing materials, tools, and process steps.

      Total items should be between 10 and 15.
      
      CRITICAL INSTRUCTIONS FOR SPECIFICATIONS:
      The "specifications" field must be HIGHLY TECHNICAL and ACCURATE. 
      - Include tolerances where applicable (e.g., ±0.5mm, H7 fit).
      - Specify material grades (e.g., SS304, Al 6061-T6).
      - Use standard units appropriate for the location.
      - Use specific fabrication jargon.
      
      Each item object in the "items" array must have:
      - "name": Short title.
      - "description": 1 concise sentence describing specifics.
      - "category": "Component", "Tool", or "Step".
      - "specifications": Detailed technical specs. Return "N/A" if completely inapplicable.
      - "weight": Approximate weight. Return "N/A" for Steps.
      - "dimensions": Physical dimensions. Return "N/A" for Steps.
      - "estimatedCost": Estimated price range (e.g. "$20-50").
      - "estimatedDuration": Estimated time for Steps.
    `});

    // --- Tool Configuration ---
    const tools: any[] = [];
    
    // Only use Google Search/Maps if not in Thinking Mode (or if supported by 3-pro, but usually strict thinking ignores tools in some contexts, 
    // however, for this app, we prioritize the requested tools on the Flash model or mix them if possible).
    // The prompt says "Use gemini-2.5-flash (with googleSearch)" and "Use gemini-2.5-flash (with googleMaps)". 
    // It also says "Use gemini-3-pro-preview" for thinking. 
    // We will enable tools for both, assuming the preview model supports them, otherwise the text generation will rely on internal knowledge.
    
    if (!useThinking) {
      tools.push({ googleSearch: {} });
      if (location) {
        tools.push({ googleMaps: {} });
      }
    }

    const config: any = {
       tools: tools.length > 0 ? tools : undefined,
    };

    // Add Thinking Config if enabled
    if (useThinking) {
        config.thinkingConfig = { thinkingBudget: 32768 };
        // Do not set maxOutputTokens as per instructions
    }

    // Add Maps Location Context if available
    if (location && tools.some(t => t.googleMaps)) {
       config.toolConfig = {
          retrievalConfig: {
             latLng: {
                latitude: location.lat,
                longitude: location.lng
             }
          }
       };
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: contents,
      config: config
    });

    // Extract Text and Clean Markdown if present
    let jsonStr = response.text || "{}";
    // Remove markdown code fencing if the model adds it despite instructions
    jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let parsedData;
    try {
        parsedData = JSON.parse(jsonStr);
    } catch (e) {
        console.error("Failed to parse JSON from search response", jsonStr);
        // Fallback or re-throw
        if (jsonStr.includes('{')) {
             // Try to find the first '{' and last '}'
             const first = jsonStr.indexOf('{');
             const last = jsonStr.lastIndexOf('}');
             if (first !== -1 && last !== -1) {
                 try {
                    parsedData = JSON.parse(jsonStr.substring(first, last + 1));
                 } catch (e2) {
                    throw new Error("Invalid JSON response from AI");
                 }
             }
        } else {
             throw new Error("Invalid JSON response from AI");
        }
    }
    
    const items = (parsedData.items || []).map((item: any, index: number) => ({
      id: `mat-${Date.now()}-${index}`,
      name: item.name,
      description: item.description,
      category: item.category as MaterialCategory,
      specifications: item.specifications !== "N/A" ? item.specifications : undefined,
      weight: item.weight !== "N/A" ? item.weight : undefined,
      dimensions: item.dimensions !== "N/A" ? item.dimensions : undefined,
      estimatedCost: item.estimatedCost !== "N/A" ? item.estimatedCost : undefined,
      estimatedDuration: item.estimatedDuration !== "N/A" ? item.estimatedDuration : undefined,
      status: 'IDLE',
      videoStatus: 'IDLE',
      blueprintStatus: 'IDLE'
    }));

    // Extract Grounding Metadata (Search Sources and Maps Sources)
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    return {
      materials: items,
      visualContext: parsedData.visualContext || "A neutral workspace",
      locationName: parsedData.locationName || (location ? "Local Region" : "Global Average"),
      searchSources: groundingChunks
    };

  } catch (error) {
    console.error("Error generating list:", error);
    throw new Error("Failed to generate comprehensive list.");
  }
};

/**
 * Generates an image for a specific item based on its category and selected style.
 * Uses visualContext to maintain continuity across the project.
 */
export const generateMaterialImage = async (
  materialName: string,
  topic: string,
  description: string,
  category: MaterialCategory,
  style: string = "Photorealistic",
  visualContext: string = ""
): Promise<string | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let prompt = "";
    
    // Base style instruction
    let styleInstruction = "High quality image.";
    
    if (style === "Photorealistic") {
      styleInstruction = "High quality, professional photography, 4k, highly detailed, studio lighting.";
    } else if (style === "Blueprint") {
      styleInstruction = "Professional engineering blueprint, white technical lines on classic blue paper background. High contrast, schematic view. Include measurements and dimension lines visually.";
    } else if (style === "Isometric") {
      styleInstruction = "3D isometric render, clean colorful vector style, soft shadows, minimal background, highly detailed.";
    } else if (style === "Diagram") {
      styleInstruction = "Exploded view technical diagram, educational, clearly separated parts with leader lines, white background, vector illustration style.";
    } else if (style === "Sketch") {
      styleInstruction = "Hand-drawn artistic sketch, pencil or ink style, rough edges, conceptual art.";
    } else if (style === "Cyberpunk") {
      styleInstruction = "Futuristic cyberpunk style, neon lights, high tech, dark atmosphere, glowing accents.";
    } else if (style === "Watercolor") {
      styleInstruction = "Soft watercolor painting style, artistic, gentle blending, paper texture, pastel colors.";
    } else if (style === "Claymation") {
      styleInstruction = "Claymation style, plasticine texture, stop-motion look, soft lighting, tactile feel.";
    } else if (style === "Line Art") {
      styleInstruction = "Clean black and white line art, minimalist, vector style, no shading, technical illustration.";
    } else if (style === "Pixel Art") {
      styleInstruction = "Retro 8-bit pixel art style, vibrant colors, blocky details, video game aesthetic.";
    } else if (style === "Origami") {
      styleInstruction = "Paper folding origami style, sharp creases, paper texture, geometric shapes, shadow depth.";
    }

    // Context instruction for continuity (primarily for realistic/isometric styles)
    let contextInstruction = "";
    if (visualContext && (style === "Photorealistic" || style === "Isometric" || style === "Cyberpunk" || style === "Claymation")) {
      contextInstruction = `Environment/Setting: The image must be set in: "${visualContext}". Ensure visual continuity with this setting.`;
    }

    switch (category) {
      case 'Step':
        prompt = `Create an image showing the process step: "${materialName}" for a ${topic}. 
        Context: ${description}. 
        ${contextInstruction}
        Style: ${styleInstruction}
        View: Clear focus on the action or result being performed in the environment.`;
        break;
      case 'Tool':
        prompt = `Show the tool: ${materialName}. 
        Context: Used for ${topic}. ${description}. 
        ${contextInstruction}
        Style: ${styleInstruction}
        View: Placed naturally in the environment or on a workbench.`;
        break;
      case 'Component':
      default:
        prompt = `Show the component: ${materialName}. 
        Context: Part of a ${topic}. ${description}. 
        ${contextInstruction}
        Style: ${styleInstruction}
        View: Isolated product shot or resting in the project environment.`;
        break;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }],
      },
    });

    const contentParts = response.candidates?.[0]?.content?.parts;
    if (contentParts) {
      for (const part of contentParts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
};

/**
 * Generates a video using Veo 3.1 Fast.
 * Can animate an existing image if provided.
 */
export const generateVeoVideo = async (
  prompt: string,
  imageBase64?: string
): Promise<string> => {
  // Always create a new instance to pick up the latest selected API Key
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const config: any = {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: '16:9'
  };

  let operation;
  
  try {
    if (imageBase64) {
        // Strip header if present
        const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        
        operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            image: {
                imageBytes: cleanBase64,
                mimeType: 'image/png' 
            },
            config: config
        });
    } else {
         operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: config
        });
    }

    // Polling
    while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({operation: operation});
    }

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) throw new Error("No video URI returned");

    // Fetch actual bytes/url
    // We must append key when fetching from the download link
    const downloadUrl = `${videoUri}&key=${process.env.API_KEY}`;
    
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error("Failed to download video bytes");
    const blob = await res.blob();
    return URL.createObjectURL(blob);
    
  } catch (error) {
    console.error("Veo generation error:", error);
    throw error;
  }
};
