import { useEffect, useState } from "react";
import { api } from "../../shared/api";

export function HomePage() {
  const [name, setName] = useState<string>();

  useEffect(() => {
    api.me
      .$get()
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setName(data?.displayName))
      .catch(() => setName(undefined));
  }, []);

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center">
      <div className="text-center space-y-3">
        <h1 className="text-6xl font-bold text-white tracking-tight">G3 Shop Software</h1>
        <p className="text-red-400 font-semibold text-lg tracking-widest uppercase">
          Production Tracking and Management
        </p>
        {name && <h3 className="text-4xl font-bold text-white mt-20">Hello, {name} 👋</h3>}
      </div>
    </main>
  );
}
