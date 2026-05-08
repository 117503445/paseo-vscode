import net from "node:net";
import { WebSocket } from "ws";
import type { WebSocketLike } from "@getpaseo/server";
import type { ConnectionTarget } from "./connection-target";

const MIN_ALL_PROVIDER_CLIENT_VERSION = "0.1.45";

/**
 * 探测 daemon 连接目标是否有进程监听。
 * @param target daemon 连接目标。
 * @param timeoutMs 探测超时时间。
 */
export function probeConnectionTarget(target: ConnectionTarget, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = target.socketPath
      ? net.createConnection(target.socketPath)
      : net.createConnection(readTcpConnectOptions(target));
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };
    const timer = setTimeout(() => finish(new Error(`daemon ${target.host} 探测超时`)), timeoutMs);
    socket.once("connect", () => finish());
    socket.once("error", (error) => finish(error));
  });
}

/**
 * 解析发送给 daemon 的客户端协议版本。
 * @param extensionVersion VS Code 扩展版本。
 */
export function resolveClientAppVersion(extensionVersion: string): string {
  if (isVersionAtLeast(extensionVersion, MIN_ALL_PROVIDER_CLIENT_VERSION)) {
    return extensionVersion;
  }
  return MIN_ALL_PROVIDER_CLIENT_VERSION;
}

/**
 * 创建 Node WebSocket。
 * @param url WebSocket URL。
 * @param options daemon client 透传选项。
 * @param target 连接目标。
 */
export function createWebSocket(
  url: string,
  options: { headers?: Record<string, string>; protocols?: string[] } | undefined,
  target: ConnectionTarget,
): WebSocketLike {
  return new WebSocket(url, options?.protocols, {
    headers: options?.headers,
    ...(target.socketPath ? { socketPath: target.socketPath } : {}),
  }) as unknown as WebSocketLike;
}

/**
 * 隐藏 host 中的 password 查询参数。
 * @param host daemon host。
 */
export function maskHostForLog(host: string): string {
  if (!host.includes("password=")) return host;
  return host.replace(/([?&]password=)[^&]+/g, "$1***");
}

/**
 * 读取 TCP 探测参数。
 * @param target daemon 连接目标。
 */
function readTcpConnectOptions(target: ConnectionTarget): net.NetConnectOpts {
  const parsed = new URL(target.url);
  const port = Number(parsed.port || (parsed.protocol === "wss:" ? 443 : 80));
  return {
    host: parsed.hostname,
    port,
  };
}

/**
 * 判断语义化版本是否不低于目标版本。
 * @param actual 当前版本。
 * @param minimum 最低版本。
 */
function isVersionAtLeast(actual: string, minimum: string): boolean {
  const actualParts = actual.replace(/-.*/, "").split(".").map((part) => Number(part));
  const minimumParts = minimum.split(".").map((part) => Number(part));
  for (let index = 0; index < minimumParts.length; index += 1) {
    const left = actualParts[index] ?? 0;
    const right = minimumParts[index] ?? 0;
    if (!Number.isFinite(left) || left < right) return false;
    if (left > right) return true;
  }
  return true;
}
