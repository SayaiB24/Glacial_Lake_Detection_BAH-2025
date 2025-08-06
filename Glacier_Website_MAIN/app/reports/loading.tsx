// You can place this code in any loading.tsx file, for example: app/gis-map/loading.tsx

export default function Loading() {
  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-gray-50">
      <div className="w-24 h-24 relative flex items-center justify-center">
        {/* Outer blur pulse */}
        <div
          className="absolute inset-0 rounded-xl bg-blue-500/20 blur-xl animate-pulse"
        ></div>

        <div className="w-full h-full relative flex items-center justify-center">
          {/* Spinning gradient border */}
          <div
            className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 animate-spin blur-sm"
          ></div>

          {/* Main content area with bouncing bars */}
          <div
            className="absolute inset-1 bg-gray-900 rounded-lg flex items-center justify-center overflow-hidden"
          >
            <div className="flex gap-1 items-center">
              <div
                className="w-1.5 h-12 bg-cyan-500 rounded-full animate-[bounce_1s_ease-in-out_infinite]"
              ></div>
              <div
                className="w-1.5 h-12 bg-blue-500 rounded-full animate-[bounce_1s_ease-in-out_infinite_0.1s]"
                style={{ animationDelay: '0.1s' }} // Inline style for compatibility
              ></div>
              <div
                className="w-1.s h-12 bg-indigo-500 rounded-full animate-[bounce_1s_ease-in-out_infinite_0.2s]"
                 style={{ animationDelay: '0.2s' }}
              ></div>
              <div
                className="w-1.5 h-12 bg-purple-500 rounded-full animate-[bounce_1s_ease-in-out_infinite_0.3s]"
                 style={{ animationDelay: '0.3s' }}
              ></div>
            </div>

            {/* Inner gradient pulse */}
            <div
              className="absolute inset-0 bg-gradient-to-t from-transparent via-blue-500/10 to-transparent animate-pulse"
            ></div>
          </div>
        </div>

        {/* Corner ping animations */}
        <div
          className="absolute -top-1 -left-1 w-2 h-2 bg-blue-500 rounded-full animate-ping"
        ></div>
        <div
          className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full animate-ping delay-100"
        ></div>
        <div
          className="absolute -bottom-1 -left-1 w-2 h-2 bg-cyan-500 rounded-full animate-ping delay-200"
        ></div>
        <div
          className="absolute -bottom-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-ping delay-300"
        ></div>
      </div>
      <p className="mt-8 text-gray-600 font-medium">Loading...</p>
    </div>
  );
}