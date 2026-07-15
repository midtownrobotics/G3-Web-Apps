import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

interface ErrorState {
  error: string;
  details: string;
}

export function PartViewerPage() {
  const { partNumber } = useParams<{ partNumber: string }>();
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<ErrorState | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!partNumber) return;

    const checkDrawing = async () => {
      try {
        const response = await fetch(`/api/parts/${partNumber}/drawing`, {
          credentials: "include",
          method: "HEAD",
        });

        if (!response.ok) {
          const errorData = await fetch(`/api/parts/${partNumber}/drawing`, {
            credentials: "include",
          }).then((r) => r.json() as Promise<ErrorState>);

          setErrorState(errorData);
          setLoading(false);
          return;
        }

        setPdfUrl(`/api/parts/${partNumber}/drawing`);
        setLoading(false);
      } catch (err) {
        setErrorState({
          error: "Failed to check drawing",
          details: err instanceof Error ? err.message : "An unexpected error occurred while checking the drawing.",
        });
        setLoading(false);
      }
    };

    checkDrawing();
  }, [partNumber]);

  if (!partNumber) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-red-600 text-4xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Missing Part Number</h1>
          <p className="text-gray-600">No part number was provided. Please check the URL and try again.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="animate-spin text-primary-600 text-4xl mb-4">⏳</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Loading Drawing</h1>
          <p className="text-gray-600">Please wait while we retrieve the drawing for part {partNumber}...</p>
        </div>
      </div>
    );
  }

  if (errorState) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="text-red-600 text-5xl mb-4 text-center">📋</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{errorState.error}</h1>
          <p className="text-gray-600 mb-6 leading-relaxed">{errorState.details}</p>
          <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded">
            Part Number: <span className="font-mono font-bold">{partNumber}</span>
          </div>
        </div>
      </div>
    );
  }

  if (!pdfUrl) {
    return null;
  }

  return (
    <div className="w-full h-screen bg-white flex flex-col">
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">
          Drawing for Part <span className="font-mono text-primary-600">{partNumber}</span>
        </h1>
      </div>

      <iframe
        src={pdfUrl}
        className="flex-1 w-full border-none"
        title={`Drawing for ${partNumber}`}
      />
    </div>
  );
}
