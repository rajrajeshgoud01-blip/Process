export type GenerationStatus = 'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR';

export type MaterialCategory = 'Component' | 'Tool' | 'Step';

export interface Material {
  id: string;
  name: string;
  description: string;
  category: MaterialCategory;
  specifications?: string; // e.g. "Cut to 450mm length, 45 degree bevel"
  weight?: string; // e.g. "2.5 kg"
  dimensions?: string; // e.g. "10 x 20 x 5 cm"
  estimatedCost?: string; // e.g. "$50 - $100"
  estimatedDuration?: string; // e.g. "2 hours"
  status: GenerationStatus;
  imageUrl?: string;
  error?: string;
  videoStatus?: GenerationStatus;
  videoUrl?: string;
  blueprintStatus?: GenerationStatus;
  blueprintUrl?: string;
}

export interface TopicResult {
  topic: string;
  materials: Material[];
}