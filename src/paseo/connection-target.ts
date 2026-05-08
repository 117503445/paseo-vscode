import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface ConnectionTarget {
  host: string;
  url: string;
  password?: string;
  socketPath?: string;
}

export interface ResolveHostInput {
  configuredHost?: string;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_HOST = "localhost:6767";

/**
 * 解析 Paseo home 目录。
 * @param env 用于读取 PASEO_HOME 的环境变量集合。
 */
export function resolvePaseoHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.PASEO_HOME?.trim();
  return configured ? configured : path.join(homedir(), ".paseo");
}

/**
 * 规范化 daemon host 配置。
 * @param raw 用户、环境变量或 pid 文件中的原始连接目标。
 */
export function normalizeDaemonHost(raw: string | undefined | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("tcp://")) return trimmed;
  if (trimmed.startsWith("unix://") || trimmed.startsWith("pipe://")) return trimmed;
  if (trimmed.startsWith("\\\\.\\pipe\\")) return `pipe://${trimmed}`;
  if (trimmed.startsWith("/") || trimmed.startsWith("~")) return `unix://${trimmed}`;
  if (/^[A-Za-z]:[/\\]/.test(trimmed)) return null;
  if (/^\d+$/.test(trimmed)) return `127.0.0.1:${trimmed}`;
  return trimmed.includes(":") ? trimmed : null;
}

/**
 * 读取 pid 文件中记录的 daemon listen 目标。
 * @param paseoHome Paseo home 目录。
 */
export function readPidListenTarget(paseoHome: string): string | null {
  const pidPath = path.join(paseoHome, "paseo.pid");
  if (!existsSync(pidPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(pidPath, "utf-8")) as {
      listen?: unknown;
      sockPath?: unknown;
    };
    if (typeof parsed.listen === "string") return parsed.listen;
    if (typeof parsed.sockPath === "string") return parsed.sockPath;
  } catch {
    return null;
  }
  return null;
}

/**
 * 推导可尝试连接的 daemon host 列表。
 * @param input host 配置、环境变量和推导上下文。
 */
export function resolveDaemonHosts(input: ResolveHostInput): string[] {
  const env = input.env ?? process.env;
  const candidates = [
    input.configuredHost,
    env.PASEO_HOST,
    readPidListenTarget(resolvePaseoHome(env)),
    DEFAULT_HOST,
  ]
    .map((value) => normalizeDaemonHost(value))
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(candidates));
}

/**
 * 将 host 转换为 WebSocket 连接目标。
 * @param host 已规范化或用户输入的 daemon host。
 */
export function resolveConnectionTarget(host: string): ConnectionTarget {
  const normalized = normalizeDaemonHost(host);
  if (!normalized) {
    throw new Error(`Invalid daemon host: ${host}`);
  }

  if (normalized.startsWith("unix://")) {
    const socketPath = normalized.slice("unix://".length);
    return { host: normalized, url: `ws+unix://${socketPath}:/ws`, socketPath };
  }

  if (normalized.startsWith("pipe://")) {
    const socketPath = normalized.slice("pipe://".length);
    return { host: normalized, url: "ws://localhost/ws", socketPath };
  }

  if (normalized.startsWith("tcp://")) {
    const parsed = new URL(normalized);
    const protocol = parsed.searchParams.get("ssl") === "true" ? "wss" : "ws";
    const password = parsed.searchParams.get("password") || undefined;
    return {
      host: normalized,
      url: `${protocol}://${parsed.host}/ws`,
      ...(password ? { password } : {}),
    };
  }

  return { host: normalized, url: `ws://${normalized}/ws` };
}

/**
 * 生成 daemon 日志路径。
 * @param env 用于解析 PASEO_HOME 的环境变量集合。
 */
export function resolveDaemonLogPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolvePaseoHome(env), "daemon.log");
}
