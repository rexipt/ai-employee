import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

interface DaemonState {
  pid: number;
  startedAt: string;
  entryScript: string;
}

const dataDir = path.join(os.homedir(), ".rexipt", "ai-employee");
const pidPath = path.join(dataDir, "runtime.pid");

async function ensureDir(): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
}

export function getDaemonPidPath(): string {
  return pidPath;
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "EPERM";
  }
}

export async function loadDaemonState(): Promise<DaemonState | null> {
  try {
    const raw = await fs.readFile(pidPath, "utf8");
    const state = JSON.parse(raw) as DaemonState;
    if (!state?.pid) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

async function saveDaemonState(state: DaemonState): Promise<void> {
  await ensureDir();
  await fs.writeFile(pidPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function clearDaemonState(): Promise<void> {
  try {
    await fs.unlink(pidPath);
  } catch {
    // no-op
  }
}

export async function startDaemon(entryScript: string): Promise<DaemonState> {
  const existing = await loadDaemonState();
  if (existing && isProcessRunning(existing.pid)) {
    throw new Error(`Daemon already running with pid ${existing.pid}`);
  }

  if (existing && !isProcessRunning(existing.pid)) {
    await clearDaemonState();
  }

  const child = spawn(process.execPath, [entryScript, "serve"], {
    detached: true,
    stdio: "ignore",
    cwd: process.cwd(),
    env: process.env,
  });

  child.unref();

  const state: DaemonState = {
    pid: child.pid ?? 0,
    startedAt: new Date().toISOString(),
    entryScript,
  };

  if (!state.pid) {
    throw new Error("Failed to start daemon process");
  }

  await saveDaemonState(state);
  return state;
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isProcessRunning(pid)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return !isProcessRunning(pid);
}

export async function stopDaemon(): Promise<{ stopped: boolean; pid: number | null }> {
  const state = await loadDaemonState();
  if (!state) {
    return { stopped: false, pid: null };
  }

  const pid = state.pid;
  if (!isProcessRunning(pid)) {
    await clearDaemonState();
    return { stopped: true, pid };
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    await clearDaemonState();
    return { stopped: true, pid };
  }

  const exitedGracefully = await waitForExit(pid, 3000);
  if (!exitedGracefully) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // no-op
    }
  }

  await clearDaemonState();
  return { stopped: true, pid };
}
