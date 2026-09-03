import {
  AlertCircle,
  CalendarClock,
  Check,
  CheckCircle2,
  GripVertical,
  Pencil,
  Plus,
  Save,
  Shield,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  type RefObject,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { FormFieldMap } from "./FormFieldMap";
import { Operations } from "./Operations";
import { api } from "./api";

export type FieldType =
  | "shortText"
  | "longText"
  | "mcq"
  | "slider"
  | "fieldMap"
  | "multiSelect"
  | "counter";
export type ScoutingField = {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[];
  min: number;
  max: number;
  step: number;
};
export type ScoutingForm = {
  id: string;
  name: string;
  description: string;
  fields: ScoutingField[];
  isActive: boolean;
  kind: "scouting" | "pit";
};
type UserOption = { id: string; displayName: string; email: string; status: string };
type StrategyAdmin = { user_id: string; display_name: string; email: string };

const TYPES: { type: FieldType; label: string }[] = [
  { type: "shortText", label: "Text entry — short" },
  { type: "longText", label: "Text entry — long" },
  { type: "mcq", label: "Multiple choice" },
  { type: "slider", label: "Slider" },
  { type: "fieldMap", label: "Field map drawing" },
  { type: "multiSelect", label: "Multiple select" },
  { type: "counter", label: "Counter" },
];

const COUNTER_INTERVALS = [1, 5, 10, 20] as const;

function FieldInput({
  field,
  value,
  setValue,
  canvasRef,
}: {
  field: ScoutingField;
  value: unknown;
  setValue: (value: unknown) => void;
  canvasRef?: RefObject<HTMLCanvasElement | null>;
}) {
  const inputId = `field-${field.id}`;
  const [counterInterval, setCounterInterval] = useState<(typeof COUNTER_INTERVALS)[number]>(1);
  if (field.type === "fieldMap" && canvasRef) return <FormFieldMap canvasRef={canvasRef} />;
  if (field.type === "counter") {
    const current = Number(value ?? 0);
    return (
      <div className="counter-control">
        <p className="control-help">Choose the amount each tap changes, then add or subtract.</p>
        <div className="counter-intervals" aria-label="Counter interval">
          {COUNTER_INTERVALS.map((interval) => (
            <button
              type="button"
              className={counterInterval === interval ? "active" : ""}
              key={interval}
              onClick={() => setCounterInterval(interval)}
              aria-pressed={counterInterval === interval}
            >
              ±{interval}
            </button>
          ))}
        </div>
        <div className="counter-input">
          <button
            type="button"
            aria-label={`Subtract ${counterInterval}`}
            onClick={() => setValue(current - counterInterval)}
          >
            −{counterInterval}
          </button>
          <strong aria-live="polite">{current}</strong>
          <button
            type="button"
            aria-label={`Add ${counterInterval}`}
            onClick={() => setValue(current + counterInterval)}
          >
            +{counterInterval}
          </button>
        </div>
      </div>
    );
  }
  if (field.type === "slider")
    return (
      <div className="slider-control">
        <p className="control-help">
          Drag the slider to choose a value from {field.min} to {field.max}.
        </p>
        <div className="slider-input">
          <input
            id={inputId}
            type="range"
            min={field.min}
            max={field.max}
            step={field.step}
            value={Number(value ?? field.min)}
            onChange={(event) => setValue(Number(event.target.value))}
          />
          <output>{String(value ?? field.min)}</output>
        </div>
      </div>
    );
  if (field.type === "longText")
    return (
      <textarea
        id={inputId}
        required={field.required}
        value={String(value ?? "")}
        onChange={(event) => setValue(event.target.value)}
      />
    );
  if (field.type === "mcq")
    return (
      <select
        id={inputId}
        required={field.required}
        value={String(value ?? "")}
        onChange={(event) => setValue(event.target.value)}
      >
        <option value="">Select…</option>
        {field.options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    );
  if (field.type === "multiSelect") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="multi-select-control">
        <p className="control-help">
          Select every option that applies. You may choose more than one.
        </p>
        <div className="multi-select">
          {field.options.map((option) => (
            <label key={option}>
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={(event) =>
                  setValue(
                    event.target.checked
                      ? [...selected, option]
                      : selected.filter((item) => item !== option),
                  )
                }
              />{" "}
              {option}
            </label>
          ))}
        </div>
      </div>
    );
  }
  return (
    <input
      id={inputId}
      type="text"
      required={field.required}
      value={String(value ?? "")}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}

function EntryForm({ form, scoutName }: { form: ScoutingForm; scoutName: string }) {
  const [teamName, setTeamName] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [saving, setSaving] = useState(false);
  const canvases = useRef<Record<string, HTMLCanvasElement | null>>({});
  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const payload = new FormData();
      payload.set("teamName", teamName);
      payload.set("answers", JSON.stringify(answers));
      for (const field of form.fields.filter((item) => item.type === "fieldMap")) {
        const canvas = canvases.current[field.id];
        if (canvas) {
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/png"),
          );
          if (blob) payload.set(`drawing:${field.id}`, blob, `${field.id}.png`);
        }
      }
      await api(`/scouting-forms/${form.id}/submissions`, { method: "POST", body: payload });
      setTeamName("");
      setAnswers({});
      setMessageType("success");
      setMessage("Report submitted.");
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "Could not submit report.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="scouting-entry" onSubmit={submit}>
      <div className="scouting-form-title">
        <h2>{form.name}</h2>
        <span className="scout-identity">Scout: {scoutName}</span>
      </div>
      <label className="team-entry" htmlFor={`team-${form.id}`}>
        <span>
          Team number <b>*</b>
        </span>
        <input
          id={`team-${form.id}`}
          required
          inputMode="numeric"
          pattern="[0-9]+"
          value={teamName}
          onChange={(event) => setTeamName(event.target.value)}
          placeholder="Team number"
        />
      </label>
      <div className="scouting-questions">
        {form.fields.map((field) => {
          const mapRef =
            field.type === "fieldMap"
              ? {
                  get current() {
                    return canvases.current[field.id] ?? null;
                  },
                  set current(value: HTMLCanvasElement | null) {
                    canvases.current[field.id] = value;
                  },
                }
              : undefined;
          return (
            <div
              className={`scouting-question ${field.type === "fieldMap" ? "wide" : ""}`}
              key={field.id}
            >
              <label htmlFor={`field-${field.id}`}>
                {field.label}
                {field.required && <b> *</b>}
              </label>
              <FieldInput
                field={field}
                value={answers[field.id]}
                setValue={(value) => setAnswers((current) => ({ ...current, [field.id]: value }))}
                canvasRef={mapRef}
              />
            </div>
          );
        })}
      </div>
      <button type="submit" className="primary-button" disabled={saving}>
        <Check size={17} /> {saving ? "Submitting…" : "Submit report"}
      </button>
      {message && (
        <div className={`status-toast ${messageType}`} role="status" aria-live="polite">
          {messageType === "success" ? <CheckCircle2 size={21} /> : <AlertCircle size={21} />}
          <div>
            <strong>{messageType === "success" ? "Success" : "Couldn’t submit"}</strong>
            <span>{message}</span>
          </div>
          <button type="button" onClick={() => setMessage("")} aria-label="Dismiss notification">
            <X size={17} />
          </button>
        </div>
      )}
    </form>
  );
}

function Editor({
  form,
  save,
  close,
}: { form: ScoutingForm; save: (form: ScoutingForm) => Promise<void>; close: () => void }) {
  const [draft, setDraft] = useState({
    ...form,
    fields: form.fields.map((field) => ({ ...field, required: false })),
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  function patch(id: string, change: Partial<ScoutingField>) {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field) => (field.id === id ? { ...field, ...change } : field)),
    }));
  }
  return (
    <div className="form-designer editor-card">
      <div className="form-designer-toolbar">
        <div>
          <h2>Edit {draft.name}</h2>
        </div>
        <button type="button" className="secondary-button" onClick={close}>
          <X size={16} /> Close
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={async () => {
            if (
              !window.confirm(
                `Save these changes to ${draft.name}? Scouts will see the updated form immediately.`,
              )
            )
              return;
            setSaving(true);
            setSaveError("");
            try {
              await save(draft);
            } catch (error) {
              setSaveError(error instanceof Error ? error.message : "Could not save this form.");
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
        >
          <Save size={16} /> {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
      {saveError && (
        <div className="editor-save-error" role="alert">
          <AlertCircle size={18} /> {saveError}
        </div>
      )}
      <div className="designer-field-list">
        {draft.fields.map((field, index) => (
          <div
            className="designer-field"
            key={field.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (!draggedFieldId || draggedFieldId === field.id) return;
              setDraft((current) => {
                const from = current.fields.findIndex((item) => item.id === draggedFieldId);
                const to = current.fields.findIndex((item) => item.id === field.id);
                if (from < 0 || to < 0) return current;
                const fields = [...current.fields];
                const [moved] = fields.splice(from, 1);
                fields.splice(to, 0, moved);
                return { ...current, fields };
              });
              setDraggedFieldId(null);
            }}
          >
            <button
              type="button"
              className="field-drag-handle"
              draggable
              onDragStart={(event) => {
                setDraggedFieldId(field.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => setDraggedFieldId(null)}
              aria-label={`Drag question ${index + 1} to reorder`}
              title="Drag to reorder"
            >
              <GripVertical size={18} />
              <span>{index + 1}</span>
            </button>
            <input
              value={field.label}
              onChange={(event) => patch(field.id, { label: event.target.value })}
              placeholder="Question"
            />
            <select
              value={field.type}
              onChange={(event) => patch(field.id, { type: event.target.value as FieldType })}
            >
              {TYPES.map((item) => (
                <option key={item.type} value={item.type}>
                  {item.label}
                </option>
              ))}
            </select>
            {(field.type === "mcq" || field.type === "multiSelect") && (
              <input
                value={field.options.join(", ")}
                onChange={(event) =>
                  patch(field.id, {
                    options: event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Choices, comma separated"
              />
            )}
            {field.type === "slider" && (
              <div className="number-settings">
                <label>
                  <span>Minimum</span>
                  <input
                    type="number"
                    value={field.min}
                    onChange={(event) => patch(field.id, { min: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Maximum</span>
                  <input
                    type="number"
                    value={field.max}
                    onChange={(event) => patch(field.id, { max: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Step</span>
                  <input
                    type="number"
                    min="0.01"
                    value={field.step}
                    onChange={(event) => patch(field.id, { step: Number(event.target.value) })}
                  />
                </label>
              </div>
            )}
            <div className="field-actions">
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    fields: draft.fields.filter((item) => item.id !== field.id),
                  })
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="add-field-button"
        onClick={() =>
          setDraft({
            ...draft,
            fields: [
              ...draft.fields,
              {
                id: crypto.randomUUID(),
                label: "New question",
                type: "shortText",
                required: false,
                options: [],
                min: 0,
                max: 10,
                step: 1,
              },
            ],
          })
        }
      >
        <Plus size={17} /> Add question
      </button>
    </div>
  );
}

function AdminManager({ isG3IdAdmin }: { isG3IdAdmin: boolean }) {
  const [admins, setAdmins] = useState<StrategyAdmin[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [userId, setUserId] = useState("");
  const load = useCallback(async () => {
    const result = await api<{ admins: StrategyAdmin[]; users: UserOption[] }>("/strategy-admins");
    setAdmins(result.admins);
    setUsers(result.users);
  }, []);
  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);
  return (
    <details className="strategy-admins">
      <summary>
        <Shield size={17} /> Strategy leads
      </summary>
      {isG3IdAdmin && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!window.confirm("Make this person a Strategy lead?")) return;
            await api("/strategy-admins", { method: "POST", body: JSON.stringify({ userId }) });
            setUserId("");
            await load();
          }}
        >
          <select required value={userId} onChange={(event) => setUserId(event.target.value)}>
            <option value="">Select a G3ID user</option>
            {users
              .filter(
                (user) =>
                  user.status === "active" && !admins.some((admin) => admin.user_id === user.id),
              )
              .map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName} ({user.email})
                </option>
              ))}
          </select>
          <button className="primary-button" type="submit">
            <Plus size={16} /> Add admin
          </button>
        </form>
      )}
      <div className="strategy-admin-list">
        {admins.map((admin) => (
          <span key={admin.user_id}>
            {admin.display_name}
            <small>{admin.email}</small>
            {isG3IdAdmin && (
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm(`Remove ${admin.display_name} as a Strategy lead?`)) return;
                  await api(`/strategy-admins/${admin.user_id}`, { method: "DELETE" });
                  await load();
                }}
              >
                <X size={14} />
              </button>
            )}
          </span>
        ))}
      </div>
    </details>
  );
}

function ServiceIssueReport() {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState({ teamName: "", issueType: "mechanical", description: "" });
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  if (!open)
    return (
      <button type="button" className="service-issue-launch" onClick={() => setOpen(true)}>
        Report a robot breakdown
      </button>
    );
  return (
    <form
      className="service-issue-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          !window.confirm(
            `Alert the service crew about a ${report.issueType} issue for team ${report.teamName}?`,
          )
        )
          return;
        try {
          await api("/service-tickets", { method: "POST", body: JSON.stringify(report) });
          setMessageType("success");
          setMessage("Service crew alerted through Slack.");
          setReport({ teamName: "", issueType: "mechanical", description: "" });
        } catch (error) {
          setMessageType("error");
          setMessage(error instanceof Error ? error.message : "Could not alert the service crew.");
        }
      }}
    >
      <div>
        <strong>Robot breakdown ticket</strong>
      </div>
      <input
        required
        inputMode="numeric"
        pattern="[0-9]+"
        value={report.teamName}
        onChange={(event) => setReport({ ...report, teamName: event.target.value })}
        placeholder="Team number"
      />
      <select
        value={report.issueType}
        onChange={(event) => setReport({ ...report, issueType: event.target.value })}
      >
        <option value="mechanical">Mechanical</option>
        <option value="electrical">Electrical</option>
        <option value="programming">Programming</option>
        <option value="other">Other</option>
      </select>
      <input
        value={report.description}
        onChange={(event) => setReport({ ...report, description: event.target.value })}
        placeholder="What appears to be broken?"
      />
      <button type="submit" className="primary-button">
        Alert helpers
      </button>
      <button type="button" className="secondary-button" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {message && (
        <div className={`status-toast ${messageType}`} role="status" aria-live="polite">
          {messageType === "success" ? <CheckCircle2 size={21} /> : <AlertCircle size={21} />}
          <div>
            <strong>{messageType === "success" ? "Helpers alerted" : "Alert failed"}</strong>
            <span>{message}</span>
          </div>
          <button type="button" onClick={() => setMessage("")} aria-label="Dismiss notification">
            <X size={17} />
          </button>
        </div>
      )}
    </form>
  );
}

type EventMatch = {
  key: string;
  label: string;
  matchNumber: number;
  scheduledAt: number | null;
  teams: string[];
};
type EventContext = {
  eventKey: string;
  currentMatchNumber: number | null;
  currentMatch: EventMatch | null;
  nextTeamMatch: EventMatch | null;
  teamSchedule: EventMatch[];
  onlineAdmins: { user_id: string; display_name: string; last_seen_at: number }[];
  scheduleError: string;
};

function EventStatus({ isAdmin }: { isAdmin: boolean }) {
  const [context, setContext] = useState<EventContext | null>(null);
  const [eventKey, setEventKey] = useState("");
  const [matchNumber, setMatchNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    const result = await api<EventContext>("/event-context");
    setContext(result);
    setEventKey(result.eventKey);
    setMatchNumber(result.currentMatchNumber?.toString() ?? "");
  }, []);
  useEffect(() => {
    load().catch(() => undefined);
    const interval = window.setInterval(() => load().catch(() => undefined), 30_000);
    return () => window.clearInterval(interval);
  }, [load]);
  const next = context?.nextTeamMatch;
  return (
    <div className="event-context">
      <div className="next-match-status">
        <CalendarClock size={20} />
        <div>
          <span>Next Team 1648 match</span>
          <strong>{next?.label ?? "Schedule unavailable"}</strong>
          {next?.scheduledAt && <time>{new Date(next.scheduledAt).toLocaleString()}</time>}
        </div>
      </div>
      {isAdmin && (
        <section className="event-admin-panel">
          <header>
            <h2>Event &amp; TBA Configuration</h2>
            <p>Team 1648 match timing and schedule data for the active event.</p>
          </header>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!window.confirm("Update the active TBA event and current match?")) return;
              setSaving(true);
              await api("/event-context", {
                method: "PUT",
                body: JSON.stringify({ eventKey, currentMatchNumber: matchNumber }),
              }).finally(() => setSaving(false));
              await load();
            }}
          >
            <label>
              <strong>TBA Event Key</strong>
              <input
                value={eventKey}
                onChange={(event) => setEventKey(event.target.value)}
                placeholder="e.g. 2026gacmp"
              />
              <span>The year and event code used by The Blue Alliance.</span>
            </label>
            <label>
              <strong>Current Match</strong>
              <input
                type="number"
                min="1"
                value={matchNumber}
                onChange={(event) => setMatchNumber(event.target.value)}
                placeholder="Automatic"
              />
              <span>Override the current qualification match, or leave blank for automatic.</span>
            </label>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Updating…" : "Update event"}
            </button>
          </form>
          {context?.currentMatch && <p>Current: {context.currentMatch.label}</p>}
          {context?.scheduleError && <p className="event-error">{context.scheduleError}</p>}
          <div className="online-admins">
            <strong>
              <Users size={16} /> Online Strategy leads
            </strong>
            <span>
              {context?.onlineAdmins.length
                ? context.onlineAdmins.map((admin) => admin.display_name).join(", ")
                : "No other Strategy leads online"}
            </span>
          </div>
          <details className="team-schedule">
            <summary>Team 1648 schedule</summary>
            {context?.teamSchedule.map((match) => (
              <div key={match.key}>
                <strong>{match.label}</strong>
                <span>{match.teams.join(" · ")}</span>
                {match.scheduledAt && <time>{new Date(match.scheduledAt).toLocaleString()}</time>}
              </div>
            ))}
          </details>
        </section>
      )}
    </div>
  );
}

export function ScoutingForms({
  isAdmin,
  isG3IdAdmin,
  scoutName,
  canManageServiceCrew,
}: {
  isAdmin: boolean;
  isG3IdAdmin: boolean;
  scoutName: string;
  canManageServiceCrew: boolean;
}) {
  const [forms, setForms] = useState<ScoutingForm[]>([]);
  const [selected, setSelected] = useState<ScoutingForm | null>(null);
  const [editing, setEditing] = useState(false);
  const load = useCallback(async () => {
    const result = await api<{ forms: ScoutingForm[] }>("/scouting-forms");
    setForms(result.forms);
    setSelected(
      (current) => result.forms.find((form) => form.id === current?.id) ?? result.forms[0] ?? null,
    );
  }, []);
  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);
  return (
    <section className="page scouting-forms-page">
      <div className="page-heading">
        <div>
          <h1>Scouting Forms</h1>
        </div>
        <EventStatus isAdmin={isAdmin} />
      </div>
      {isAdmin && <AdminManager isG3IdAdmin={isG3IdAdmin} />}
      <div className="form-choice-grid">
        {forms.map((form) => (
          <div
            className={selected?.id === form.id ? "form-choice active" : "form-choice"}
            key={form.id}
          >
            <button
              type="button"
              onClick={() => {
                setSelected(form);
                setEditing(false);
              }}
            >
              <strong>{form.name}</strong>
            </button>
            {isAdmin && (
              <button
                type="button"
                className="edit-form-button"
                onClick={() => {
                  setSelected(form);
                  setEditing(true);
                }}
              >
                <Pencil size={15} /> Edit
              </button>
            )}
          </div>
        ))}
      </div>
      {selected &&
        (editing && isAdmin ? (
          <Editor
            key={selected.id}
            form={selected}
            close={() => setEditing(false)}
            save={async (form) => {
              await api(`/scouting-forms/${form.id}`, {
                method: "PUT",
                body: JSON.stringify(form),
              });
              await load();
              setEditing(false);
            }}
          />
        ) : (
          <EntryForm key={selected.id} form={selected} scoutName={scoutName} />
        ))}
      {selected?.kind === "pit" &&
        (canManageServiceCrew ? <Operations embedded /> : <ServiceIssueReport />)}
    </section>
  );
}
