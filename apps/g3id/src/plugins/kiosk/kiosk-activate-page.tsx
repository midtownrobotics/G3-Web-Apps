import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

export function KioskActivatePage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedToken = localStorage.getItem("kiosk_token");
    if (savedToken) {
      navigate("/kiosk/login");
    }
  }, [navigate]);

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${apiBase}/kiosk/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, deviceName }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Activation failed");
        return;
      }

      const data = (await res.json()) as { token: string };
      localStorage.setItem("kiosk_token", data.token);
      navigate("/kiosk/login");
    } catch (err) {
      setError("Failed to activate device");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">Activate Kiosk</h1>
          <p className="text-gray-400">Enter your activation code to set up this device</p>
        </div>

        <form onSubmit={handleActivate} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Activation Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full px-4 py-3 text-center text-2xl tracking-widest rounded-lg bg-gray-900 border border-gray-700 text-white placeholder-gray-600 focus:outline-none focus:border-red-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Device Name
            </label>
            <input
              type="text"
              placeholder="e.g., Shop Register 1"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 text-white placeholder-gray-600 focus:outline-none focus:border-red-400"
            />
          </div>

          {error && <p className="text-red-400 text-center text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || code.length !== 6 || !deviceName.trim()}
            className="w-full py-3 px-4 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
          >
            {loading ? "Activating..." : "Activate Device"}
          </button>
        </form>
      </div>
    </div>
  );
}
