import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

export function DrawingUploadPage() {
  const { partNumber } = useParams<{ partNumber: string }>();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [drawings, setDrawings] = useState<any[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !partNumber) {
      setMessage({ type: "error", text: "Missing file or part number" });
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("partNumber", partNumber);
      formData.append("uploadedBy", "test");

      const res = await fetch("/api/drawings/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const data = (await res.json()) as { error?: string; filename?: string };
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Upload failed" });
      } else {
        setMessage({ type: "success", text: `Uploaded: ${data.filename}` });
        setFile(null);
        if (e.target instanceof HTMLFormElement) {
          e.target.reset();
        }
        fetchDrawings();
      }
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      setLoading(false);
    }
  };

  const fetchDrawings = async () => {
    if (!partNumber) return;
    try {
      const res = await fetch(`/api/drawings/list/${partNumber}`, {
        credentials: "include",
      });
      const data = (await res.json()) as { drawings?: any[] };
      setDrawings(data.drawings || []);
    } catch (err) {
      console.error("Failed to fetch drawings", err);
    }
  };

  // Fetch on mount
  useEffect(() => {
    fetchDrawings();
  }, [partNumber]);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Upload Drawing</h1>
      <p className="text-lg mb-4">Part Number: <span className="font-mono font-bold">{partNumber || "N/A"}</span></p>

      <form onSubmit={handleUpload} className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">PDF File</label>
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="w-full p-2 border border-gray-300 rounded"
            disabled={loading}
          />
          {file && <p className="text-sm text-gray-600 mt-2">Selected: {file.name}</p>}
        </div>

        <button
          type="submit"
          disabled={!file || loading}
          className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? "Uploading..." : "Upload"}
        </button>
      </form>

      {message && (
        <div
          className={`p-4 rounded mb-6 ${
            message.type === "success"
              ? "bg-green-100 text-green-800 border border-green-300"
              : "bg-red-100 text-red-800 border border-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {partNumber && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">OnShape Drawing</h2>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
            <div>
              <p className="font-medium">Drawing for {partNumber}</p>
              <p className="text-sm text-gray-600">Cached from OnShape</p>
            </div>
            <a
              href={`/api/onshape/drawings/view/${partNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              View
            </a>
          </div>
        </div>
      )}

      {drawings.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Uploaded Drawings</h2>
          <div className="space-y-2">
            {drawings.map((drawing) => (
              <div key={drawing.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div>
                  <p className="font-medium">{drawing.filename}</p>
                  <p className="text-sm text-gray-600">
                    {drawing.fileSize && `${(drawing.fileSize / 1024).toFixed(2)} KB`}
                  </p>
                </div>
                <a
                  href={`/api/drawings/${drawing.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  View
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
