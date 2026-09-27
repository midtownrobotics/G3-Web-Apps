import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deletePartFile,
  fetchPartDefinitions,
  fetchPartFiles,
  linkPartFile,
} from "../../shared/getters";
import type { PartDefinition, PartFile, PartFileLink } from "../../shared/types";
import { useKiosk } from "../../shared/use-auth";
import { useUserNames } from "../../shared/use-user-names";
import {
  DownloadLink,
  ErrorText,
  FileMeta,
  UploadButton,
  confirmAndUnlink,
  formatBytes,
  linkLabel,
  uploadFiles,
} from "./part-files-panel";

const keyOf = (l: PartFileLink) => `${l.partNumber}\u0000${l.revision}`;

/** Every stored part file with its links; upload to, link to, and unlink from any revision. */
export function PartFilesSection() {
  const kiosk = useKiosk();
  const [files, setFiles] = useState<PartFile[]>([]);
  const [parts, setParts] = useState<PartDefinition[]>([]);
  const [uploadTarget, setUploadTarget] = useState("");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    fetchPartDefinitions()
      .then(setParts)
      .catch(() => {});
  }, [load]);

  // One target per part revision that exists in the shop, sorted by part number then revision.
  const targets = useMemo(() => {
    const byKey = new Map<string, { link: PartFileLink; name: string }>();
    for (const p of parts) {
      if (!p.revision) continue;
      const link = { partNumber: p.onshapePartNumber, revision: p.revision };
      byKey.set(keyOf(link), { link, name: p.name });
    }
    return [...byKey.entries()].sort(
      ([, a], [, b]) =>
        a.link.partNumber.localeCompare(b.link.partNumber) ||
        a.link.revision.localeCompare(b.link.revision),
    );
  }, [parts]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return files;
    return files.filter(
      (f) =>
        f.filename.toLowerCase().includes(q) ||
        f.links.some((l) => linkLabel(l).toLowerCase().includes(q)),
    );
  }, [files, search]);

  async function run(fileId: number | null, action: () => Promise<unknown>) {
    setBusyId(fileId);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleUpload(selected: File[]) {
    const target = targets.find(([k]) => k === uploadTarget)?.[1].link;
    if (!target || selected.length === 0) return;
    setUploading(true);
    setError(await uploadFiles(selected, target.partNumber, target.revision));
    await load();
    setUploading(false);
  }

  function handleDelete(file: PartFile) {
    const n = file.links.length;
    const message = `Delete ${file.filename} everywhere? It's linked to ${n} part${n === 1 ? "" : "s"}. This can't be undone.`;
    if (!window.confirm(message)) return;
    run(file.id, () => deletePartFile(file.id));
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
            <select
              value={uploadTarget}
              onChange={(e) => setUploadTarget(e.target.value)}
              className="bg-paper border border-steel/40 rounded-lg px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-crimson max-w-xs"
            >
              <option value="">Upload to part revision…</option>
              {targets.map(([k, t]) => (
                <option key={k} value={k}>
                  {linkLabel(t.link)}
                  {t.name ? ` — ${t.name}` : ""}
                </option>
              ))}
            </select>
            <UploadButton busy={uploading} disabled={!uploadTarget} onFiles={handleUpload} />
          </div>
        )}
      </div>

      {error && <ErrorText message={error} />}

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by filename or part number…"
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
            const linkedKeys = new Set(file.links.map(keyOf));
            const busy = busyId === file.id;
            return (
              <li key={file.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate" title={file.filename}>
                      {file.filename}
                    </p>
                    <FileMeta file={file} uploader={resolveName(file.uploadedBy)} />
                  </div>
                  <DownloadLink file={file} />
                  {!kiosk.active && (
                    <button
                      type="button"
                      onClick={() => handleDelete(file)}
                      disabled={busy}
                      className="px-2.5 py-1 text-xs font-medium border border-crimson/40 text-crimson hover:bg-crimson-tint rounded transition-colors disabled:opacity-50 shrink-0"
                    >
                      Delete
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {file.links.map((link) => (
                    <span
                      key={keyOf(link)}
                      className="inline-flex items-center gap-1 text-xs font-mono text-steel-dark bg-steel-tint border border-steel/30 rounded-full pl-2.5 pr-1 py-0.5"
                    >
                      {linkLabel(link)}
                      {!kiosk.active && (
                        <button
                          type="button"
                          title="Unlink from this part"
                          disabled={busy}
                          onClick={() => run(file.id, () => confirmAndUnlink(file, link))}
                          className="w-4 h-4 leading-none rounded-full text-steel hover:text-crimson hover:bg-crimson-tint disabled:opacity-50"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                  {!kiosk.active && (
                    <select
                      value=""
                      disabled={busy}
                      onChange={(e) => {
                        const target = targets.find(([k]) => k === e.target.value)?.[1].link;
                        if (target) {
                          run(file.id, () =>
                            linkPartFile(file.id, target.partNumber, target.revision),
                          );
                        }
                      }}
                      className="bg-paper border border-dashed border-steel/40 rounded-full px-2 py-0.5 text-xs text-steel-dark focus:outline-none focus:border-crimson max-w-[14rem]"
                    >
                      <option value="">+ Link to part…</option>
                      {targets
                        .filter(([k]) => !linkedKeys.has(k))
                        .map(([k, t]) => (
                          <option key={k} value={k}>
                            {linkLabel(t.link)}
                            {t.name ? ` — ${t.name}` : ""}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
