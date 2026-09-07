import { ArrowRight, Maximize2, Minimize2, Pencil, RotateCcw, Target, Trash2 } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const COLORS = ["#e53935", "#2e7d32", "#f9a825", "#ec407a"];
type Point = { x: number; y: number };
type Tool = "draw" | "arrow" | "sotm";

function drawingColorAt(hex: string, progress: number) {
  const value = Number.parseInt(hex.slice(1), 16);
  const normalized = Math.max(0, Math.min(1, progress));
  const channel = (shift: number) => {
    const base = (value >> shift) & 255;
    if (normalized < 0.5) return Math.round(base + (255 - base) * (0.32 * (1 - normalized * 2)));
    return Math.round(base * (1 - 0.42 * ((normalized - 0.5) * 2)));
  };
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

export function FormFieldMap({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const base = useRef<HTMLCanvasElement | null>(null);
  const history = useRef<ImageData[]>([]);
  const drawing = useRef(false);
  const start = useRef<Point | null>(null);
  const last = useRef<Point | null>(null);
  const preview = useRef<ImageData | null>(null);
  const path = useRef<Point[]>([]);
  const [tool, setTool] = useState<Tool>("draw");
  const [color, setColor] = useState(COLORS[0]);
  const [fullscreen, setFullscreen] = useState(false);

  const loadBlob = useCallback(
    (blob: Blob) => {
      const image = new Image();
      image.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const width = 1400;
        const sourceWidth = blob.type === "image/svg+xml" ? width : image.naturalWidth;
        const sourceHeight =
          blob.type === "image/svg+xml" ? (width * 9.0692) / 17.541 : image.naturalHeight;
        const scale = Math.min(1, width / sourceWidth);
        canvas.width = Math.round(sourceWidth * scale);
        canvas.height = Math.round(sourceHeight * scale);
        const context = canvas.getContext("2d");
        context?.clearRect(0, 0, canvas.width, canvas.height);
        context?.drawImage(image, 0, 0, canvas.width, canvas.height);
        const clean = document.createElement("canvas");
        clean.width = canvas.width;
        clean.height = canvas.height;
        clean.getContext("2d")?.drawImage(canvas, 0, 0);
        base.current = clean;
        history.current = [];
        URL.revokeObjectURL(image.src);
      };
      image.src = URL.createObjectURL(blob);
    },
    [canvasRef],
  );

  const loadRebuilt = useCallback(async () => {
    const response = await fetch("/field-2026.svg");
    if (response.ok) loadBlob(await response.blob());
  }, [loadBlob]);

  useEffect(() => {
    void loadRebuilt();
  }, [loadRebuilt]);
  useEffect(() => {
    document.body.classList.toggle("map-workspace-open", fullscreen);
    return () => document.body.classList.remove("map-workspace-open");
  }, [fullscreen]);

  function point(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * event.currentTarget.width,
      y: ((event.clientY - rect.top) / rect.height) * event.currentTarget.height,
    };
  }
  function snapshot() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      history.current.push(context.getImageData(0, 0, canvas.width, canvas.height));
      if (history.current.length > 20) history.current.shift();
    }
  }
  function arrow(context: CanvasRenderingContext2D, from: Point, to: Point) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const head = 22;
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 5;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.lineTo(
      to.x - head * Math.cos(angle - Math.PI / 6),
      to.y - head * Math.sin(angle - Math.PI / 6),
    );
    context.moveTo(to.x, to.y);
    context.lineTo(
      to.x - head * Math.cos(angle + Math.PI / 6),
      to.y - head * Math.sin(angle + Math.PI / 6),
    );
    context.stroke();
  }
  function cone(context: CanvasRenderingContext2D, points: Point[]) {
    if (points.length < 2) return;
    const middle = points[Math.floor(points.length / 2)];
    const hub = {
      x: context.canvas.width * (middle.x < context.canvas.width / 2 ? 0.2922 : 0.7078),
      y: context.canvas.height * 0.5,
    };
    context.save();
    context.globalAlpha = 0.22;
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (const item of points.slice(1)) context.lineTo(item.x, item.y);
    context.lineTo(hub.x, hub.y);
    context.closePath();
    context.fill();
    context.restore();
  }
  function finishGradient(context: CanvasRenderingContext2D, points: Point[]) {
    if (points.length < 2) return;
    const beforeStroke = history.current[history.current.length - 1];
    if (beforeStroke) context.putImageData(beforeStroke, 0, 0);
    const lengths = points
      .slice(1)
      .map((item, index) => Math.hypot(item.x - points[index].x, item.y - points[index].y));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    if (!total) return;
    let traveled = 0;
    context.lineWidth = 8;
    context.lineCap = "round";
    context.lineJoin = "round";
    lengths.forEach((length, index) => {
      const from = points[index];
      const to = points[index + 1];
      const startProgress = traveled / total;
      traveled += length;
      const endProgress = traveled / total;
      const gradient = context.createLinearGradient(from.x, from.y, to.x, to.y);
      gradient.addColorStop(0, drawingColorAt(color, startProgress));
      gradient.addColorStop(1, drawingColorAt(color, endProgress));
      context.strokeStyle = gradient;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    });
  }
  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !base.current) return;
    snapshot();
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(base.current, 0, 0);
  }
  function undo() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const image = history.current.pop();
    if (context && image) context.putImageData(image, 0, 0);
  }

  return (
    <div className={`map-editor form-map-editor ${fullscreen ? "map-editor-fullscreen" : ""}`}>
      <div className="map-toolbar">
        <button type="button" onClick={() => setFullscreen((value) => !value)}>
          {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          {fullscreen ? "Exit fullscreen" : "Fullscreen map"}
        </button>
        <span className="toolbar-divider" />
        <button
          type="button"
          className={tool === "draw" ? "active" : ""}
          onClick={() => setTool("draw")}
        >
          <Pencil size={16} /> Draw
        </button>
        <button
          type="button"
          className={tool === "arrow" ? "active" : ""}
          onClick={() => setTool("arrow")}
        >
          <ArrowRight size={17} /> Arrow
        </button>
        <button
          type="button"
          className={tool === "sotm" ? "active" : ""}
          onClick={() => setTool("sotm")}
        >
          <Target size={17} /> SOTM
        </button>
        <div className="drawing-colors">
          {COLORS.map((option) => (
            <button
              type="button"
              key={option}
              className={color === option ? "selected" : ""}
              style={{ backgroundColor: option }}
              onClick={() => setColor(option)}
              aria-label={`Use ${option}`}
            />
          ))}
        </div>
        <button type="button" onClick={undo}>
          <RotateCcw size={16} /> Undo
        </button>
        <button type="button" className="clear-drawings-button" onClick={clear}>
          <Trash2 size={16} /> Clear
        </button>
      </div>
      <div className="canvas-shell has-image">
        <canvas
          ref={canvasRef}
          aria-label="Drawable field map"
          onPointerDown={(event) => {
            snapshot();
            drawing.current = true;
            start.current = point(event);
            last.current = start.current;
            path.current = [start.current];
            preview.current =
              event.currentTarget
                .getContext("2d")
                ?.getImageData(0, 0, event.currentTarget.width, event.currentTarget.height) ?? null;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drawing.current || !last.current) return;
            const next = point(event);
            const context = event.currentTarget.getContext("2d");
            if (!context) return;
            if (tool === "arrow" && start.current && preview.current) {
              context.putImageData(preview.current, 0, 0);
              arrow(context, start.current, next);
            } else {
              context.strokeStyle = color;
              context.lineWidth = 8;
              context.lineCap = "round";
              context.lineJoin = "round";
              context.beginPath();
              context.moveTo(last.current.x, last.current.y);
              context.lineTo(next.x, next.y);
              context.stroke();
              path.current.push(next);
            }
            last.current = next;
          }}
          onPointerUp={(event) => {
            const context = event.currentTarget.getContext("2d");
            if (context && tool !== "arrow") {
              finishGradient(context, path.current);
              if (tool === "sotm") cone(context, path.current);
            }
            drawing.current = false;
            start.current = null;
            last.current = null;
            preview.current = null;
          }}
          onPointerCancel={() => {
            drawing.current = false;
          }}
        />
      </div>
    </div>
  );
}
