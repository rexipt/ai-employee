import { RunHistoryStore } from "../../storage/run-history";
import { ActionStatus } from "../../types";
import { logError, logInfo, logSuccess } from "../../lib/logger";

export async function runActionsListCommand(options: { status?: ActionStatus; limit?: string }): Promise<void> {
  const store = new RunHistoryStore();
  const actions = store.listActions(options.status, options.limit ? Number.parseInt(options.limit, 10) : 50);

  if (actions.length === 0) {
    logInfo("No actions in queue.");
    return;
  }

  for (const a of actions) {
    logInfo(`#${a.id} | ${a.status.toUpperCase()} | ${a.severity.toUpperCase()} | ${a.sourceSkillId}`);
    logInfo(`  ${a.title} - ${a.details}`);
  }
}

export async function runActionsApproveCommand(idRaw: string, options: { note?: string }): Promise<void> {
  const id = Number.parseInt(idRaw, 10);
  if (!Number.isFinite(id)) {
    logError("Invalid action id.");
    process.exitCode = 1;
    return;
  }

  const store = new RunHistoryStore();
  const ok = store.updateActionStatus(id, "approved", options.note);
  if (!ok) {
    logError(`Action #${id} not found.`);
    process.exitCode = 1;
    return;
  }

  logSuccess(`Action #${id} approved.`);
}

export async function runActionsRejectCommand(idRaw: string, options: { note?: string }): Promise<void> {
  const id = Number.parseInt(idRaw, 10);
  if (!Number.isFinite(id)) {
    logError("Invalid action id.");
    process.exitCode = 1;
    return;
  }

  const store = new RunHistoryStore();
  const ok = store.updateActionStatus(id, "rejected", options.note);
  if (!ok) {
    logError(`Action #${id} not found.`);
    process.exitCode = 1;
    return;
  }

  logSuccess(`Action #${id} rejected.`);
}
