import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from "@google/genai";

// --- Tool Definitions ---

export const generateImageTool: FunctionDeclaration = {
  name: "generate_image",
  description: "Generate or regenerate an image for a specific item. Use this when the user points out a specific item to visualize.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      targetName: {
        type: Type.STRING,
        description: "The name of the item. Fuzzy match allowed.",
      },
      style: {
        type: Type.STRING,
        description: "Optional style override.",
      }
    },
    required: ["targetName"]
  },
};

export const addItemTool: FunctionDeclaration = {
  name: "add_item",
  description: "Add a new item to the list.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      description: { type: Type.STRING },
      category: { type: Type.STRING, enum: ["Component", "Tool", "Step"] },
      specifications: { type: Type.STRING }
    },
    required: ["name", "description", "category"]
  },
};

export const planProjectTool: FunctionDeclaration = {
  name: "plan_project",
  description: "Create a new project plan/material list from scratch.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      topic: { type: Type.STRING },
      details: { type: Type.STRING }
    },
    required: ["topic"]
  },
};

export const changeStyleTool: FunctionDeclaration = {
  name: "change_style",
  description: "Change the visual style for image generation.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      style: { 
        type: Type.STRING, 
        enum: ["Photorealistic", "Blueprint", "Isometric", "Sketch"],
        description: "The visual style to switch to."
      }
    },
    required: ["style"]
  },
};

export const changeThemeTool: FunctionDeclaration = {
  name: "change_theme",
  description: "Change the application UI theme (light or dark mode).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      mode: { 
        type: Type.STRING, 
        enum: ["light", "dark"],
        description: "The theme mode to switch to." 
      }
    },
    required: ["mode"]
  },
};

export const selectItemsTool: FunctionDeclaration = {
  name: "select_items",
  description: "Select or deselect items in the list based on criteria.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      criteria: { 
        type: Type.STRING, 
        description: "Criteria to select: 'all', 'none', 'components', 'tools', 'steps', 'without_images', or a keyword like 'steel'." 
      },
      action: {
        type: Type.STRING,
        enum: ["select", "deselect", "toggle"],
        description: "What to do with the matching items. Default is select."
      }
    },
    required: ["criteria"]
  },
};

export const batchActionTool: FunctionDeclaration = {
  name: "batch_action",
  description: "Perform an action on all currently selected items.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      actionType: { 
        type: Type.STRING, 
        enum: ["generate_images", "clear_selection"],
        description: "The action to perform."
      }
    },
    required: ["actionType"]
  },
};

export const scrollTool: FunctionDeclaration = {
  name: "scroll_ui",
  description: "Scroll the page to a specific section.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      target: { 
        type: Type.STRING, 
        enum: ["top", "bottom", "list", "input"],
        description: "Where to scroll to."
      }
    },
    required: ["target"]
  },
};

export const controlLocationTool: FunctionDeclaration = {
  name: "control_location",
  description: "Get the user's current location to localize prices.",
  parameters: {
    type: Type.OBJECT,
    properties: {}, // No args needed, just the trigger
  },
};

// --- Service Class ---

export class LiveSessionManager {
  private activeSessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private outputNode: AudioNode | null = null;

  async startSession(
    systemInstruction: string,
    tools: FunctionDeclaration[],
    onClose: () => void,
    onError: (err: any) => void,
    onToolCall?: (name: string, args: any) => Promise<any>
  ) {
    // Cleanup any existing session first
    await this.stopSession();

    try {
      // Initialize API client inside the session start to ensure latest API KEY is picked up
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      // 1. Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.inputAudioContext = new AudioContextClass({ sampleRate: 16000 });
      this.outputAudioContext = new AudioContextClass({ sampleRate: 24000 });
      this.outputNode = this.outputAudioContext.createGain();
      this.outputNode.connect(this.outputAudioContext.destination);

      // 2. Get User Media
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 3. Connect to Live API
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log("Live session opened");
            this.setupAudioInput(sessionPromise);
          },
          onmessage: (message: LiveServerMessage) => this.handleMessage(message, onToolCall),
          onclose: () => {
            console.log("Live session closed");
            this.cleanup();
            onClose();
          },
          onerror: (e: any) => {
            console.error("Live session error", e);
            onError(e);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: systemInstruction,
          tools: [{ functionDeclarations: tools }],
        },
      });

      this.activeSessionPromise = sessionPromise;

    } catch (error) {
      console.error("Failed to start live session:", error);
      this.cleanup();
      throw error;
    }
  }

  private setupAudioInput(sessionPromise: Promise<any>) {
    if (!this.inputAudioContext || !this.mediaStream) return;

    this.source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
    // Use ScriptProcessor for raw PCM access (bufferSize, inputChannels, outputChannels)
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmBlob = this.createPcmBlob(inputData);
      
      // Send audio chunk
      sessionPromise.then((session) => {
        session.sendRealtimeInput({ media: pcmBlob });
      });
    };

    this.source.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination); // Required for processing to happen
  }

  private async handleMessage(message: LiveServerMessage, onToolCall?: (name: string, args: any) => Promise<any>) {
    // Handle Function Calls
    if (message.toolCall && onToolCall) {
        const responses = [];
        for (const fc of message.toolCall.functionCalls) {
            try {
                const result = await onToolCall(fc.name, fc.args);
                responses.push({
                    id: fc.id,
                    name: fc.name,
                    response: { result: result }
                });
            } catch (err) {
                 responses.push({
                    id: fc.id,
                    name: fc.name,
                    response: { error: "Failed to execute function" }
                });
            }
        }
        
        // Send response back to model
        this.activeSessionPromise?.then(session => {
            session.sendToolResponse({
                functionResponses: responses
            });
        });
    }

    // Handle Audio Output
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    
    if (base64Audio && this.outputAudioContext && this.outputNode) {
      try {
        const audioBuffer = await this.decodeAudioData(base64Audio, this.outputAudioContext);
        
        // Schedule playback
        this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
        
        const source = this.outputAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputNode);
        
        source.addEventListener('ended', () => {
          this.sources.delete(source);
        });

        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
        this.sources.add(source);
      } catch (err) {
        console.error("Error decoding audio:", err);
      }
    }

    // Handle Interruption
    if (message.serverContent?.interrupted) {
      this.stopAudioPlayback();
    }
  }

  private stopAudioPlayback() {
    for (const source of this.sources) {
      source.stop();
    }
    this.sources.clear();
    if (this.outputAudioContext) {
        this.nextStartTime = this.outputAudioContext.currentTime;
    } else {
        this.nextStartTime = 0;
    }
  }

  async stopSession() {
    if (this.activeSessionPromise) {
      try {
        const session = await this.activeSessionPromise;
        await session.close();
      } catch (e) {
        console.warn("Error closing session:", e);
      }
    }
    this.cleanup();
  }

  private cleanup() {
    this.stopAudioPlayback();

    // Stop input processing
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.inputAudioContext) {
      this.inputAudioContext.close();
      this.inputAudioContext = null;
    }
    if (this.outputAudioContext) {
      this.outputAudioContext.close();
      this.outputAudioContext = null;
    }
    this.activeSessionPromise = null;
    this.nextStartTime = 0;
  }

  // --- Helpers ---

  /**
   * Converts Float32Array (from AudioContext) to 16-bit PCM Blob
   */
  private createPcmBlob(data: Float32Array): { data: string, mimeType: string } {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      // Clamp values to [-1, 1] then scale to Int16
      const s = Math.max(-1, Math.min(1, data[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    // Manual Base64 Encode
    let binary = '';
    const bytes = new Uint8Array(int16.buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    
    return {
      data: btoa(binary),
      mimeType: 'audio/pcm;rate=16000',
    };
  }

  /**
   * Decodes raw PCM Base64 to AudioBuffer
   */
  private async decodeAudioData(
    base64: string,
    ctx: AudioContext
  ): Promise<AudioBuffer> {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const dataInt16 = new Int16Array(bytes.buffer);
    const numChannels = 1;
    const sampleRate = 24000;
    
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
    }
    
    return buffer;
  }
}

export const liveService = new LiveSessionManager();