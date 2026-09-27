import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchPartFiles,
  linkPartFile,
  partFileDownloadUrl,
  unlinkPartFile,
  uploadPartFile,
} from "../../shared/getters";
import type { PartFile, PartFileLink } from "../../shared/types";
import { useKiosk } from "../../shared/use-auth";
import { useUserNames } from "../../shared/use-user-names";

const MAX_FILE_BYTES = 100 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${Math.round((bytes / k ** i) * 10) / 10} ${sizes[i]}`;
}

export const linkLabel = (l: PartFileLink) => `${l.partNumber} · Rev ${l.revision}`;

const sameLink = (a: PartFileLink, b: PartFileLink) =>
  a.partNumber === b.partNumber && a.revision === b.revision;

/** Uploads files one at a time; returns the error for the first failure, if any. */
export async function uploadFiles(
  selected: File[],
  partNumber: string,
  revision: string,
): Promise<string | null> {
  for (const file of selected) {
    if (file.size > MAX_FILE_BYTES) return `${file.name} is over the 100 MB limit.`;
    try {
      await uploadPartFile(file, partNumber, revision);
    } catch (err) {
      return `${file.name}: ${err instanceof Error ? err.message : "upload failed"}`;
    }
  }
  return null;
}

/** Unlinks a file from one part revision after confirming; warns when that deletes the file. */
export async function confirmAndUnlink(file: PartFile, link: PartFileLink): Promise<boolean> {
  const others = file.links.filter((l) => !sameLink(l, link)).length;
  const message =
    others === 0
      ? `${file.filename} is only linked to ${linkLabel(link)}. Removing it will delete the file. Continue?`
      : `Remove ${file.filename} from ${linkLabel(link)}? It stays linked to ${others} other part${others === 1 ? "" : "s"}.`;
  if (!window.confirm(message)) return false;
  await unlinkPartFile(file.id, link.partNumber, link.revision);
  return true;
}

/** Files linked to one part revision: upload, attach an existing file, or remove. */
export function PartFilesPanel({ partNumber, revision }: { partNumber: string; revision: string }) {
  const kiosk = useKiosk();
  const [files, setFiles] = useState<PartFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resolveName = useUserNames(files.map((f) => f.uploadedBy));
  const here: PartFileLink = { partNumber, revision };

  const load = useCallback(async () => {
    try {
      setFiles(await fetchPartFiles(partNumber, revision));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files.");
    } finally {
      setLoading(false);
    }
  }, [partNumber, revision]);

  useEffect(() => {
    if (!partNumber || !revision) return;
    setLoading(true);
    load();
  }, [load, partNumber, revision]);

  async function handleUpload(selected: File[]) {
    if (selected.length === 0) return;
    setUploading(true);
    setError(await uploadFiles(selected, partNumber, revision));
    await load();
    setUploading(false);
  }

  async function handleAttach(fileId: number) {
    try {
      await linkPartFile(fileId, partNumber, revision);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to attach file.");
    }
  }

  async function handleRemove(file: PartFile) {
    setBusyId(file.id);
    try {
      if (await confirmAndUnlink(file, here)) await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove file.");
    } finally {
      setBusyId(null);
    }
  }

  if (!partNumber || !revision) {
    return <p className="text-sm text-steel">Enter a part number and revision to attach files.</p>;
  }

  return (
    <div className="space-y-2">
      {error && <ErrorText message={error} />}
      {loading ? (
        <p className="text-sm text-steel">Loading files…</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-steel">No files attached.</p>
      ) : (
        <ul className="divide-y divide-steel/20 border border-steel/25 rounded-lg">
          {files.map((file) => {
            const others = file.links.filter((l) => !sameLink(l, here));
            return (
              <li key={file.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate" title={file.filename}>
                    {file.filename}
                  </p>
                  <FileMeta file={file} uploader={resolveName(file.uploadedBy)} />
                  {others.length > 0 && (
                    <p className="text-xs text-steel-dark mt-0.5 truncate">
                      Also on: {others.map(linkLabel).join(", ")}
                    </p>
                  )}
                </div>
                <DownloadLink file={file} />
                {!kiosk.active && (
                  <button
                    type="button"
                    onClick={() => handleRemove(file)}
                    disabled={busyId === file.id}
                    className="px-2.5 py-1 text-xs font-medium border border-crimson/40 text-crimson hover:bg-crimson-tint rounded transition-colors disabled:opacity-50 shrink-0"
                  >
                    {busyId === file.id ? "Removing…" : "Remove"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!kiosk.active && (
        <div className="flex flex-wrap items-center gap-2">
          <UploadButton busy={uploading} onFiles={handleUpload} />
          <AttachExistingSelect exclude={files.map((f) => f.id)} onPick={handleAttach} />
        </div>
      )}
    </div>
  );
}

/** Picks from every stored file (loaded on first focus) to link here. */
function AttachExistingSelect({
  exclude,
  onPick,
}: {
  exclude: number[];
  onPick: (fileId: number) => void;
}) {
  const [all, setAll] = useState<PartFile[] | null>(null);

  function loadAll() {
    if (all) return;
    fetchPartFiles()
      .then(setAll)
      .catch(() => setAll([]));
  }

  const options = (all ?? [])
    .filter((f) => !exclude.includes(f.id))
    .sort((a, b) => a.filename.localeCompare(b.filename));

  return (
    <select
      value=""
      onFocus={loadAll}
      onPointerDown={loadAll}
      onChange={(e) => {
        const id = Number(e.target.value);
        if (id) {
          onPick(id);
          setAll(null);
        }
      }}
      className="bg-paper border border-steel/40 rounded-lg px-2.5 py-1.5 text-xs text-steel-dark focus:outline-none focus:border-crimson max-w-[16rem]"
    >
      <option value="">Attach existing file…</option>
      {all === null ? (
        <option disabled>Loading…</option>
      ) : options.length === 0 ? (
        <option disabled>No other files</option>
      ) : (
        options.map((f) => (
          <option key={f.id} value={f.id}>
            {f.filename} ({f.links.map(linkLabel).join(", ")})
          </option>
        ))
      )}
    </select>
  );
}

export function UploadButton({
  busy,
  disabled,
  onFiles,
}: {
  busy: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          // Reset so picking the same file again still fires onChange.
          e.target.value = "";
          onFiles(picked);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy || disabled}
        className="px-3 py-1.5 text-xs font-semibold border border-steel/40 text-steel-dark hover:text-ink hover:border-crimson/50 rounded-lg transition-colors disabled:opacity-50"
      >
        {busy ? "Uploading…" : "+ Upload Files"}
      </button>
    </>
  );
}

export function FileMeta({ file, uploader }: { file: PartFile; uploader: string }) {
  return (
    <p className="text-xs text-steel">
      {formatBytes(file.fileSize)} · {new Date(file.createdAt).toLocaleDateString()} · {uploader}
    </p>
  );
}

export function DownloadLink({ file }: { file: PartFile }) {
  return (
    <a
      href={partFileDownloadUrl(file.id)}
      download={file.filename}
      className="px-2.5 py-1 text-xs font-medium border border-steel/40 text-steel hover:text-ink rounded transition-colors shrink-0"
    >
      Download
    </a>
  );
}

export function ErrorText({ message }: { message: string }) {
  return (
    <p className="text-sm text-crimson-dark bg-crimson-tint border border-crimson/30 rounded-lg px-3 py-2">
      {message}
    </p>
  );
}
