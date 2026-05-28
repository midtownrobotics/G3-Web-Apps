import { useEffect, useState } from "react";
import { api } from "../../shared/api";

export function HomePage() {
  const [name, setName] = useState<string>();

  useEffect(() => {
    api.me().then((me) => setName(me.data.displayName));
  }, []);

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-red-400 font-semibold text-lg tracking-widest uppercase">
          Production Tracking and Management
        </p>
        <h1 className="text-6xl font-bold text-white tracking-tight">G3 Shop Software</h1>
        {name && <h3 className="text-2xl font-bold text-white">Hello, {name}</h3>}
      </div>
    </main>
  );
}
