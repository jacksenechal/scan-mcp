import { promises as fs } from "fs";
import path from "path";
import type { ExecaError } from "execa";
import { expandTilde } from "../config.js";

const DEFAULT_BYTE_WINDOW = 64 * 1024; // 64 KiB

// Read the last N lines of a UTF-8 text file by streaming from the end.
// Returns undefined on any error or if the file does not exist.
export async function tailTextFile(
  file: string,
  maxLines = 80,
  byteWindow = DEFAULT_BYTE_WINDOW,
): Promise<string | undefined> {
  try {
    await fs.access(file);
    const handle = await fs.open(file, "r");
    try {
      const { size } = await handle.stat();
      const readSize = Math.min(byteWindow, size);
      const buffer = Buffer.alloc(readSize);
      await handle.read(buffer, 0, readSize, size - readSize);
      const lines = buffer.toString("utf8").split(/\r?\n/);
      return lines.slice(-maxLines).join("\n");
    } finally {
      await handle.close();
    }
  } catch {
    return undefined;
  }
}

export function resolveJobPath(jobId: string, baseDir: string): string {
  if (!/^job-[0-9a-fA-F-]{36}$/.test(jobId)) throw new Error("invalid job_id");
  const base = path.resolve(baseDir);
  const full = path.resolve(base, jobId);
  if (!full.startsWith(base + path.sep)) throw new Error("invalid job_id");
  return full;
}

function isInside(child: string, parent: string): boolean {
  return child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
}

// realpath of the deepest existing ancestor of `p`, with the not-yet-existing remainder appended.
// A dangling symlink on the way counts as existing and is rejected: mkdir would follow it.
async function realpathExisting(p: string): Promise<string> {
  const rest: string[] = [];
  let cur = p;
  for (;;) {
    try {
      return path.join(await fs.realpath(cur), ...rest.reverse());
    } catch (e) {
      if (!isNodeError(e) || e.code !== "ENOENT") throw e;
      const exists = await fs.lstat(cur).then(() => true, () => false);
      if (exists) throw new Error("tmp_dir contains a dangling symlink");
      const parent = path.dirname(cur);
      if (parent === cur) throw e;
      rest.push(path.basename(cur));
      cur = parent;
    }
  }
}

/**
 * Validate that `dir` (existing or not) really lives inside the inbox, following symlinks.
 * Throws otherwise. Call before mkdir, and again after, to close the check/create gap.
 */
export async function assertInsideInbox(dir: string, inboxDir: string): Promise<void> {
  const realInbox = await realpathExisting(path.resolve(inboxDir));
  const realDir = await realpathExisting(path.resolve(dir));
  if (!isInside(realDir, realInbox)) throw new Error("tmp_dir must be inside INBOX_DIR (symlink escape)");
}

/**
 * Resolve a client-supplied `tmp_dir` to a job base directory that is INBOX_DIR or a descendant.
 * Relative paths resolve against INBOX_DIR; `~` is expanded. Undefined means INBOX_DIR.
 * Rejects `..` escapes lexically (before touching the filesystem) and symlink escapes via realpath.
 * Creates nothing.
 */
export async function resolveJobBaseDir(tmpDir: string | undefined, inboxDir: string): Promise<string> {
  const inbox = path.resolve(inboxDir);
  if (tmpDir === undefined || tmpDir === "") return inbox;
  const dir = path.resolve(inbox, expandTilde(tmpDir));
  if (!isInside(dir, inbox)) throw new Error(`tmp_dir must be inside INBOX_DIR (${inbox}); got ${tmpDir}`);
  await assertInsideInbox(dir, inbox);
  return dir;
}

export function isExecaError(e: unknown): e is ExecaError {
  return typeof e === "object" && e !== null && "shortMessage" in e && "exitCode" in e;
}

export function isNodeError(e: unknown): e is NodeJS.ErrnoException {
  if (!(e instanceof Error)) return false;
  return typeof e === "object" && e !== null && "code" in e;
}

// Replace `file` atomically: write a sibling temp file, then rename it into place, so a
// concurrent reader sees either the old content or the new, never a truncated file.
export async function writeFileAtomic(file: string, data: string): Promise<void> {
  const tmp = `${file}.tmp`;
  try {
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

// A short, single-line description of an error. execa puts the child's buffered
// stdout/stderr into `message`; `shortMessage` is just the command and how it failed.
export function errorSummary(err: unknown): string {
  if (typeof err === "object" && err !== null && "shortMessage" in err && typeof err.shortMessage === "string") {
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}
