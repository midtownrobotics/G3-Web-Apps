import { useCallback, useEffect, useMemo, useState } from "react";
import type { InstanceRow } from "../../shared/derive";
import { deletePartFile, fetchPartFiles } from "../../shared/getters";
import type { PartDefinition, PartFile } from "../../shared/types";
import { useKiosk } from "../../shared/use-auth";
import type { ShopData } from "../../shared/use-shop-data";
import { useUserNames } from "../../shared/use-user-names";
import {
  AssignmentGroup,
  CountInput,
  DownloadLink,
  ErrorText,
  FileMeta,
  InProductionBadge,
  NoticeText,
  UploadButton,
  assignCount,
  confirmDeleteFile,
  formatBytes,
  freeInstancesByPart,
  partLabelOf,
  uploadAndAssign,
} from "./part-files-panel";

/** The whole file library: upload, assign instance counts across parts, unassign, delete. */
export function PartFilesSection({
  data,
  inProduction,
}: {
  data: ShopData | null;
  inProduction: InstanceRow[];
}) {
  const kiosk = useKiosk();
  const [files, setFiles] = useState<PartFile[]>([]);
  const [search, setSearch] = useState("");
  const [uploadTarget, setUploadTarget] = useState<PartTarget>(EMPTY_TARGET);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const resolveName = useUserNames(files.map((f) => f.uploadedBy));

  const load = useCallback(async () => {
    try {
      setFiles(await fetchPartFiles());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load part files.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const definitionById = useMemo(
    () => new Map((data?.definitions ?? []).map((d) => [d.id, d])),
    [data],
  );
  const productionById = useMemo(
    () => new Map(inProduction.map((r) => [r.instance.id, r])),
    [inProduction],
  );
  const usageOf = (f: PartFile) =>
    f.assignments.flatMap((a) => productionById.get(a.partInstanceId) ?? []);

  const free = useMemo(() => freeInstancesByPart(data?.instances ?? [], files), [data, files]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return files;
    return files.filter(
      (f) =>
        f.filename.toLowerCase().includes(q) ||
        f.assignments.some((a) => {
          const d = definitionById.get(a.partDefinitionId);
          return (
            !!d && (partLabelOf(d).toLowerCase().includes(q) || d.name?.toLowerCase().includes(q))
          );
        }),
    );
  }, [files, search, definitionById]);

  async function run(action: () => Promise<string[] | string | null | undefined>) {
    setBusy(true);
    setError(null);
    setNotices([]);
    try {
      const result = await action();
      if (typeof result === "string") setNotices([result]);
      else if (Array.isArray(result)) setNotices(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const resolve = (t: PartTarget) => resolvePartTarget(t, data?.definitions ?? []);

  function handleUpload(selected: File[]) {
    if (selected.length === 0) return;
    const blank = !uploadTarget.partNumber.trim() && !uploadTarget.revision.trim();
    const target = blank ? null : resolve(uploadTarget);
    if (target && "error" in target) {
      setError(target.error);
      return;
    }
    run(async () => {
      const result = await uploadAndAssign(
        selected,
        target?.definition ?? null,
        Number(uploadTarget.count) || 0,
      );
      if (result.error) throw new Error(result.error);
      if (!blank) setUploadTarget(EMPTY_TARGET);
      return result.notices;
    });
  }

  const totalSize = files.reduce((sum, f) => sum + f.fileSize, 0);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink">Part Files</h2>
          <p className="text-xs text-steel">
            {files.length} file{files.length === 1 ? "" : "s"} · {formatBytes(totalSize)}
          </p>
        </div>
        {!kiosk.active && (
          <div className="flex flex-wrap items-center gap-2">
            <PartTargetFields
              value={uploadTarget}
              onChange={setUploadTarget}
              freeCount={(d) => free.get(d.id) ?? 0}
              definitions={data?.definitions ?? []}
              optionalHint="Leave blank to upload without assigning"
            />
            <UploadButton busy={busy} onFiles={handleUpload} />
          </div>
        )}
      </div>

      {error && <ErrorText message={error} />}
      {notices.map((n) => (
        <NoticeText key={n} message={n} />
      ))}

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by filename, part number, or part name…"
        className="w-full bg-paper border border-steel/40 rounded-lg px-3 py-2 text-sm text-ink placeholder-steel focus:outline-none focus:border-crimson"
      />

      {visible.length === 0 ? (
        <div className="bg-paper border border-steel/30 rounded-lg p-6 text-center">
          <p className="text-steel text-sm">
            {files.length === 0 ? "No part files uploaded yet." : "No files match your search."}
          </p>
        </div>
      ) : (
        <ul className="bg-paper border border-steel/30 rounded-lg divide-y divide-steel/20">
          {visible.map((file) => {
            const partIds = [...new Set(file.assignments.map((a) => a.partDefinitionId))];
            return (
              <li key={file.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate" title={file.filename}>
                      {file.filename}
                    </p>
                    <FileMeta file={file} uploader={resolveName(file.uploadedBy)} />
                  </div>
                  <InProductionBadge rows={usageOf(file)} />
                  <DownloadLink file={file} />
                  {!kiosk.active && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirmDeleteFile(file, usageOf(file))) {
                          run(() => deletePartFile(file.id).then(() => null));
                        }
                      }}
                      disabled={busy}
                      className="px-2.5 py-1 text-xs font-medium border border-crimson/40 text-crimson hover:bg-crimson-tint rounded transition-colors disabled:opacity-50 shrink-0"
                    >
                      Delete
                    </button>
                  )}
                </div>

                {partIds.length === 0 && (
                  <p className="text-xs text-steel">Not assigned to any instances.</p>
                )}
                {partIds.map((id) => {
                  const d = definitionById.get(id);
                  if (!d) return null;
                  return (
                    <div key={id} className="pl-3 border-l-2 border-steel/25 space-y-1">
                      <p className="text-xs font-semibold text-ink">
                        <span className="font-mono">{partLabelOf(d)}</span>
                        {d.name && <span className="font-normal text-steel-dark"> — {d.name}</span>}
                      </p>
                      <AssignmentGroup
                        file={file}
                        definition={d}
                        canEdit={!kiosk.active}
                        busy={busy}
                        run={run}
                      />
                    </div>
                  );
                })}

                {!kiosk.active && (
                  <AssignToPart
                    busy={busy}
                    definitions={data?.definitions ?? []}
                    freeCount={(d) => free.get(d.id) ?? 0}
                    onError={setError}
                    onAssign={(d, count) => {
                      // Adding to a part the file already covers grows its count on that part.
                      const already = file.assignments.filter(
                        (a) => a.partDefinitionId === d.id,
                      ).length;
                      run(() => assignCount(file.id, d, already + count));
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type PartTarget = { partNumber: string; revision: string; count: string };
const EMPTY_TARGET: PartTarget = { partNumber: "", revision: "", count: "" };

/** Matches typed part number + revision (case-insensitive) to a non-obsolete part. */
function resolvePartTarget(
  t: PartTarget,
  definitions: PartDefinition[],
): { definition: PartDefinition } | { error: string } {
  const partNumber = t.partNumber.trim().toLowerCase();
  const revision = t.revision.trim().toLowerCase();
  if (!partNumber || !revision) return { error: "Enter both a part number and a revision." };
  const matches = definitions.filter(
    (d) =>
      d.onshapePartNumber.trim().toLowerCase() === partNumber &&
      (d.revision ?? "").trim().toLowerCase() === revision,
  );
  const label = `${t.partNumber.trim()} Rev ${t.revision.trim()}`;
  if (matches.length === 0) return { error: `No part ${label} exists in the shop.` };
  const active = matches.find((d) => !d.isObsolete);
  if (!active) return { error: `${label} is obsolete.` };
  if (!(Number(t.count) > 0)) return { error: "Enter how many instances to assign." };
  return { definition: active };
}

function PartTargetFields({
  value,
  onChange,
  definitions,
  freeCount,
  optionalHint,
}: {
  value: PartTarget;
  onChange: (v: PartTarget) => void;
  definitions: PartDefinition[];
  freeCount: (d: PartDefinition) => number;
  optionalHint?: string;
}) {
  const filled = value.partNumber.trim() && value.revision.trim();
  const match = filled ? resolvePartTarget({ ...value, count: "1" }, definitions) : null;
  const inputClass =
    "bg-paper border border-steel/40 rounded-lg px-2.5 py-1.5 text-xs text-ink placeholder-steel focus:outline-none focus:border-crimson";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        type="text"
        value={value.partNumber}
        onChange={(e) => onChange({ ...value, partNumber: e.target.value })}
        placeholder="Part number"
        aria-label="Part number"
        className={`${inputClass} w-36 font-mono`}
      />
      <input
        type="text"
        value={value.revision}
        onChange={(e) => onChange({ ...value, revision: e.target.value })}
        placeholder="Rev"
        aria-label="Revision"
        className={`${inputClass} w-14 font-mono`}
      />
      <CountInput value={value.count} onChange={(count) => onChange({ ...value, count })} />
      <span className="text-xs text-steel-dark">instances</span>
      <span className="text-xs text-steel w-full sm:w-auto">
        {match === null
          ? optionalHint
          : "error" in match
            ? match.error
            : `${match.definition.name ? `${match.definition.name} · ` : ""}${freeCount(match.definition)} without a file`}
      </span>
    </div>
  );
}

function AssignToPart({
  busy,
  definitions,
  freeCount,
  onAssign,
  onError,
}: {
  busy: boolean;
  definitions: PartDefinition[];
  freeCount: (d: PartDefinition) => number;
  onAssign: (d: PartDefinition, count: number) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<PartTarget>(EMPTY_TARGET);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-steel-dark hover:text-crimson underline"
      >
        + Assign to a part by number
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <PartTargetFields
        value={target}
        onChange={setTarget}
        definitions={definitions}
        freeCount={freeCount}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          const resolved = resolvePartTarget(target, definitions);
          if ("error" in resolved) {
            onError(resolved.error);
            return;
          }
          onAssign(resolved.definition, Number(target.count));
          setTarget(EMPTY_TARGET);
          setOpen(false);
        }}
        className="px-2.5 py-1 text-xs font-semibold bg-crimson hover:bg-crimson-dark text-paper rounded-lg transition-colors disabled:opacity-50"
      >
        Assign
      </button>
      <button
        type="button"
        onClick={() => {
          setTarget(EMPTY_TARGET);
          setOpen(false);
        }}
        className="px-2 py-1 text-xs text-steel hover:text-ink"
      >
        Cancel
      </button>
    </div>
  );
}
