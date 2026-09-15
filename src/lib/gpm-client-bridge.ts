/**
 * GPM Client Bridge
 * Seamlessly coordinates between Server (tRPC) and Local Machine (Client Agent :39741 / GPM :port).
 * Ensures "Mở Profile GPM" works reliably both in Local Dev and Remote VPS production.
 */

export interface LaunchGpmOptions {
  port?: number | null;
  url?: string;
  startMutation?: {
    mutateAsync: (variables: {
      gpmProfileId: string;
      url?: string;
      port?: number;
    }) => Promise<any>;
  };
  onSuccess?: (info: any) => void;
  onError?: (err: Error) => void;
}

export async function launchGpmProfile(
  gpmProfileId: string,
  options?: LaunchGpmOptions
) {
  const targetPort = options?.port && options.port > 0 ? options.port : 9495;
  const targetUrl = options?.url || "https://www.tiktok.com/tiktokstudio";

  // 1. Try via tRPC mutation first if provided
  if (options?.startMutation) {
    try {
      const res = await options.startMutation.mutateAsync({
        gpmProfileId,
        url: targetUrl,
        port: targetPort,
      });

      // If server handled it directly (local dev mode)
      if (res?.success && !res?.fallbackToLocal) {
        options?.onSuccess?.(res);
        return res;
      }

      // If server returned fallbackToLocal (remote VPS mode)
      const portToUse = res?.port || targetPort;
      return await launchViaLocalBridge(gpmProfileId, portToUse, targetUrl, options);
    } catch {
      // If server request threw, fall back to local bridge
      return await launchViaLocalBridge(gpmProfileId, targetPort, targetUrl, options);
    }
  }

  return await launchViaLocalBridge(gpmProfileId, targetPort, targetUrl, options);
}

async function launchViaLocalBridge(
  gpmProfileId: string,
  port: number,
  targetUrl: string,
  options?: LaunchGpmOptions
) {
  // A. Try Client Agent local HTTP server (:39741)
  try {
    const agentRes = await fetch("http://127.0.0.1:39741/start-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gpmProfileId,
        port,
        url: targetUrl,
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (agentRes.ok) {
      const json = await agentRes.json();
      if (json.ok || json.success) {
        options?.onSuccess?.(json);
        return json;
      }
    }
  } catch {
    // Client Agent local server not available or blocked, try direct GPM port
  }

  // B. Try direct GPM API on the configured/detected port
  try {
    const gpmRes = await fetch(
      `http://127.0.0.1:${port}/api/v1/profiles/start/${gpmProfileId}?skip_proxy_check=true&url=${encodeURIComponent(
        targetUrl
      )}&addition_args=${encodeURIComponent(targetUrl)}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (gpmRes.ok) {
      const json = await gpmRes.json();
      options?.onSuccess?.(json);
      return json;
    }
  } catch {
    // Direct GPM call failed
  }

  const err = new Error(
    `Không thể kết nối đến GPMLogin (cổng ${port}). Hãy chắc chắn GPMLogin hoặc Client Agent đang chạy trên máy tính của bạn!`
  );
  options?.onError?.(err);
  throw err;
}
