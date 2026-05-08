import { spawn } from "node:child_process";
import path from "node:path";
import { resolveDaemonLogPath, resolvePaseoHome } from "./connection-target";
import { resolveDaemonSupervisorEntrypoint } from "./server-module";

export interface StartDaemonInput {
  env?: NodeJS.ProcessEnv;
  listen?: string;
}

export interface StartDaemonResult {
  pid: number | null;
  logPath: string;
}

const STARTUP_GRACE_MS = 1200;

/**
 * 创建 daemon 子进程环境变量。
 * @param input daemon 启动参数。
 */
export function buildDaemonEnv(input: StartDaemonInput): NodeJS.ProcessEnv {
  const baseEnv = input.env ?? process.env;
  const next: NodeJS.ProcessEnv = {
    ...baseEnv,
    PASEO_HOME: resolvePaseoHome(baseEnv),
    PASEO_RELAY_ENABLED: "0",
    PASEO_DICTATION_ENABLED: "0",
    PASEO_VOICE_MODE_ENABLED: "0",
    PASEO_LOCAL_SPEECH_AUTO_DOWNLOAD: "0",
  };
  if (input.listen) {
    next.PASEO_LISTEN = input.listen;
  }
  if (process.versions.electron) {
    next.ELECTRON_RUN_AS_NODE = "1";
  }
  return next;
}

/**
 * 在后台 detached 启动 Paseo daemon。
 * @param input daemon 启动参数。
 */
export async function startDaemonDetached(input: StartDaemonInput): Promise<StartDaemonResult> {
  const entrypoint = resolveDaemonSupervisorEntrypoint();
  const env = buildDaemonEnv(input);
  const logPath = resolveDaemonLogPath(env);
  const args = [entrypoint, "--no-relay", "--no-mcp"];
  if (entrypoint.endsWith(".ts")) {
    args.unshift("--import", "tsx");
  }

  const child = spawn(process.execPath, args, {
    cwd: path.dirname(entrypoint),
    detached: true,
    env,
    stdio: ["ignore", "ignore", "ignore"],
  });
  child.unref();

  const result = await new Promise<{ exited: false } | { exited: true; error: string }>(
    (resolve) => {
      let settled = false;
      const finish = (value: { exited: false } | { exited: true; error: string }) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const timer = setTimeout(() => finish({ exited: false }), STARTUP_GRACE_MS);
      child.once("error", (error) => {
        clearTimeout(timer);
        finish({ exited: true, error: error.message });
      });
      child.once("exit", (code, signal) => {
        clearTimeout(timer);
        finish({ exited: true, error: `exit=${code ?? "unknown"} signal=${signal ?? "none"}` });
      });
    },
  );

  if (result.exited) {
    throw new Error(`Paseo daemon 启动失败：${result.error}`);
  }

  return { pid: child.pid ?? null, logPath };
}
