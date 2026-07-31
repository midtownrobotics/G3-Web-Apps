import {
  ArrowRight,
  Camera,
  ChevronRight,
  Circle,
  CirclePlus,
  Eraser,
  Image,
  ImagePlus,
  Loader2,
  LogIn,
  Map as MapIcon,
  Menu,
  Monitor,
  Moon,
  Octagon,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Square,
  Sun,
  Trash2,
  Triangle,
  Type,
  Upload,
  X,
} from "lucide-react";
import {
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { API_URL, G3ID_URL, api } from "./api";
import {
  deleteLocalFieldMap,
  getFieldMapPreset,
  listLocalFieldMaps,
  saveFieldMapPreset,
  saveLocalFieldMap,
} from "./local-field-maps";
import { type ParsedTrajectory, parseTrajectoryFile, trajectoryToPng } from "./trajectory-files";

type Page = "overview" | "tiers" | "maps" | "autos" | "robots";
type User = { userId: string; displayName: string; email: string; isAdmin: boolean };
type Tier = { id: string; name: string; color: string; items: string[] };
type TierList = {
  id?: string;
  name: string;
  description: string;
  tiers: Tier[];
  updatedAt?: number;
};
type FieldMap = {
  id: string;
  name: string;
  eventName: string;
  notes: string;
  imageUrl: string;
  image: Blob;
  updatedAt: number;
};
type AutoRoutine = {
  id: string;
  name: string;
  team: string;
  description: string;
  steps: string[];
  imageUrl: string | null;
  updatedAt: number;
};
type RobotTeam = {
  id: string;
  teamName: string;
  summary: string;
  images: { id: string; url: string; createdAt: number }[];
  updatedAt: number;
};

function G3Logo({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      className={`g3-icon ${className}`}
      src="/g3.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
    />
  );
}

const defaultTiers: Tier[] = [
  { id: crypto.randomUUID(), name: "S", color: "#ef5350", items: [] },
  { id: crypto.randomUUID(), name: "A", color: "#ff9f43", items: [] },
  { id: crypto.randomUUID(), name: "B", color: "#feca57", items: [] },
  { id: crypto.randomUUID(), name: "C", color: "#66bb6a", items: [] },
];

const DRAWING_COLORS = ["#e53935", "#1565c0", "#2e7d32", "#f9a825", "#ec407a"];
const TIER_COLORS = [
  "#ef5350",
  "#ff7043",
  "#ff9f43",
  "#feca57",
  "#66bb6a",
  "#26a69a",
  "#42a5f5",
  "#5c6bc0",
  "#ab47bc",
  "#78909c",
];

function timeAgo(timestamp?: number) {
  if (!timestamp) return "Unsaved";
  const minutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

function EmptyState({
  icon: Icon,
  title,
  action,
}: {
  icon: ComponentType<{ size?: number }>;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={26} />
      </div>
      {title && <h3>{title}</h3>}
      {action}
    </div>
  );
}

function Overview({ go }: { go: (page: Page) => void }) {
  const cards = [
    {
      page: "tiers" as const,
      label: "Tier Lists",
    },
    {
      page: "maps" as const,
      label: "Field Maps",
    },
    {
      page: "autos" as const,
      label: "Auto Library",
    },
    {
      page: "robots" as const,
      label: "Robot Library",
    },
  ];
  return (
    <section className="page overview">
      <div className="hero">
        <div>
          <h1>
            G3
            <br />
            <span>Strategy</span>
          </h1>
        </div>
        <div className="hero-logo" aria-hidden="true">
          <G3Logo size={230} />
        </div>
      </div>
      <div className="tool-grid">
        {cards.map(({ page, label }) => (
          <button type="button" className="tool-card" key={page} onClick={() => go(page)}>
            <h2>{label}</h2>
            <span className="tool-link">
              Open tool <ChevronRight size={16} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function TierLists() {
  const [lists, setLists] = useState<TierList[]>([]);
  const [current, setCurrent] = useState<TierList>({
    name: "2026 Team Rankings",
    description: "Overall event pick-list discussion",
    tiers: defaultTiers,
  });
  const [newItem, setNewItem] = useState("");
  const [saving, setSaving] = useState(false);
  const [dragged, setDragged] = useState<{ tierId: string; item: string } | null>(null);

  const load = useCallback(async () => {
    const data = await api<{ tierLists: TierList[] }>("/tier-lists");
    setLists(data.tierLists);
    if (data.tierLists[0]) setCurrent(data.tierLists[0]);
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  function updateTier(tierId: string, patch: Partial<Tier>) {
    setCurrent((value) => ({
      ...value,
      tiers: value.tiers.map((tier) => (tier.id === tierId ? { ...tier, ...patch } : tier)),
    }));
  }

  function addItem() {
    const item = newItem.trim();
    if (!item || !current.tiers[0]) return;
    updateTier(current.tiers[0].id, { items: [...current.tiers[0].items, item] });
    setNewItem("");
  }

  function drop(targetTierId: string) {
    if (!dragged || dragged.tierId === targetTierId) return;
    setCurrent((value) => ({
      ...value,
      tiers: value.tiers.map((tier) => {
        if (tier.id === dragged.tierId) {
          return { ...tier, items: tier.items.filter((item) => item !== dragged.item) };
        }
        if (tier.id === targetTierId) return { ...tier, items: [...tier.items, dragged.item] };
        return tier;
      }),
    }));
    setDragged(null);
  }

  async function save() {
    setSaving(true);
    try {
      if (current.id) {
        await api(`/tier-lists/${current.id}`, {
          method: "PUT",
          body: JSON.stringify(current),
        });
      } else {
        const created = await api<{ id: string }>("/tier-lists", {
          method: "POST",
          body: JSON.stringify(current),
        });
        setCurrent((value) => ({ ...value, id: created.id }));
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page tier-lists-page">
      <div className="page-heading">
        <div>
          <h1>Tier Lists</h1>
        </div>
        <div className="heading-actions">
          <select
            aria-label="Select tier list"
            value={current.id ?? "new"}
            onChange={(event) => {
              const selected = lists.find((list) => list.id === event.target.value);
              if (selected) setCurrent(selected);
            }}
          >
            <option value="new">New unsaved list</option>
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setCurrent({
                name: "Untitled tier list",
                description: "",
                tiers: defaultTiers.map((tier) => ({
                  ...tier,
                  id: crypto.randomUUID(),
                  items: [],
                })),
              })
            }
          >
            <Plus size={17} /> New
          </button>
          <button type="button" className="primary-button" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={17} className="spin" /> : <Save size={17} />} Save list
          </button>
        </div>
      </div>
      <div className="editor-card">
        <div className="list-meta">
          <input
            className="title-input"
            value={current.name}
            onChange={(event) => setCurrent({ ...current, name: event.target.value })}
            aria-label="Tier list name"
          />
          <span>Updated {timeAgo(current.updatedAt)}</span>
        </div>
        <div className="add-row">
          <input
            value={newItem}
            onChange={(event) => setNewItem(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && addItem()}
            placeholder="Add a team or strategy item…"
          />
          <button type="button" onClick={addItem}>
            <CirclePlus size={18} /> Add to top tier
          </button>
        </div>
        <div className="tier-board">
          {current.tiers.map((tier) => (
            <div
              className="tier-row"
              key={tier.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => drop(tier.id)}
            >
              <div className="tier-label" style={{ background: tier.color }}>
                <input
                  value={tier.name}
                  onChange={(event) => updateTier(tier.id, { name: event.target.value })}
                  aria-label="Tier name"
                />
                <div className="tier-color-options" aria-label={`${tier.name} color`}>
                  {TIER_COLORS.map((option) => (
                    <button
                      type="button"
                      key={option}
                      className={tier.color === option ? "selected" : ""}
                      style={{ backgroundColor: option }}
                      aria-label={`Set ${tier.name} to ${option}`}
                      aria-pressed={tier.color === option}
                      onClick={() => updateTier(tier.id, { color: option })}
                    />
                  ))}
                </div>
              </div>
              <div className="tier-items">
                {tier.items.map((item) => (
                  <div
                    className="tier-chip"
                    draggable
                    key={item}
                    onDragStart={() => setDragged({ tierId: tier.id, item })}
                  >
                    <span>{item}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${item}`}
                      onClick={() =>
                        updateTier(tier.id, { items: tier.items.filter((value) => value !== item) })
                      }
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
                {!tier.items.length && <span className="drop-hint">Drop entries here</span>}
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="add-tier-button"
          onClick={() =>
            setCurrent((value) => ({
              ...value,
              tiers: [
                ...value.tiers,
                { id: crypto.randomUUID(), name: "New", color: "#78909c", items: [] },
              ],
            }))
          }
        >
          <Plus size={16} /> Add tier
        </button>
      </div>
    </section>
  );
}

function MapCanvas({
  onSaved,
  editingMap,
}: {
  onSaved: () => Promise<void>;
  editingMap: FieldMap | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const shapeStart = useRef<{ x: number; y: number } | null>(null);
  const shapePreview = useRef<ImageData | null>(null);
  const history = useRef<ImageData[]>([]);
  const [hasImage, setHasImage] = useState(false);
  const [color, setColor] = useState(DRAWING_COLORS[0]);
  const [brushSize, setBrushSize] = useState(7);
  const [tool, setTool] = useState<
    "draw" | "erase" | "text" | "arrow" | "square" | "circle" | "triangle" | "stop"
  >("draw");
  const [textValue, setTextValue] = useState("");
  const [textColor, setTextColor] = useState<"#ffffff" | "#111111">("#ffffff");
  const [name, setName] = useState("");
  const [eventName, setEventName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const snapshot = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context)
      history.current.push(context.getImageData(0, 0, canvas.width, canvas.height));
  }, []);

  const loadImage = useCallback(
    (imageBlob: Blob, suggestedName = "") => {
      const image = new window.Image();
      image.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const maxWidth = 1400;
        const isSvg = imageBlob.type === "image/svg+xml";
        const sourceWidth = isSvg ? maxWidth : image.width;
        const sourceHeight = isSvg ? (maxWidth * 9.0692) / 17.541 : image.height;
        const scale = Math.min(1, maxWidth / sourceWidth);
        canvas.width = sourceWidth * scale;
        canvas.height = sourceHeight * scale;
        canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
        const baseCanvas = document.createElement("canvas");
        baseCanvas.width = canvas.width;
        baseCanvas.height = canvas.height;
        baseCanvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
        baseCanvasRef.current = baseCanvas;
        history.current = [];
        snapshot();
        setHasImage(true);
        if (suggestedName) setName(suggestedName.replace(/\.[^.]+$/, ""));
        URL.revokeObjectURL(image.src);
      };
      image.src = URL.createObjectURL(imageBlob);
    },
    [snapshot],
  );

  async function loadFile(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;
    await saveFieldMapPreset(file);
    loadImage(file, file.name);
  }

  const useRebuiltField = useCallback(async () => {
    const response = await fetch("/field-2026.svg");
    if (!response.ok) throw new Error("Could not load the REBUILT field.");
    const field = await response.blob();
    await saveFieldMapPreset(field);
    loadImage(field, "REBUILT field");
  }, [loadImage]);

  useEffect(() => {
    getFieldMapPreset()
      .then((preset) => {
        if (preset) loadImage(preset);
        else return useRebuiltField();
      })
      .catch(() => undefined);
  }, [loadImage, useRebuiltField]);

  useEffect(() => {
    if (!editingMap) return;
    loadImage(editingMap.image);
    setName(editingMap.name);
    setEventName(editingMap.eventName);
    setNotes(editingMap.notes);
  }, [editingMap, loadImage]);

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function startDraw(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!hasImage) return;
    snapshot();
    if (tool === "text") {
      const context = event.currentTarget.getContext("2d");
      const value = textValue.trim();
      if (!context || !value) return;
      const position = point(event);
      context.globalCompositeOperation = "source-over";
      context.fillStyle = textColor;
      context.strokeStyle = textColor === "#ffffff" ? "#111111" : "#ffffff";
      context.lineWidth = 4;
      context.lineJoin = "round";
      context.font = `700 ${Math.max(24, brushSize * 5)}px Ubuntu, sans-serif`;
      context.strokeText(value, position.x, position.y);
      context.fillText(value, position.x, position.y);
      return;
    }
    if (["arrow", "square", "circle", "triangle", "stop"].includes(tool)) {
      shapeStart.current = point(event);
      const context = event.currentTarget.getContext("2d");
      if (context) {
        shapePreview.current = context.getImageData(
          0,
          0,
          event.currentTarget.width,
          event.currentTarget.height,
        );
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const position = point(event);
    context.beginPath();
    context.moveTo(position.x, position.y);
  }

  function draw(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (shapeStart.current && shapePreview.current) {
      const context = event.currentTarget.getContext("2d");
      if (!context) return;
      context.putImageData(shapePreview.current, 0, 0);
      paintShape(context, shapeStart.current, point(event));
      return;
    }
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const position = point(event);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = brushSize;
    context.globalCompositeOperation = "source-over";
    const baseCanvas = baseCanvasRef.current;
    const basePattern =
      tool === "erase" && baseCanvas ? context.createPattern(baseCanvas, "no-repeat") : null;
    context.strokeStyle = basePattern ?? color;
    context.lineTo(position.x, position.y);
    context.stroke();
  }

  function paintShape(
    context: CanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number },
  ) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const radius = Math.max(6, Math.hypot(dx, dy));
    context.globalCompositeOperation = "source-over";
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = Math.min(Math.max(2, radius * 0.09), brushSize);
    context.lineCap = "round";
    context.lineJoin = "round";

    if (tool === "arrow") {
      const angle = Math.atan2(dy, dx);
      const head = Math.min(42, Math.max(8, radius * 0.25));
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.moveTo(end.x, end.y);
      context.lineTo(
        end.x - head * Math.cos(angle - Math.PI / 6),
        end.y - head * Math.sin(angle - Math.PI / 6),
      );
      context.moveTo(end.x, end.y);
      context.lineTo(
        end.x - head * Math.cos(angle + Math.PI / 6),
        end.y - head * Math.sin(angle + Math.PI / 6),
      );
      context.stroke();
      return;
    }

    const centerX = start.x;
    const centerY = start.y;
    const sides = tool === "triangle" ? 3 : tool === "stop" ? 8 : 0;
    context.beginPath();
    if (tool === "circle") {
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    } else if (tool === "square") {
      context.rect(centerX - radius, centerY - radius, radius * 2, radius * 2);
    } else {
      const rotation = tool === "triangle" ? -Math.PI / 2 : Math.PI / 8;
      for (let index = 0; index < sides; index++) {
        const angle = rotation + (index * Math.PI * 2) / sides;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
    }
    if (tool === "stop") {
      context.save();
      context.fillStyle = "#d32f2f";
      context.fill();
      context.strokeStyle = "#ffffff";
      context.lineWidth = Math.max(1.5, radius * 0.08);
      context.stroke();
      context.fillStyle = "#ffffff";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = `800 ${Math.max(5, radius * 0.38)}px Ubuntu, sans-serif`;
      context.fillText("STOP", centerX, centerY);
      context.restore();
    } else if (tool === "circle") {
      context.save();
      context.globalAlpha = 0.16;
      context.fill();
      context.restore();
      context.stroke();
    } else {
      context.stroke();
    }
  }

  function finishDraw(event: ReactPointerEvent<HTMLCanvasElement>) {
    drawing.current = false;
    const start = shapeStart.current;
    const preview = shapePreview.current;
    shapeStart.current = null;
    shapePreview.current = null;
    if (!start || !preview) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    context.putImageData(preview, 0, 0);
    paintShape(context, start, point(event));
  }

  function undo() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const state = history.current.pop();
    if (context && state) {
      context.globalCompositeOperation = "source-over";
      context.putImageData(state, 0, 0);
    }
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas || !hasImage || !name.trim()) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Could not create image.");
      await saveLocalFieldMap({
        id: editingMap?.id ?? crypto.randomUUID(),
        name: name.trim(),
        eventName: eventName.trim(),
        notes: notes.trim(),
        image: blob,
        updatedAt: Date.now(),
      });
      await onSaved();
      setName("");
      setEventName("");
      setNotes("");
      const context = canvas.getContext("2d");
      const baseCanvas = baseCanvasRef.current;
      if (context && baseCanvas) {
        context.globalCompositeOperation = "source-over";
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(baseCanvas, 0, 0);
        history.current = [];
        snapshot();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="map-editor">
      <div className="map-toolbar">
        <label className="upload-button">
          <Upload size={17} /> {hasImage ? "Replace field preset" : "Upload field preset"}
          <input type="file" accept="image/*" onChange={(e) => loadFile(e.target.files?.[0])} />
        </label>
        <button type="button" onClick={() => useRebuiltField().catch(() => undefined)}>
          <MapIcon size={16} /> Use REBUILT
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
          className={tool === "erase" ? "active" : ""}
          onClick={() => setTool("erase")}
        >
          <Eraser size={16} /> Erase
        </button>
        <button
          type="button"
          className={tool === "text" ? "active" : ""}
          onClick={() => setTool("text")}
        >
          <Type size={16} /> Text
        </button>
        {[
          { id: "arrow" as const, label: "Arrow", icon: ArrowRight },
          { id: "stop" as const, label: "Stop", icon: Octagon },
          { id: "square" as const, label: "Square", icon: Square },
          { id: "circle" as const, label: "Circle", icon: Circle },
          { id: "triangle" as const, label: "Triangle", icon: Triangle },
        ].map(({ id, label, icon: ShapeIcon }) => (
          <button
            type="button"
            key={id}
            className={`${tool === id ? "active" : ""} shape-tool shape-${id}`}
            onClick={() => setTool(id)}
          >
            <ShapeIcon size={16} /> {id === "stop" ? "Stop sign" : label}
          </button>
        ))}
        {tool === "text" && (
          <div className="text-tool-options">
            <input
              value={textValue}
              onChange={(event) => setTextValue(event.target.value)}
              placeholder="Text to place"
              aria-label="Text to place"
            />
            {(["#ffffff", "#111111"] as const).map((option) => (
              <button
                type="button"
                key={option}
                className={textColor === option ? "selected" : ""}
                style={{ backgroundColor: option }}
                aria-label={option === "#ffffff" ? "White text" : "Black text"}
                aria-pressed={textColor === option}
                onClick={() => setTextColor(option)}
              />
            ))}
          </div>
        )}
        <div className="drawing-colors" aria-label="Brush color">
          {DRAWING_COLORS.map((option) => (
            <button
              type="button"
              key={option}
              className={color === option ? "selected" : ""}
              style={{ backgroundColor: option }}
              aria-label={`Use ${option}`}
              aria-pressed={color === option}
              onClick={() => setColor(option)}
            />
          ))}
        </div>
        <input
          className="brush-slider"
          type="range"
          min="2"
          max="24"
          value={brushSize}
          onChange={(event) => setBrushSize(Number(event.target.value))}
          aria-label="Brush size"
        />
        <button type="button" onClick={undo}>
          <RotateCcw size={16} /> Undo
        </button>
      </div>
      <div className={`canvas-shell ${hasImage ? "has-image" : ""}`}>
        <canvas
          ref={canvasRef}
          onPointerDown={startDraw}
          onPointerMove={draw}
          onPointerUp={finishDraw}
          onPointerCancel={() => {
            drawing.current = false;
            shapeStart.current = null;
            const context = canvasRef.current?.getContext("2d");
            if (context && shapePreview.current) context.putImageData(shapePreview.current, 0, 0);
            shapePreview.current = null;
          }}
        />
        {!hasImage && (
          <label className="canvas-placeholder">
            <Image size={34} />
            <strong>Drop in a field map</strong>
            <span>PNG or JPG · draw routes, zones, and match notes</span>
            <input type="file" accept="image/*" onChange={(e) => loadFile(e.target.files?.[0])} />
          </label>
        )}
      </div>
      <div className="map-details">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Map name *" />
        <input
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          placeholder="Event or match"
        />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
        <button
          type="button"
          className="primary-button"
          disabled={!hasImage || !name || saving}
          onClick={save}
        >
          {saving ? <Loader2 size={17} className="spin" /> : <Save size={17} />}
          {editingMap ? "Save changes" : "Save annotated map"}
        </button>
      </div>
    </div>
  );
}

function FieldMaps() {
  const [maps, setMaps] = useState<FieldMap[]>([]);
  const [editingMap, setEditingMap] = useState<FieldMap | null>(null);
  const load = useCallback(async () => {
    const stored = await listLocalFieldMaps();
    setMaps((current) => {
      for (const map of current) URL.revokeObjectURL(map.imageUrl);
      return stored.map((map) => ({
        id: map.id,
        name: map.name,
        eventName: map.eventName,
        notes: map.notes,
        imageUrl: URL.createObjectURL(map.image),
        image: map.image,
        updatedAt: map.updatedAt,
      }));
    });
  }, []);
  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  async function remove(id: string) {
    await deleteLocalFieldMap(id);
    await load();
  }

  function edit(map: FieldMap) {
    setEditingMap(map);
    window.setTimeout(
      () => document.querySelector(".map-editor")?.scrollIntoView({ behavior: "smooth" }),
      0,
    );
  }

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Field Maps</h1>
        </div>
      </div>
      <MapCanvas onSaved={load} editingMap={editingMap} />
      <div className="section-title">
        <div>
          <h2>Saved maps</h2>
          <span>{maps.length} saved on this device</span>
        </div>
      </div>
      {maps.length ? (
        <div className="map-grid">
          {maps.map((map) => (
            <article
              className="map-card"
              key={map.id}
              onClick={() => edit(map)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") edit(map);
              }}
            >
              <img src={map.imageUrl} alt={map.name} />
              <div>
                <span className="card-kicker">{map.eventName || "General strategy"}</span>
                <h3>{map.name}</h3>
                <p>{map.notes || "No notes added."}</p>
                <footer>
                  <span>{timeAgo(map.updatedAt)}</span>
                  <button
                    type="button"
                    aria-label={`Delete ${map.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      remove(map.id);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </footer>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={MapIcon} title="No saved maps yet" />
      )}
    </section>
  );
}

function AutoLibrary() {
  const [autos, setAutos] = useState<AutoRoutine[]>([]);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    team: "",
  });
  const [trajectory, setTrajectory] = useState<ParsedTrajectory | null>(null);
  const [trajectoryError, setTrajectoryError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [selectedAuto, setSelectedAuto] = useState<AutoRoutine | null>(null);
  const load = useCallback(async () => {
    const data = await api<{ autos: AutoRoutine[] }>("/autos");
    setAutos(data.autos);
  }, []);
  useEffect(() => {
    load().catch(() => undefined);
    const interval = window.setInterval(() => load().catch(() => undefined), 15_000);
    const refresh = () => load().catch(() => undefined);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    setSaving(true);
    setSaveMessage("");
    try {
      const data = new FormData();
      data.set("name", form.name);
      data.set("team", form.team);
      data.set("description", "");
      data.set("steps", "[]");
      if (trajectory) data.set("image", await trajectoryToPng(trajectory));
      await api("/autos", { method: "POST", body: data });
      setForm({ name: "", team: "" });
      setTrajectory(null);
      setTrajectoryError("");
      setFormOpen(false);
      setSaveMessage("Saved for everyone");
      await load();
      window.setTimeout(() => setSaveMessage(""), 3000);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Could not save this routine.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await api(`/autos/${id}`, { method: "DELETE" });
    await load();
  }

  const filtered = autos.filter((auto) =>
    [auto.name, auto.team, auto.description].join(" ").toLowerCase().includes(search.toLowerCase()),
  );

  async function importTrajectory(file?: File) {
    if (!file) return;
    setTrajectoryError("");
    try {
      const parsed = await parseTrajectoryFile(file);
      setTrajectory(parsed);
      setForm((current) => ({
        ...current,
        name: current.name || parsed.name,
      }));
    } catch (error) {
      setTrajectory(null);
      setTrajectoryError(error instanceof Error ? error.message : "Could not read this route.");
    }
  }

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Auto Library</h1>
        </div>
      </div>
      <div className="library-bar">
        <Search size={17} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by routine or team…"
        />
        <span>{filtered.length} routines</span>
      </div>
      {saveMessage && (
        <div
          className={saveMessage === "Saved for everyone" ? "save-status success" : "save-status"}
        >
          {saveMessage}
        </div>
      )}
      {formOpen && (
        <div className="form-panel">
          <div className="form-panel-heading">
            <div>
              <h2>Add an autonomous routine</h2>
            </div>
            <button type="button" aria-label="Close form" onClick={() => setFormOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <form onSubmit={submit}>
            <label>
              Routine name *
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="3-piece center"
              />
            </label>
            <label>
              Team
              <input
                value={form.team}
                onChange={(e) => setForm({ ...form, team: e.target.value })}
                placeholder="1648"
              />
            </label>
            <label className="wide">
              Choreo or PathPlanner route
              <span className="field-help">
                A .traj or .path file will be plotted automatically.
              </span>
              <span className="trajectory-upload">
                <Upload size={17} />
                {trajectory ? trajectory.name : "Upload trajectory"}
                <input
                  type="file"
                  accept=".traj,.path,.json,application/json"
                  onChange={(event) => importTrajectory(event.target.files?.[0])}
                />
              </span>
              {trajectory && <TrajectoryPreview trajectory={trajectory} />}
              {trajectoryError && <span className="field-error">{trajectoryError}</span>}
            </label>
            <div className="wide form-actions">
              <button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? <Loader2 size={17} className="spin" /> : <Save size={17} />}
                {saving ? "Saving…" : "Save routine"}
              </button>
            </div>
          </form>
        </div>
      )}
      {filtered.length ? (
        <>
          <div className="auto-grid">
            {filtered.map((auto) => (
              <article
                className="auto-card"
                key={auto.id}
                onClick={() => setSelectedAuto(auto)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedAuto(auto);
                  }
                }}
              >
                {auto.imageUrl && (
                  <img
                    className="auto-card-image"
                    src={`${API_URL}${auto.imageUrl}`}
                    alt={`${auto.name} autonomous routine`}
                  />
                )}
                <header>
                  <span className="auto-icon">
                    <G3Logo size={24} />
                  </span>
                  <div>
                    <span>{auto.team ? `Team ${auto.team}` : "Unassigned team"}</span>
                    <h3>{auto.name}</h3>
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete ${auto.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (
                        window.confirm(
                          `Delete “${auto.name}”? This removes it for everyone and cannot be undone.`,
                        )
                      ) {
                        void remove(auto.id);
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </header>
                <p>{auto.description || "No description added."}</p>
                {auto.steps.length > 0 && (
                  <ol>
                    {auto.steps.map((step, index) => (
                      <li key={`${auto.id}-${step}`}>
                        <span>{index + 1}</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                )}
                <footer>
                  <small>{timeAgo(auto.updatedAt)}</small>
                </footer>
              </article>
            ))}
          </div>
          {!search && (
            <div className="build-auto-row">
              <button type="button" className="primary-button" onClick={() => setFormOpen(true)}>
                <Plus size={17} /> Build an auto entry
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={Monitor}
          title={search ? "No routines match" : ""}
          action={
            !search && (
              <button type="button" className="primary-button" onClick={() => setFormOpen(true)}>
                <Plus size={17} /> Build an auto entry
              </button>
            )
          }
        />
      )}
      {selectedAuto && (
        <div
          className="auto-dialog-backdrop"
          role="presentation"
          onClick={() => setSelectedAuto(null)}
        >
          <div
            className="auto-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="selected-auto-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>{selectedAuto.team ? `Team ${selectedAuto.team}` : "Unassigned team"}</span>
                <h2 id="selected-auto-title">{selectedAuto.name}</h2>
              </div>
              <button type="button" aria-label="Close auto" onClick={() => setSelectedAuto(null)}>
                <X size={20} />
              </button>
            </header>
            {selectedAuto.imageUrl && (
              <img
                src={`${API_URL}${selectedAuto.imageUrl}`}
                alt={`${selectedAuto.name} autonomous routine`}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function TrajectoryPreview({ trajectory }: { trajectory: ParsedTrajectory }) {
  const flipY = (y: number) => 8.0692 - y;
  return (
    <div className="trajectory-preview">
      <svg
        viewBox="-0.5 -0.5 17.541 9.0692"
        role="img"
        aria-label={`${trajectory.format} route preview`}
      >
        <image href="/field-2026.svg" x="-0.5" y="-0.5" width="17.541" height="9.0692" />
        <polyline
          className="trajectory-path-outline"
          points={trajectory.points.map((point) => `${point.x},${flipY(point.y)}`).join(" ")}
        />
        <polyline
          className="trajectory-path"
          points={trajectory.points.map((point) => `${point.x},${flipY(point.y)}`).join(" ")}
        />
        <circle
          className="trajectory-start"
          cx={trajectory.points[0].x}
          cy={flipY(trajectory.points[0].y)}
          r="0.1"
        />
        <circle
          className="trajectory-end"
          cx={trajectory.points.at(-1)?.x}
          cy={flipY(trajectory.points.at(-1)?.y ?? 0)}
          r="0.1"
        />
      </svg>
      <span>
        <strong>{trajectory.format}</strong> · {trajectory.points.length} path points
      </span>
    </div>
  );
}

function RobotLibrary() {
  const [robots, setRobots] = useState<RobotTeam[]>([]);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<RobotTeam | null>(null);
  const [teamName, setTeamName] = useState("");
  const [summary, setSummary] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const load = useCallback(async () => {
    const data = await api<{ robots: RobotTeam[] }>("/robots");
    setRobots(data.robots);
    setSelected((current) => data.robots.find((robot) => robot.id === current?.id) ?? current);
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  async function create(event: SyntheticEvent) {
    event.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const data = new FormData();
      data.set("teamName", teamName);
      data.set("summary", summary);
      for (const image of images) data.append("images", image);
      await api("/robots", { method: "POST", body: data });
      setTeamName("");
      setSummary("");
      setImages([]);
      setFormOpen(false);
      await load();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save this team.");
    } finally {
      setSaving(false);
    }
  }

  async function addImages(files: FileList | null) {
    if (!selected || !files?.length) return;
    const data = new FormData();
    for (const file of Array.from(files)) data.append("images", file);
    await api(`/robots/${selected.id}/images`, { method: "POST", body: data });
    await load();
  }

  async function remove(robot: RobotTeam) {
    if (
      !window.confirm(
        `Delete ${robot.teamName} and all of its robot pictures? This removes them for everyone.`,
      )
    )
      return;
    await api(`/robots/${robot.id}`, { method: "DELETE" });
    if (selected?.id === robot.id) setSelected(null);
    await load();
  }

  const filtered = robots.filter((robot) =>
    [robot.teamName, robot.summary].join(" ").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <section className="page robot-library-page">
      <div className="page-heading">
        <div>
          <h1>Robot Library</h1>
        </div>
      </div>
      <div className="library-bar">
        <Search size={17} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by team…"
        />
        <span>{filtered.length} teams</span>
      </div>
      {formOpen && (
        <div className="form-panel">
          <div className="form-panel-heading">
            <h2>Add a team robot</h2>
            <button type="button" aria-label="Close form" onClick={() => setFormOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <form onSubmit={create}>
            {saveError && <div className="wide save-status">{saveError}</div>}
            <label className="wide">
              Team name *
              <input
                required
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                placeholder="Team 1648"
              />
            </label>
            <label className="wide">
              Summary
              <textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="Drivetrain, mechanisms, notable features, and configuration"
              />
            </label>
            <label className="wide robot-image-upload">
              Robot pictures
              <span>
                {images.length ? `${images.length} selected` : "Select one or many images"}
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => setImages(Array.from(event.target.files ?? []))}
              />
            </label>
            <div className="wide form-actions">
              <button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? <Loader2 size={17} className="spin" /> : <Save size={17} />}
                {saving ? "Saving…" : "Save team"}
              </button>
            </div>
          </form>
        </div>
      )}
      {filtered.length ? (
        <>
          <div className="robot-grid">
            {filtered.map((robot) => (
              <article
                className="robot-card"
                key={robot.id}
                onClick={() => setSelected(robot)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") setSelected(robot);
                }}
              >
                {robot.images[0] ? (
                  <img src={`${API_URL}${robot.images[0].url}`} alt={`${robot.teamName} robot`} />
                ) : (
                  <div className="robot-card-placeholder">
                    <Camera size={32} />
                  </div>
                )}
                <div>
                  <h2>{robot.teamName}</h2>
                  <span>{robot.images.length} pictures</span>
                </div>
                <button
                  type="button"
                  aria-label={`Delete ${robot.teamName}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void remove(robot);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
          {!search && (
            <div className="build-auto-row">
              <button type="button" className="primary-button" onClick={() => setFormOpen(true)}>
                <Plus size={17} /> Add a team
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={Camera}
          title={search ? "No teams match" : ""}
          action={
            !search && (
              <button type="button" className="primary-button" onClick={() => setFormOpen(true)}>
                <Plus size={17} /> Add a team
              </button>
            )
          }
        />
      )}
      {selected && (
        <div className="auto-dialog-backdrop" role="presentation" onClick={() => setSelected(null)}>
          <div
            className="robot-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="robot-team-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2 id="robot-team-title">{selected.teamName}</h2>
                <p>{selected.summary || "No summary added."}</p>
              </div>
              <button type="button" aria-label="Close team" onClick={() => setSelected(null)}>
                <X size={20} />
              </button>
            </header>
            <div className="robot-dialog-actions">
              <label className="secondary-button">
                <ImagePlus size={17} /> Add pictures
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => void addImages(event.target.files)}
                />
              </label>
            </div>
            <div className="robot-photo-grid">
              {selected.images.map((image) => (
                <img
                  key={image.id}
                  src={`${API_URL}${image.url}`}
                  alt={`${selected.teamName} robot`}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function App() {
  const [page, setPage] = useState<Page>("overview");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("g3-strategy-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("g3-strategy-theme", theme);
  }, [theme]);

  useEffect(() => {
    api<User>("/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="auth-screen">
        <Loader2 className="spin" />
        <span>Opening strategy workspace…</span>
      </div>
    );
  }

  if (!user) {
    const returnTo = window.location.href;
    return (
      <div className="auth-screen">
        <div className="auth-mark">
          <G3Logo size={38} />
        </div>
        <h1>Strategy starts with G3ID</h1>
        <p>Sign in with your team account to open shared tier lists, field maps, and autos.</p>
        <a href={`${G3ID_URL}/login?redirect=${encodeURIComponent(returnTo)}`}>
          <LogIn size={18} /> Sign in with G3ID
        </a>
      </div>
    );
  }

  const nav = [
    { id: "overview" as const, label: "Overview" },
    { id: "tiers" as const, label: "Tier Lists" },
    { id: "maps" as const, label: "Field Maps" },
    { id: "autos" as const, label: "Auto Library" },
    { id: "robots" as const, label: "Robot Library" },
  ];

  return (
    <div className="app-shell">
      <aside className={menuOpen ? "open" : ""}>
        <div className="brand">
          <span>
            G3 STRATEGY
            <small>Scouting workspace</small>
          </span>
          <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <nav>
          <span className="nav-label">Workspace</span>
          {nav.map(({ id, label }) => (
            <button
              type="button"
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => {
                setPage(id);
                setMenuOpen(false);
              }}
            >
              {label}
              {page === id && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        >
          {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
          {theme === "light" ? "Dark mode" : "Light mode"}
        </button>
        <a className="all-apps-link" href="https://web.g3robotics.com">
          All Apps
        </a>
      </aside>
      {menuOpen && (
        <button
          type="button"
          className="scrim"
          onClick={() => setMenuOpen(false)}
          aria-label="Close"
        />
      )}
      <main>
        <header className="mobile-header">
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu />
          </button>
          <span>G3 Strategy</span>
        </header>
        {page === "overview" && <Overview go={setPage} />}
        {page === "tiers" && <TierLists />}
        {page === "maps" && <FieldMaps />}
        {page === "autos" && <AutoLibrary />}
        {page === "robots" && <RobotLibrary />}
      </main>
    </div>
  );
}
