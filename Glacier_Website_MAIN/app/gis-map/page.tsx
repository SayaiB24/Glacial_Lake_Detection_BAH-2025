"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window` at import time, so the map must never be rendered on
// the server. Loading it with ssr:false keeps the production build from failing
// during prerendering.
const GISMapClient = dynamic(() => import("./GISMapClient"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen">
      <div className="text-xl font-semibold">Loading Map...</div>
    </div>
  ),
});

export default function GISMapPage() {
  return <GISMapClient />;
}
