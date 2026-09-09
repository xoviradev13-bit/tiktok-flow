// TikTokFlow Companion - Popup Controller

document.addEventListener("DOMContentLoaded", async () => {
  // Elements
  const statusPill = document.getElementById("statusPill");
  const statusPillText = document.getElementById("statusPillText");
  const memberNameText = document.getElementById("memberNameText");
  const serverUrlText = document.getElementById("serverUrlText");

  const userAvatar = document.getElementById("userAvatar");
  const userHandle = document.getElementById("userHandle");
  const userNickname = document.getElementById("userNickname");
  const statFollowers = document.getElementById("statFollowers");
  const statVideos = document.getElementById("statVideos");
  const statRevenue = document.getElementById("statRevenue");

  const gpmIndicator = document.getElementById("gpmIndicator");
  const gpmStatusText = document.getElementById("gpmStatusText");
  const gpmProfileCount = document.getElementById("gpmProfileCount");
  const serverScheduleText = document.getElementById("serverScheduleText");
  const syncNowBtn = document.getElementById("syncNowBtn");
  const syncBtnText = document.getElementById("syncBtnText");
  const lastSyncText = document.getElementById("lastSyncText");

  function formatNumber(num) {
    if (!num || isNaN(num)) return "0";
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toLocaleString();
  }

  function formatMoney(amount) {
    if (!amount || isNaN(amount)) return "$0.00";
    return `$${Number(amount).toFixed(2)}`;
  }

  // 1. Load config from config.json if storage is empty
  let data = await chrome.storage.local.get([
    "serverUrl",
    "personalToken",
    "memberName",
    "userEmail",
    "latestAccount",
    "lastFleetSyncTime",
    "gpmProfileCount",
  ]);

  if (!data.memberName || !data.personalToken) {
    try {
      const resp = await fetch(chrome.runtime.getURL("config.json"));
      if (resp.ok) {
        const fileCfg = await resp.json();
        await chrome.storage.local.set(fileCfg);
        data = { ...data, ...fileCfg };
      }
    } catch (e) {}
  }

  // Populate Identity Badge
  memberNameText.textContent = data.memberName || data.userEmail || "Nhân sự hệ thống";
  serverUrlText.textContent = data.serverUrl || "http://localhost:3000";

  // Token Management & Security Validation
  const personalTokenInput = document.getElementById("personalTokenInput");
  const testTokenBtn = document.getElementById("testTokenBtn");
  const saveTokenBtn = document.getElementById("saveTokenBtn");
  const tokenSaveMsg = document.getElementById("tokenSaveMsg");

  if (data.personalToken && personalTokenInput) {
    personalTokenInput.value = data.personalToken;
  }

  function showTokenMsg(text, isSuccess) {
    if (!tokenSaveMsg) return;
    tokenSaveMsg.textContent = text;
    tokenSaveMsg.className = `token-save-msg ${isSuccess ? "success" : "error"}`;
    tokenSaveMsg.style.display = "block";
  }

  async function verifyTokenOnline(tokenToVerify) {
    if (!tokenToVerify) {
      return { ok: false, error: "Vui lòng nhập mã Token." };
    }
    if (!tokenToVerify.startsWith("ttf_sec_")) {
      return {
        ok: false,
        error: "Định dạng sai! Token hợp lệ phải bắt đầu bằng 'ttf_sec_'.",
      };
    }
    if (tokenToVerify.length < 24) {
      return { ok: false, error: "Mã Token quá ngắn hoặc thiếu ký tự." };
    }

    const currentServer = (data.serverUrl || "http://localhost:3000").replace(/\/+$/, "");
    try {
      const resp = await fetch(`${currentServer}/api/extension/verify-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${tokenToVerify}`,
        },
        body: JSON.stringify({ token: tokenToVerify }),
      });
      const resData = await resp.json().catch(() => ({}));
      if (resp.ok && resData.valid) {
        return { ok: true, user: resData.user };
      }
      return {
        ok: false,
        error: resData.error || "Mã Token không tồn tại hoặc đã bị vô hiệu hóa!",
      };
    } catch (err) {
      return {
        ok: false,
        error: "Không thể kết nối đến máy chủ để xác thực.",
      };
    }
  }

  testTokenBtn?.addEventListener("click", async () => {
    const candidate = (personalTokenInput?.value || "").trim();
    testTokenBtn.disabled = true;
    testTokenBtn.textContent = "...";
    const result = await verifyTokenOnline(candidate);
    testTokenBtn.disabled = false;
    testTokenBtn.textContent = "Kiểm tra";

    if (result.ok) {
      showTokenMsg(`✓ Token hợp lệ! Nhân sự: ${result.user?.name || result.user?.email}`, true);
    } else {
      showTokenMsg(`✕ ${result.error}`, false);
    }
  });

  saveTokenBtn?.addEventListener("click", async () => {
    const candidate = (personalTokenInput?.value || "").trim();
    saveTokenBtn.disabled = true;
    saveTokenBtn.textContent = "...";
    const result = await verifyTokenOnline(candidate);
    saveTokenBtn.disabled = false;
    saveTokenBtn.textContent = "Lưu";

    if (!result.ok) {
      showTokenMsg(`✕ Không thể lưu: ${result.error}`, false);
      return;
    }

    await chrome.storage.local.set({
      personalToken: candidate,
      memberName: result.user?.name || data.memberName,
      userEmail: result.user?.email || data.userEmail,
    });

    if (result.user?.name) {
      memberNameText.textContent = result.user.name;
    }
    showTokenMsg(`✓ Đã lưu token thành công cho: ${result.user?.name || "Nhân sự"}`, true);
    setTimeout(() => {
      if (tokenSaveMsg) tokenSaveMsg.style.display = "none";
    }, 4000);
  });

  // Populate Account Card
  if (data.latestAccount) {
    const acc = data.latestAccount;
    userHandle.textContent = acc.username ? `@${acc.username}` : "@chua_phat_hien";
    userNickname.textContent = acc.nickname || (acc.isLoggedIn ? "Đã xác minh phiên" : "Chưa đăng nhập");
    if (acc.avatarUrl) {
      userAvatar.src = acc.avatarUrl;
    }
    statFollowers.textContent = formatNumber(acc.followersCount);
    statVideos.textContent = formatNumber(acc.videoCount);
    statRevenue.textContent = formatMoney(acc.totalRevenue);

    if (acc.isLoggedIn) {
      statusPill.className = "status-pill status-active";
      statusPillText.textContent = "Đã đăng nhập";
    } else {
      statusPill.className = "status-pill status-idle";
      statusPillText.textContent = "Chưa đăng nhập";
    }
  }

  if (data.gpmProfileCount) {
    gpmProfileCount.textContent = `${data.gpmProfileCount} profiles`;
  }

  if (data.lastFleetSyncTime) {
    const d = new Date(data.lastFleetSyncTime);
    lastSyncText.textContent = `Đồng bộ lần cuối: ${d.toLocaleTimeString("vi-VN")}`;
  }

  // Display Server Sync Schedule
  function renderScheduleText(summary, intervalMinutes, autoEnabled) {
    if (!serverScheduleText) return;
    if (autoEnabled === false) {
      serverScheduleText.textContent = "Đang tắt";
      serverScheduleText.style.color = "#94a3b8";
    } else if (summary) {
      serverScheduleText.textContent = summary;
      serverScheduleText.style.color = "#38bdf8";
    } else {
      const min = intervalMinutes || 30;
      serverScheduleText.textContent = min >= 60 ? `Mỗi ${min / 60} giờ` : `Mỗi ${min} phút`;
      serverScheduleText.style.color = "#38bdf8";
    }
  }

  chrome.storage.local.get(["serverScheduleSummary", "serverIntervalMinutes", "serverAutoEnabled"], (stored) => {
    renderScheduleText(stored?.serverScheduleSummary, stored?.serverIntervalMinutes, stored?.serverAutoEnabled);
  });

  chrome.runtime.sendMessage({ type: "REFRESH_SCHEDULE" }, (res) => {
    if (res) {
      renderScheduleText(res.serverScheduleSummary, res.serverIntervalMinutes, res.serverAutoEnabled);
    }
  });

  // 2. Check Live GPM API Status
  async function checkGpmHealth() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      let res = await fetch("http://127.0.0.1:9495/api/v1/profiles?page=1&per_page=1", {
        signal: controller.signal,
      }).catch(() => null);

      if (!res || !res.ok) {
        res = await fetch("http://127.0.0.1:9495/api/v3/profiles?page=1&per_page=1", {
          signal: controller.signal,
        }).catch(() => null);
      }
      clearTimeout(timeoutId);

      if (res && res.ok) {
        gpmIndicator.className = "gpm-indicator online";
        gpmStatusText.textContent = "localhost:9495 Online";
      } else {
        throw new Error("GPM API responded with error");
      }
    } catch {
      gpmIndicator.className = "gpm-indicator offline";
      gpmStatusText.textContent = "localhost:9495 Offline";
    }
  }

  checkGpmHealth();

  // 3. Trigger Manual Sync Action
  syncNowBtn.addEventListener("click", () => {
    syncNowBtn.disabled = true;
    syncNowBtn.classList.add("spinning");
    syncBtnText.textContent = "Đang quét GPM...";

    chrome.runtime.sendMessage({ type: "TRIGGER_MANUAL_SYNC" }, (response) => {
      syncNowBtn.disabled = false;
      syncNowBtn.classList.remove("spinning");
      syncBtnText.textContent = "Đồng bộ GPM ngay";

      if (response && response.success) {
        gpmProfileCount.textContent = `${response.count} profiles`;
        const now = new Date();
        lastSyncText.textContent = `Đồng bộ lần cuối: ${now.toLocaleTimeString("vi-VN")}`;
        alert(`Đã đồng bộ thành công ${response.count} profiles về TikTokFlow Server!`);
      } else if (response && response.skipped) {
        alert(`Bỏ qua: ${response.reason}`);
      } else {
        alert("Không thể kết nối đến GPMLogin (localhost:9495). Hãy chắc chắn GPMLogin đang mở.");
      }
    });
  });
});
