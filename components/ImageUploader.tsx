import React, { useCallback } from 'react';

interface ImageUploaderProps {
  currentImage: string | null;
  onImageSelected: (base64: string, mimeType: string) => void;
  onClear: () => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ currentImage, onImageSelected, onClear }) => {
  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Extract base64 data only (remove data:image/xxx;base64, prefix) for the API
      // But we keep the full string for preview, and split it when calling API service if needed
      // Actually, my service expects clean base64, so let's handle that in the parent or service.
      // For now, let's pass the full data URL to parent for preview convenience.
      const base64Clean = result.split(',')[1];
      const mimeType = file.type;
      
      onImageSelected(base64Clean, mimeType);
    };
    reader.readAsDataURL(file);
  }, [onImageSelected]);

  return (
    <div className="w-full">
      {!currentImage ? (
        <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <svg className="w-8 h-8 mb-4 text-slate-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
            </svg>
            <p className="mb-2 text-sm text-slate-500"><span className="font-semibold">Click to upload reference</span> or drag and drop</p>
            <p className="text-xs text-slate-400">PNG, JPG or WEBP</p>
          </div>
          <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
        </label>
      ) : (
        <div className="relative group rounded-lg overflow-hidden border border-slate-200">
          <img src={`data:image/jpeg;base64,${currentImage}`} alt="Uploaded reference" className="w-full h-64 object-cover" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <button 
              onClick={onClear}
              className="bg-white/20 hover:bg-white/40 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm font-medium transition-colors"
            >
              Remove Image
            </button>
          </div>
        </div>
      )}
    </div>
  );
};