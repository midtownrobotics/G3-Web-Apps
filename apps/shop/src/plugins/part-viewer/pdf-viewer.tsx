import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.js?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface PDFViewerProps {
  url: string;
  title: string;
}

export function PDFViewer({ url, title }: PDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const renderPDF = async () => {
      try {
        setError(null);
        const pdf = await pdfjsLib.getDocument(url).promise;
        const container = containerRef.current;
        if (!container) return;

        container.innerHTML = "";

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const scale = window.devicePixelRatio || 1;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.display = "block";
          canvas.style.margin = "0 auto";
          canvas.style.marginBottom = "10px";
          canvas.style.maxWidth = "100%";
          canvas.style.height = "auto";

          const context = canvas.getContext("2d");
          if (!context) continue;

          await page.render({
            canvasContext: context,
            viewport: viewport,
          }).promise;

          container.appendChild(canvas);
        }
      } catch (err) {
        console.error("PDF rendering error:", err);
        setError(err instanceof Error ? err.message : "Failed to load PDF");
      }
    };

    renderPDF();
  }, [url]);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100">
        <div className="text-center text-red-600">
          <p className="font-bold">Failed to load PDF</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="overflow-auto flex-1 bg-gray-100 p-4"
      title={title}
    />
  );
}
