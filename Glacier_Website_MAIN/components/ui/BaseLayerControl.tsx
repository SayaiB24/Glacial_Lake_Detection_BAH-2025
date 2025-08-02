// components/ui/BaseLayerControl.tsx
'use client';

interface BaseLayerControlProps {
  layers: string[];
  selectedLayer: string;
  onLayerChange: (layerName: string) => void;
}

export function BaseLayerControl({ layers, selectedLayer, onLayerChange }: BaseLayerControlProps) {
  return (
    <div>
      <h3 className="mb-2 text-lg font-semibold">Base Layers</h3>
      <div className="flex flex-col gap-2">
        {layers.map((layerName) => (
          <label key={layerName} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="base-layer"
              value={layerName}
              checked={selectedLayer === layerName}
              onChange={() => onLayerChange(layerName)}
              className="cursor-pointer"
            />
            {layerName}
          </label>
        ))}
      </div>
    </div>
  );
}