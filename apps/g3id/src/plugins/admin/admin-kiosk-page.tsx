import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";

type ActivationCode = {
  code: string;
  expiresAt: number;
};

type KioskDevice = {
  id: number;
  name: string;
  token: string;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
};

export function AdminKioskPage() {
  const [deviceName, setDeviceName] = useState("");
  const [code, setCode] = useState<ActivationCode | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);

  const [devices, setDevices] = useState<KioskDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesError, setDevicesError] = useState<string | null>(null);

  async function loadDevices() {
    setDevicesLoading(true);
    setDevicesError(null);
    try {
      const res = await api.admin.kiosk.devices.$get();
      if (!res.ok) {
        setDevicesError("Failed to load devices");
        return;
      }
      const data = (await res.json()) as KioskDevice[];
      setDevices(data);
    } catch {
      setDevicesError("Failed to load devices");
    } finally {
      setDevicesLoading(false);
    }
  }

  useEffect(() => {
    loadDevices();
  }, []);

  async function handleGenerateCode(e: React.FormEvent) {
    e.preventDefault();
    setCodeError(null);
    setCodeLoading(true);

    try {
      const res = await api.admin.kiosk.codes.$post({
        json: { deviceName },
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setCodeError(data.error ?? "Failed to generate code");
        return;
      }

      const data = (await res.json()) as ActivationCode;
      setCode(data);
      setDeviceName("");
    } catch {
      setCodeError("Failed to generate code");
    } finally {
      setCodeLoading(false);
    }
  }

  async function handleRevokeDevice(deviceId: number) {
    try {
      const res = await api.admin.kiosk.devices[":id"].$delete(
        { param: { id: deviceId.toString() } },
      );

      if (!res.ok) {
        alert("Failed to revoke device");
        return;
      }

      await loadDevices();
    } catch {
      alert("Failed to revoke device");
    }
  }

  return (
    <main className="flex-1 px-6 py-8 max-w-2xl mx-auto w-full">
      <div className="mb-6 flex gap-4 border-b border-secondary-600">
        <Link
          to="/admin/users"
          className="py-2 px-4 text-secondary-200 hover:text-white transition-colors"
        >
          Users
        </Link>
        <Link
          to="/admin/kiosk"
          className="py-2 px-4 text-white font-medium border-b-2 border-primary-400"
        >
          Kiosk Devices
        </Link>
      </div>

      <h1 className="text-3xl font-bold text-white mb-8">Kiosk Management</h1>

      <div className="space-y-8">
        <div className="bg-secondary-700 border border-secondary-600 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Generate Activation Code</h2>
          <form onSubmit={handleGenerateCode} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-2">
                Device Name
              </label>
              <input
                type="text"
                placeholder="e.g., Shop Register 1"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:border-primary-400"
              />
            </div>

            <button
              type="submit"
              disabled={codeLoading || !deviceName.trim()}
              className="w-full py-2 px-4 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold transition-colors"
            >
              {codeLoading ? "Generating..." : "Generate Code"}
            </button>
          </form>

          {codeError && <p className="mt-3 text-sm text-primary-400">{codeError}</p>}

          {code && (
            <div className="mt-6 bg-gray-700 border border-gray-600 rounded-lg p-4 space-y-3">
              <div>
                <p className="text-xs text-secondary-200 mb-1">Activation Code (expires in 30 min)</p>
                <p className="text-3xl font-mono font-bold text-primary-400 tracking-widest text-center">
                  {code.code}
                </p>
              </div>
              <p className="text-xs text-secondary-200 text-center">
                Expires: {new Date(code.expiresAt * 1000).toLocaleString()}
              </p>
              <button
                type="button"
                onClick={() => setCode(null)}
                className="w-full py-2 text-sm text-gray-200 hover:text-white transition-colors"
              >
                Generate Another Code
              </button>
            </div>
          )}
        </div>

        <div className="bg-secondary-700 border border-secondary-600 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Active Devices</h2>

          {devicesError && <p className="text-sm text-primary-400 mb-4">{devicesError}</p>}

          {devicesLoading ? (
            <p className="text-secondary-200 text-sm">Loading devices...</p>
          ) : devices.length === 0 ? (
            <p className="text-secondary-200 text-sm">No devices registered yet</p>
          ) : (
            <div className="space-y-3">
              {devices.map((device) => (
                <div
                  key={device.id}
                  className="bg-gray-700 border border-gray-600 rounded-lg p-4 flex items-center justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white">{device.name}</p>
                    <p className="text-xs text-secondary-200 mt-1">
                      Created {new Date(device.createdAt * 1000).toLocaleDateString()}
                    </p>
                    {device.lastUsedAt && (
                      <p className="text-xs text-secondary-200">
                        Last used {new Date(device.lastUsedAt * 1000).toLocaleString()}
                      </p>
                    )}
                    {device.revokedAt && (
                      <p className="text-xs text-primary-400 font-medium">
                        Revoked {new Date(device.revokedAt * 1000).toLocaleString()}
                      </p>
                    )}
                  </div>

                  {!device.revokedAt && (
                    <button
                      type="button"
                      onClick={() => handleRevokeDevice(device.id)}
                      className="ml-4 p-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white transition-colors flex-shrink-0"
                      title="Revoke device"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
