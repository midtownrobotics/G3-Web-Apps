import {
  ChevronRight,
  CirclePlus,
  Eraser,
  Image,
  Loader2,
  LogIn,
  Map as MapIcon,
  Menu,
  Monitor,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
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
import { deleteLocalFieldMap, listLocalFieldMaps, saveLocalFieldMap } from "./local-field-maps";

type Page = "overview" | "tiers" | "maps" | "autos";
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
  { id: crypto.randomUUID(), name: "C", color: "#48db8a", items: [] },
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
      <h3>{title}</h3>
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
  ];
  return (
    <section className="page overview">
      <div className="hero">
        <div>
          <h1>
            Gears for
            <br />
            <span>Greater Good</span>
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
    <section className="page">
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
                <input
                  type="color"
                  value={tier.color}
                  onChange={(event) => updateTier(tier.id, { color: event.target.value })}
                  aria-label={`${tier.name} color`}
                />
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

function MapCanvas({ onSaved }: { onSaved: () => Promise<void> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const history = useRef<ImageData[]>([]);
  const [hasImage, setHasImage] = useState(false);
  const [color, setColor] = useState("#ef5350");
  const [brushSize, setBrushSize] = useState(7);
  const [tool, setTool] = useState<"draw" | "erase">("draw");
  const [name, setName] = useState("");
  const [eventName, setEventName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function snapshot() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context)
      history.current.push(context.getImageData(0, 0, canvas.width, canvas.height));
  }

  function loadFile(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;
    const image = new window.Image();
    image.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maxWidth = 1400;
      const scale = Math.min(1, maxWidth / image.width);
      canvas.width = image.width * scale;
      canvas.height = image.height * scale;
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      history.current = [];
      snapshot();
      setHasImage(true);
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
      URL.revokeObjectURL(image.src);
    };
    image.src = URL.createObjectURL(file);
  }

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
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const position = point(event);
    context.beginPath();
    context.moveTo(position.x, position.y);
  }

  function draw(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const position = point(event);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = brushSize;
    context.globalCompositeOperation = tool === "erase" ? "destination-out" : "source-over";
    context.strokeStyle = color;
    context.lineTo(position.x, position.y);
    context.stroke();
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
        id: crypto.randomUUID(),
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
      setHasImage(false);
      const context = canvas.getContext("2d");
      context?.clearRect(0, 0, canvas.width, canvas.height);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="map-editor">
      <div className="map-toolbar">
        <label className="upload-button">
          <Upload size={17} /> Upload field image
          <input type="file" accept="image/*" onChange={(e) => loadFile(e.target.files?.[0])} />
        </label>
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
        <input
          className="color-picker"
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
          aria-label="Brush color"
        />
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
          onPointerUp={() => {
            drawing.current = false;
          }}
          onPointerCancel={() => {
            drawing.current = false;
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
          {saving ? <Loader2 size={17} className="spin" /> : <Save size={17} />} Save annotated map
        </button>
      </div>
    </div>
  );
}

function FieldMaps() {
  const [maps, setMaps] = useState<FieldMap[]>([]);
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

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Field Maps</h1>
        </div>
      </div>
      <MapCanvas onSaved={load} />
      <div className="section-title">
        <div>
          <h2>Saved maps</h2>
          <span>{maps.length} saved on this device</span>
        </div>
      </div>
      {maps.length ? (
        <div className="map-grid">
          {maps.map((map) => (
            <article className="map-card" key={map.id}>
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
                    onClick={() => remove(map.id)}
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
    description: "",
    steps: "",
  });
  const [image, setImage] = useState<File | null>(null);
  const load = useCallback(async () => {
    const data = await api<{ autos: AutoRoutine[] }>("/autos");
    setAutos(data.autos);
  }, []);
  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    const data = new FormData();
    data.set("name", form.name);
    data.set("team", form.team);
    data.set("description", form.description);
    data.set(
      "steps",
      JSON.stringify(
        form.steps
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    );
    if (image) data.set("image", image);
    await api("/autos", { method: "POST", body: data });
    setForm({ name: "", team: "", description: "", steps: "" });
    setImage(null);
    setFormOpen(false);
    await load();
  }

  async function remove(id: string) {
    await api(`/autos/${id}`, { method: "DELETE" });
    await load();
  }

  const filtered = autos.filter((auto) =>
    [auto.name, auto.team, auto.description].join(" ").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Auto Library</h1>
        </div>
        <button type="button" className="primary-button" onClick={() => setFormOpen(true)}>
          <Plus size={17} /> Add routine
        </button>
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
              Description
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What this auto accomplishes"
              />
            </label>
            <label className="wide">
              Image · optional
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setImage(event.target.files?.[0] ?? null)}
              />
            </label>
            <label className="wide">
              Steps · one per line
              <textarea
                value={form.steps}
                onChange={(e) => setForm({ ...form, steps: e.target.value })}
                placeholder={"Score preload\nCollect center game piece\nReturn and score"}
              />
            </label>
            <div className="wide form-actions">
              <button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="primary-button">
                <Save size={17} /> Save routine
              </button>
            </div>
          </form>
        </div>
      )}
      {filtered.length ? (
        <div className="auto-grid">
          {filtered.map((auto) => (
            <article className="auto-card" key={auto.id}>
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
                  onClick={() => remove(auto.id)}
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
      ) : (
        <EmptyState
          icon={Monitor}
          title={search ? "No routines match" : "Build the first auto entry"}
          action={
            !search && (
              <button type="button" className="primary-button" onClick={() => setFormOpen(true)}>
                <Plus size={17} /> Add routine
              </button>
            )
          }
        />
      )}
    </section>
  );
}

export function App() {
  const [page, setPage] = useState<Page>("overview");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

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
      </main>
    </div>
  );
}
