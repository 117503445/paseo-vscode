import { createRequire } from "node:module";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import type { PaseoServerModule } from "./types";

let cachedModule: Promise<PaseoServerModule> | null = null;

/**
 * 动态加载 @getpaseo/server。
 */
export function loadPaseoServerModule(): Promise<PaseoServerModule> {
  cachedModule ??= import("@getpaseo/server") as Promise<PaseoServerModule>;
  return cachedModule;
}

/**
 * 查找 @getpaseo/server 包根目录。
 */
export function resolvePaseoServerPackageRoot(): string {
  const requireFromExtension = createRequire(__filename);
  let current = path.dirname(requireFromExtension.resolve("@getpaseo/server"));
  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { name?: unknown };
        if (pkg.name === "@getpaseo/server") return current;
      } catch {
        // 继续向上查找。
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error("无法定位 @getpaseo/server 包根目录");
}

/**
 * 解析 daemon supervisor 入口。
 */
export function resolveDaemonSupervisorEntrypoint(): string {
  const packageRoot = resolvePaseoServerPackageRoot();
  const candidates = [
    path.join(packageRoot, "dist", "scripts", "supervisor-entrypoint.js"),
    path.join(packageRoot, "scripts", "supervisor-entrypoint.js"),
    path.join(packageRoot, "scripts", "supervisor-entrypoint.ts"),
  ];
  const entry = candidates.find((candidate) => existsSync(candidate));
  if (!entry) {
    throw new Error(`无法定位 Paseo daemon 启动入口：${candidates.join(", ")}`);
  }
  return entry;
}
