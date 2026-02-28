import { saveRuntimeState } from "../../lib/config-manager";
import { logInfo, logSuccess } from "../../lib/logger";
import { stopDaemon } from "../../lib/process-manager";

export async function runStopCommand(): Promise<void> {
  const result = await stopDaemon();
  if (!result.stopped) {
    logInfo("No daemon process is currently running.");
    return;
  }

  await saveRuntimeState({
    startedAt: new Date().toISOString(),
    status: "stopped",
    mode: "scheduled",
    enabledSkills: [],
  });

  logSuccess(`Stopped daemon process${result.pid ? ` (pid ${result.pid})` : ""}.`);
}
