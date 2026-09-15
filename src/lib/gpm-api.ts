/**
 * GPMLogin Local REST API Client
 * Auto-detects live API port (9495 / 19995 / 19996 / setting.dat api.port).
 */

import fs from "fs";
import path from "path";
import os from "os";

export interface GpmProfileItem {
  id: string;
  name: string;
  group_id: string;
  group_name?: string;
  storage_path: string;
  raw_proxy: string;
  browser: { name: string; version: string };
  os: string;
  note: string;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface GpmGroupItem {
  id: string;
  name: string;
  sort?: number;
  created_at?: string;
  updated_at?: string;
}

export interface GpmStartResponse {
  profile_id: string;
  driver_path: string;
  remote_debugging_port: number;
  websocket_debugging_url: string;
  addition_info?: {
    process_id: number;
    profile_name: string;
    window_handle: number;
    exec_time: number;
  };
}

export interface GpmApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  sender?: string;
}

export interface GpmPagination<T> {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  data: T[];
}

export interface GpmConnectionStatus {
  isOnline: boolean;
  message: string;
  version?: string;
  baseUrl: string;
  port: number | null;
}

export const GPM_PORT_CANDIDATES = [9495, 19995, 19996, 19994, 8848] as const;
export const GPM_API_VERSIONS = ["v1", "v3"] as const;

export function portFromBaseUrl(baseUrl: string): number | null {
  const m = String(baseUrl || "").match(/:(\d+)(?:\/|$)/);
  return m ? Number(m[1]) : null;
}

export function readGpmConfiguredApiPort(): number | null {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const settingCandidates = [
    path.join(appData, "GPMLoginGlobal", "setting.dat"),
    path.join(appData, "GPMLoginGlobal", "gpm_setting.dat"),
    path.join(appData, "GPMLogin", "setting.dat"),
    path.join(localAppData, "GPMLoginGlobal", "setting.dat"),
  ];
  for (const sPath of settingCandidates) {
    try {
      if (!fs.existsSync(/*turbopackIgnore: true*/ sPath)) continue;
      const parsed = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ sPath, "utf-8"));
      const port = Number(parsed?.api?.port);
      if (Number.isFinite(port) && port > 0) return port;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function buildGpmBaseCandidates(preferredBase?: string, preferredPort?: number | null): string[] {
  const bases: string[] = [];
  if (preferredPort && Number.isFinite(preferredPort) && preferredPort > 0) {
    for (const ver of GPM_API_VERSIONS) {
      bases.push(`http://127.0.0.1:${preferredPort}/api/${ver}`);
    }
  }
  if (preferredBase) {
    bases.push(preferredBase.replace(/\/$/, "").replace("localhost", "127.0.0.1"));
  }
  const configuredPort = readGpmConfiguredApiPort();
  const ports = [
    ...(preferredPort && Number.isFinite(preferredPort) && preferredPort > 0 ? [preferredPort] : []),
    ...(configuredPort ? [configuredPort] : []),
    ...GPM_PORT_CANDIDATES,
  ];
  const seen = new Set<number>();
  for (const port of ports) {
    if (seen.has(port)) continue;
    seen.add(port);
    for (const ver of GPM_API_VERSIONS) {
      bases.push(`http://127.0.0.1:${port}/api/${ver}`);
    }
  }
  return Array.from(new Set(bases));
}

export class GpmApiClient {
  private baseUrl: string;

  constructor(baseUrl = "http://127.0.0.1:9495/api/v1") {
    this.baseUrl = baseUrl.replace(/\/$/, "").replace("localhost", "127.0.0.1");
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, "").replace("localhost", "127.0.0.1");
  }

  public getBaseUrl() {
    return this.baseUrl;
  }

  public getPort(): number | null {
    return portFromBaseUrl(this.baseUrl);
  }

  async checkConnection(preferredPort?: number | null): Promise<GpmConnectionStatus> {
    for (const candidate of buildGpmBaseCandidates(this.baseUrl, preferredPort)) {
      try {
        const res = await fetch(`${candidate}/profiles?page=1&per_page=1&page_size=1`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          const json: GpmApiResponse<any> = await res.json();
          this.baseUrl = candidate;
          const port = portFromBaseUrl(candidate);
          return {
            isOnline: json.success !== false,
            message: json.message || `GPMLogin is online (port ${port})`,
            version: json.sender,
            baseUrl: this.baseUrl,
            port,
          };
        }
      } catch {
        /* next */
      }
    }
    return {
      isOnline: false,
      message:
        "Không thể kết nối đến GPMLogin (đã dò cổng 9495/19995/19996…). Vui lòng mở GPMLogin và bật API Setting.",
      baseUrl: this.baseUrl,
      port: portFromBaseUrl(this.baseUrl),
    };
  }

  async listProfiles(
    page = 1,
    pageSize = 100,
    search = ""
  ): Promise<GpmPagination<GpmProfileItem> | null> {
    const attempt = async () => {
      const url = new URL(`${this.baseUrl}/profiles`);
      url.searchParams.set("page", String(page));
      url.searchParams.set("page_size", String(pageSize));
      url.searchParams.set("per_page", String(pageSize));
      if (search) url.searchParams.set("search", search);
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`GPMLogin responded with status ${res.status}`);
      const json: GpmApiResponse<GpmPagination<GpmProfileItem>> = await res.json();
      return json.data;
    };
    try {
      return await attempt();
    } catch (firstErr) {
      try {
        const health = await this.checkConnection();
        if (!health.isOnline) {
          console.warn("[GpmApiClient] Failed to list profiles:", firstErr);
          return null;
        }
        return await attempt();
      } catch (err) {
        console.warn("[GpmApiClient] Failed to list profiles:", err);
        return null;
      }
    }
  }

  async getProfile(profileId: string): Promise<GpmProfileItem | null> {
    try {
      const res = await fetch(`${this.baseUrl}/profiles/${profileId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) return null;
      const json: GpmApiResponse<GpmProfileItem> = await res.json();
      return json.data;
    } catch (err) {
      console.warn(`[GpmApiClient] Failed to get profile ${profileId}:`, err);
      return null;
    }
  }

  async listGroups(page = 1, pageSize = 100): Promise<GpmGroupItem[]> {
    try {
      const url = new URL(`${this.baseUrl}/groups`);
      url.searchParams.set("page", String(page));
      url.searchParams.set("page_size", String(pageSize));
      url.searchParams.set("per_page", String(pageSize));
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const json: GpmApiResponse<GpmPagination<GpmGroupItem> | GpmGroupItem[]> =
        await res.json();
      const data = json.data;
      if (Array.isArray(data)) return data;
      if (data && Array.isArray((data as GpmPagination<GpmGroupItem>).data)) {
        return (data as GpmPagination<GpmGroupItem>).data;
      }
      return [];
    } catch (err) {
      console.warn("[GpmApiClient] Failed to list groups:", err);
      return [];
    }
  }

  /** Map GPM group_id → display name (UI: "Default group"). */
  async resolveGroupName(groupId?: string | null, fallbackName?: string | null): Promise<string | null> {
    const explicit = String(fallbackName || "").trim();
    if (explicit) return explicit;
    const id = String(groupId || "").trim();
    if (!id) return null;
    if (/^(all|default)$/i.test(id)) return "Default group";
    const groups = await this.listGroups(1, 200);
    const hit = groups.find((g) => String(g.id) === id || String(g.name) === id);
    if (hit?.name) return hit.name;
    // group_id sometimes already is the human name
    if (!/^[0-9a-f-]{36}$/i.test(id)) return id;
    return null;
  }

  async startProfile(
    profileId: string,
    options?: {
      skipProxyCheck?: boolean;
      windowScale?: number;
      additionArgs?: string;
      url?: string;
      port?: number | null;
    }
  ): Promise<GpmStartResponse | null> {
    const targetUrl =
      options?.url || (options?.additionArgs?.startsWith("http") ? options.additionArgs : null);

    for (const base of buildGpmBaseCandidates(this.baseUrl, options?.port)) {
      try {
        const url = new URL(`${base}/profiles/start/${profileId}`);
        if (options?.skipProxyCheck) url.searchParams.set("skip_proxy_check", "true");
        if (options?.windowScale) url.searchParams.set("window_scale", String(options.windowScale));
        if (options?.additionArgs) url.searchParams.set("addition_args", options.additionArgs);
        else if (targetUrl) url.searchParams.set("addition_args", targetUrl);
        if (options?.url) url.searchParams.set("url", options.url);

        const res = await fetch(url.toString(), {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) continue;

        const json: GpmApiResponse<GpmStartResponse> = await res.json();
        this.baseUrl = base;

        if (targetUrl && json?.data?.remote_debugging_port) {
          const port = json.data.remote_debugging_port;
          (async () => {
            try {
              await new Promise((r) => setTimeout(r, 1500));
              const listRes = await fetch(`http://127.0.0.1:${port}/json/list`).catch(() => null);
              if (!listRes?.ok) return;
              const pages = (await listRes.json()) as Array<{ url: string }>;
              const hasTarget = pages.some(
                (p) => p.url && (p.url.includes("tiktokstudio") || p.url === targetUrl)
              );
              if (!hasTarget) {
                await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(targetUrl)}`, {
                  method: "PUT",
                }).catch(() =>
                  fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(targetUrl)}`)
                );
              }
            } catch {
              /* ignore */
            }
          })();
        }
        return json.data;
      } catch {
        /* next */
      }
    }
    console.warn(`[GpmApiClient] Failed to start profile ${profileId} on candidate ports.`);
    return null;
  }

  async stopProfile(
    profileId: string,
    options?: { port?: number | null }
  ): Promise<boolean> {
    for (const base of buildGpmBaseCandidates(this.baseUrl, options?.port)) {
      try {
        const res = await fetch(`${base}/profiles/stop/${profileId}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) continue;
        const json: GpmApiResponse<null> = await res.json();
        this.baseUrl = base;
        return json.success;
      } catch {
        /* next */
      }
    }
    console.warn(`[GpmApiClient] Failed to stop profile ${profileId} on candidate ports.`);
    return false;
  }
}

export const gpmClient = new GpmApiClient();
