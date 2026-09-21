import { toast } from "sonner";

/**
 * Downloads a binary package (such as zip) from a URL.
 * If the server responds with an error (e.g. 403 or 500 JSON), it intercepts the response,
 * parses the error message, and shows a toast error instead of downloading a corrupted JSON file.
 */
export async function downloadPackage(
  url: string,
  fallbackFilename: string = "download.zip"
): Promise<boolean> {
  const toastId = toast.loading("Đang chuẩn bị gói tải về...");

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/zip, application/octet-stream, application/json",
      },
    });

    if (!res.ok) {
      let errorMessage = `Tải về thất bại (${res.status})`;
      try {
        const data = await res.json();
        if (data?.error) {
          errorMessage = data.error;
        }
      } catch {
        // Response wasn't JSON
      }

      toast.error(errorMessage, { id: toastId, duration: 5000 });
      return false;
    }

    const disposition = res.headers.get("Content-Disposition");
    let filename = fallbackFilename;
    if (disposition && disposition.includes("filename=")) {
      const match = disposition.match(/filename="?([^";]+)"?/i);
      if (match?.[1]) {
        filename = match[1].trim();
      }
    }

    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);

    toast.success("Tải về thành công!", { id: toastId, duration: 3000 });
    return true;
  } catch (error: any) {
    console.error("[downloadPackage] Fetch error, attempting direct download fallback:", error);
    // If fetch failed (e.g. CORS, payload size limit, or service worker interception),
    // fallback to direct browser download stream so the browser's native download manager handles it.
    toast.info("Đang chuyển sang tải trực tiếp qua trình duyệt...", { id: toastId, duration: 3000 });
    const directLink = document.createElement("a");
    directLink.href = url;
    directLink.setAttribute("download", fallbackFilename);
    document.body.appendChild(directLink);
    directLink.click();
    document.body.removeChild(directLink);
    return true;
  }
}
