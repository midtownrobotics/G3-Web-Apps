import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

export function KioskLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("kiosk_token");
    if (!token) {
      navigate("/kiosk/activate");
    }
  }, [navigate]);

  async function handleSubmit() {
    if (pin.length !== 3) return;

    setError(null);
    setLoading(true);

    try {
      const token = localStorage.getItem("kiosk_token");
      const res = await fetch(`${apiBase}/auth/pin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Kiosk-Token": token!,
        },
        body: JSON.stringify({ pin }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Invalid PIN");
        setPin("");
        return;
      }

      const redirect = searchParams.get("redirect") || "/";
      window.location.href = redirect;
    } catch (err) {
      setError("Login failed");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  function addDigit(digit: string) {
    if (pin.length < 3) {
      setPin(pin + digit);
    }
  }

  function removeDigit() {
    setPin(pin.slice(0, -1));
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-white mb-2">Enter PIN</h1>
          <p className="text-gray-400 text-lg">Your 3-digit PIN</p>
        </div>

        <div className="space-y-8">
          <div className="flex justify-center gap-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-20 h-20 rounded-lg bg-gray-900 border-2 border-gray-700 flex items-center justify-center"
              >
                <span className="text-4xl font-bold text-white">
                  {pin[i] ? "●" : "○"}
                </span>
              </div>
            ))}
          </div>

          {error && <p className="text-red-400 text-center text-lg font-medium">{error}</p>}

          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => addDigit(num.toString())}
                disabled={loading || pin.length >= 3}
                className="h-24 rounded-lg bg-gray-900 hover:bg-gray-800 disabled:opacity-50 border border-gray-700 text-white text-3xl font-bold transition-colors active:bg-gray-700"
              >
                {num}
              </button>
            ))}

            <button
              type="button"
              onClick={() => addDigit("0")}
              disabled={loading || pin.length >= 3}
              className="col-span-3 h-20 rounded-lg bg-gray-900 hover:bg-gray-800 disabled:opacity-50 border border-gray-700 text-white text-2xl font-bold transition-colors active:bg-gray-700"
            >
              0
            </button>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={removeDigit}
              disabled={loading || pin.length === 0}
              className="flex-1 h-16 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-white font-semibold transition-colors active:bg-gray-600"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || pin.length !== 3}
              className="flex-1 h-16 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-semibold transition-colors active:bg-red-700"
            >
              {loading ? "Loading..." : "Login"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
