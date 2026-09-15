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

  const gpmIndicator = document.getElementById("gpmIndicator");
  const gpmStatusText = document.getElementById("gpmStatusText");
  const gpmProfileCount = document.getElementById("gpmProfileCount");
  const serverScheduleText = document.getElementById("serverScheduleText");
  const syncNowBtn = document.getElementById("syncNowBtn");
  const syncBtnText = document.getElementById("syncBtnText");
  const lastSyncText = document.getElementById("lastSyncText");
  const fleetSyncBar = document.getElementById("fleetSyncBar");
  const fleetSyncText = document.getElementById("fleetSyncText");
  const agentIndicator = document.getElementById("agentIndicator");
  const agentStatusText = document.getElementById("agentStatusText");
  const agentHintText = document.getElementById("agentHintText");

  function setSyncBar(barEl, textEl, status, message) {
    if (!barEl || !textEl) return;
    const st = status || "idle";
    barEl.className = `sync-status-bar status-${st}`;
    textEl.textContent = message || (
      st === "syncing" ? "Đang đồng bộ…" :
      st === "ok" ? "Đã đồng bộ" :
      st === "error" ? "Đồng bộ lỗi" :
      "Chưa đồng bộ"
    );
  }

  function renderAccountIdentity(acc) {
    if (!acc) return;
    userHandle.textContent = acc.username ? `@${acc.username}` : "@chua_phat_hien";
    userNickname.textContent = acc.nickname || (acc.isLoggedIn ? "Đã xác minh phiên" : "Chưa đăng nhập");
    if (acc.avatarUrl) userAvatar.src = acc.avatarUrl;
    if (acc.isLoggedIn) {
      statusPill.className = "status-pill status-active";
      statusPillText.textContent = "Đã đăng nhập";
    } else {
      statusPill.className = "status-pill status-idle";
      statusPillText.textContent = "Chưa đăng nhập";
    }
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
    "tokenRevoked",
    "tokenRevokedReason",
    "authRequired",
  ]);

  // Clear stuck banner from the old email-mismatch 403 (server no longer returns it)
  const staleReason = String(data.tokenRevokedReason || "");
  if (data.tokenRevoked && /không khớp|khong khop|personalToken/i.test(staleReason)) {
    await chrome.storage.local.set({
      tokenRevoked: false,
      tokenRevokedReason: "",
      tokenRevokedAt: null,
      authRequired: !data.personalToken,
    });
    data = {
      ...data,
      tokenRevoked: false,
      tokenRevokedReason: "",
      authRequired: !data.personalToken,
    };
  }

  // Seed from bundled config.json. Fresh pairing zip clears a stuck re-auth banner
  // left by older false 403 "email mismatch" errors.
  try {
    const resp = await fetch(chrome.runtime.getURL("config.json"));
    if (resp.ok) {
      const fileCfg = await resp.json();
      const freshPairing =
        typeof fileCfg.pairingCode === "string" &&
        fileCfg.pairingCode.startsWith("ttf_pair_");

      if (freshPairing && (data.tokenRevoked || !data.personalToken)) {
        // Re-check storage to avoid wiping a token that another path just redeemed.
        const latest = await chrome.storage.local.get([
          "personalToken",
          "tokenRevoked",
          "pairingCode",
        ]);
        if (latest.personalToken && !latest.tokenRevoked) {
          data = { ...data, personalToken: latest.personalToken, tokenRevoked: false };
        } else {
          // Never spread full fileCfg — config.json personalToken is empty and can
          // race-overwrite a concurrent successful redeem.
          await chrome.storage.local.set({
            serverUrl: fileCfg.serverUrl || data.serverUrl,
            memberName: fileCfg.memberName || data.memberName,
            userEmail: fileCfg.userEmail || data.userEmail,
            pairingCode: fileCfg.pairingCode,
            tokenRevoked: false,
            tokenRevokedReason: "",
            tokenRevokedAt: null,
            authRequired: false,
          });
          data = {
            ...data,
            serverUrl: fileCfg.serverUrl || data.serverUrl,
            memberName: fileCfg.memberName || data.memberName,
            userEmail: fileCfg.userEmail || data.userEmail,
            pairingCode: fileCfg.pairingCode,
            tokenRevoked: false,
            tokenRevokedReason: "",
            authRequired: false,
          };
          chrome.runtime.sendMessage({ type: "FORCE_PAIR_REDEEM" }).catch(() => {});
        }
      } else if (!data.tokenRevoked && (!data.memberName || !data.personalToken)) {
        await chrome.storage.local.set({
          serverUrl: fileCfg.serverUrl || data.serverUrl,
          memberName: fileCfg.memberName || data.memberName,
          userEmail: fileCfg.userEmail || data.userEmail,
        });
        data = { ...data, ...fileCfg, personalToken: data.personalToken || "" };
      }
    }
  } catch (e) {}

  // Populate Identity Badge
  memberNameText.textContent = data.memberName || data.userEmail || "Nhân sự hệ thống";
  serverUrlText.textContent = data.serverUrl || "http://localhost:3000";

  // Token Management & Security Validation
  const personalTokenInput = document.getElementById("personalTokenInput");
  const testTokenBtn = document.getElementById("testTokenBtn");
  const saveTokenBtn = document.getElementById("saveTokenBtn");
  const tokenSaveMsg = document.getElementById("tokenSaveMsg");
  const authBanner = document.getElementById("authBanner");
  const authBannerText = document.getElementById("authBannerText");
  const identityCard = document.querySelector(".identity-card");

  function setReauthUi(show, reason) {
    if (authBanner) {
      authBanner.style.display = show ? "block" : "none";
    }
    if (show && authBannerText) {
      authBannerText.textContent =
        reason ||
        "Personal Token đã bị thu hồi hoặc vô hiệu hóa. Dán token mới từ trang Cài đặt rồi bấm Lưu.";
    }
    if (personalTokenInput) {
      personalTokenInput.classList.toggle("needs-reauth", !!show);
    }
    if (identityCard) {
      identityCard.classList.toggle("needs-reauth", !!show);
    }
    if (show && statusPill && statusPillText) {
      statusPill.className = "status-pill status-idle";
      statusPillText.textContent = "Cần xác thực";
    }
  }

  if (data.personalToken && personalTokenInput) {
    personalTokenInput.value = data.personalToken;
  }

  if (data.tokenRevoked || data.authRequired) {
    setReauthUi(true, data.tokenRevokedReason);
    if (personalTokenInput) {
      personalTokenInput.value = "";
      personalTokenInput.focus();
    }
  }

  function showTokenMsg(text, isSuccess) {
    if (!tokenSaveMsg) return;
    tokenSaveMsg.textContent = text;
    tokenSaveMsg.className = `token-save-msg ${isSuccess ? "success" : "error"}`;
    tokenSaveMsg.style.display = "block";
  }

  async function verifyTokenOnline(tokenToVerify) {
    // Local format checks first (cheap reject). Well-formed but revoked tokens
    // still require the network call below — that is intentional, not a gap.
    if (!tokenToVerify) {
      return { ok: false, error: "Vui lòng nhập mã Token.", authRequired: true };
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
          Authorization: `Bearer ${tokenToVerify}`,
        },
        body: JSON.stringify({ token: tokenToVerify }),
      });
      const resData = await resp.json().catch(() => ({}));
      if (resp.ok && resData.valid) {
        return { ok: true, user: resData.user };
      }
      const revoked = resp.status === 401 || resp.status === 403;
      return {
        ok: false,
        authRequired: revoked,
        error:
          resData.error ||
          (revoked
            ? "Mã Token không tồn tại hoặc đã bị thu hồi!"
            : "Mã Token không hợp lệ!"),
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
      if (result.authRequired) setReauthUi(true, result.error);
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
      if (result.authRequired) setReauthUi(true, result.error);
      return;
    }

    await chrome.storage.local.set({
      personalToken: candidate,
      memberName: result.user?.name || data.memberName,
      userEmail: result.user?.email || data.userEmail,
      tokenRevoked: false,
      tokenRevokedReason: "",
      tokenRevokedAt: null,
      authRequired: false,
      // Force fresh session after token paste
      accessToken: "",
      accessExpiresAt: 0,
      refreshToken: "",
    });

    chrome.runtime.sendMessage({
      type: "CLEAR_TOKEN_REVOKED",
      updates: {
        personalToken: candidate,
        memberName: result.user?.name || data.memberName,
        userEmail: result.user?.email || data.userEmail,
      },
    });

    if (result.user?.name) {
      memberNameText.textContent = result.user.name;
    }
    setReauthUi(false);
    showTokenMsg(`✓ Đã lưu token thành công cho: ${result.user?.name || "Nhân sự"}`, true);
    setTimeout(() => {
      if (tokenSaveMsg) tokenSaveMsg.style.display = "none";
    }, 4000);
  });

  // Live updates when background marks token revoked mid-session / sync progress
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.tokenRevoked?.newValue === true || changes.authRequired?.newValue === true) {
      setReauthUi(true, changes.tokenRevokedReason?.newValue || data.tokenRevokedReason);
      if (personalTokenInput) personalTokenInput.value = "";
    }
    if (changes.fleetSyncStatus || changes.fleetSyncMessage) {
      setSyncBar(
        fleetSyncBar,
        fleetSyncText,
        changes.fleetSyncStatus?.newValue || data.fleetSyncStatus,
        changes.fleetSyncMessage?.newValue || data.fleetSyncMessage
      );
    }
    if (changes.latestAccount?.newValue) {
      renderAccountIdentity(changes.latestAccount.newValue);
    }
    if (changes.gpmApiPort || changes.gpmApiOnline) {
      const port = changes.gpmApiPort?.newValue;
      const online = changes.gpmApiOnline?.newValue;
      if (online && port) {
        gpmIndicator.className = "gpm-indicator online";
        gpmStatusText.textContent = `localhost:${port} Online`;
      } else if (online === false) {
        gpmIndicator.className = "gpm-indicator offline";
        gpmStatusText.textContent = "GPM Offline";
      }
    }
    if (changes.agentOnline) {
      applyAgentProbe({ online: !!changes.agentOnline.newValue });
    }
  });

  function applyAgentProbe(res) {
    if (!agentIndicator || !agentStatusText) return;
    if (res && res.online) {
      agentIndicator.className = "gpm-indicator online";
      agentStatusText.textContent = "Online · 1 Agent đang chạy";
      if (agentHintText) {
        agentHintText.textContent =
          "OK — 1 Extension + 1 Agent trên máy này. Số liệu do Agent cập nhật.";
      }
    } else {
      agentIndicator.className = "gpm-indicator offline";
      agentStatusText.textContent = "Offline — chạy run-agent.bat";
      if (agentHintText) {
        agentHintText.textContent =
          "Mỗi máy: 1 Extension + 1 Agent. Bật Agent để đồng bộ số liệu TikTok.";
      }
    }
  }

  // Populate Account Card (identity only — metrics live on web / Client Agent)
  if (data.latestAccount) {
    renderAccountIdentity(data.latestAccount);
  }

  chrome.storage.local.get(["fleetSyncStatus", "fleetSyncMessage"], (syncData) => {
    setSyncBar(fleetSyncBar, fleetSyncText, syncData.fleetSyncStatus, syncData.fleetSyncMessage);
  });

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

  // Ask open TikTok tabs to re-detect identity + GPM link (don't rely on click alone).
  chrome.runtime.sendMessage({ type: "REQUEST_IDENTITY_SCAN" }, () => {
    void chrome.runtime.lastError;
  });

  // 2. Auto-detect GPM API port (9495 / 19995 / 19996 / …)
  function applyGpmProbe(res) {
    if (res && res.online) {
      gpmIndicator.className = "gpm-indicator online";
      gpmStatusText.textContent = `localhost:${res.port || "?"} Online`;
    } else {
      gpmIndicator.className = "gpm-indicator offline";
      gpmStatusText.textContent = "GPM Offline (đã dò cổng)";
    }
  }

  chrome.runtime.sendMessage({ type: "PROBE_GPM" }, (res) => {
    if (chrome.runtime.lastError) {
      gpmIndicator.className = "gpm-indicator offline";
      gpmStatusText.textContent = "GPM Offline";
      return;
    }
    applyGpmProbe(res);
  });

  // Paint cached agent/GPM status immediately so popup is not stuck on "Đang kiểm tra…"
  // while the service worker is busy with a long resolve/report.
  chrome.storage.local.get(
    ["agentOnline", "gpmApiPort", "gpmApiOnline", "gpmApiBase"],
    (cached) => {
      if (cached.agentOnline === true || cached.agentOnline === false) {
        applyAgentProbe({ online: !!cached.agentOnline });
      }
      if (cached.gpmApiOnline && (cached.gpmApiPort || cached.gpmApiBase)) {
        const port =
          cached.gpmApiPort ||
          String(cached.gpmApiBase || "").match(/:(\d+)/)?.[1];
        applyGpmProbe({ online: true, port });
      } else if (cached.gpmApiOnline === false) {
        applyGpmProbe({ online: false });
      }
    }
  );

  chrome.runtime.sendMessage({ type: "PROBE_AGENT" }, (res) => {
    if (chrome.runtime.lastError) {
      applyAgentProbe({ online: false });
      return;
    }
    applyAgentProbe(res);
  });

  // 3. Trigger Manual Sync Action
  syncNowBtn.addEventListener("click", () => {
    syncNowBtn.disabled = true;
    syncNowBtn.classList.add("spinning");
    syncBtnText.textContent = "Đang quét GPM...";
    setSyncBar(fleetSyncBar, fleetSyncText, "syncing", "Đang quét GPMLogin…");

    chrome.runtime.sendMessage({ type: "TRIGGER_MANUAL_SYNC" }, (response) => {
      syncNowBtn.disabled = false;
      syncNowBtn.classList.remove("spinning");
      syncBtnText.textContent = "Đồng bộ GPM ngay";

      if (chrome.runtime.lastError) {
        setSyncBar(fleetSyncBar, fleetSyncText, "error", chrome.runtime.lastError.message);
        alert(`Lỗi extension: ${chrome.runtime.lastError.message}`);
        return;
      }

      if (response && response.success) {
        gpmProfileCount.textContent = `${response.count} profiles`;
        const now = new Date();
        lastSyncText.textContent = `Đồng bộ lần cuối: ${now.toLocaleTimeString("vi-VN")}`;
        setSyncBar(fleetSyncBar, fleetSyncText, "ok", `Đã đồng bộ ${response.count} profiles lên server.`);
        chrome.runtime.sendMessage({ type: "PROBE_GPM" }, applyGpmProbe);
      } else if (response && response.authRequired) {
        setReauthUi(true, response.error);
        setSyncBar(fleetSyncBar, fleetSyncText, "error", response.error || "Cần xác thực lại");
        if (personalTokenInput) {
          personalTokenInput.value = "";
          personalTokenInput.focus();
        }
        alert(
          response.error ||
            "Token đã bị thu hồi. Vui lòng nhập Personal Token mới từ trang Cài đặt."
        );
      } else if (response && response.skipped) {
        const reason = response.reason || "unknown";
        if (reason === "GPMLogin offline") {
          setSyncBar(fleetSyncBar, fleetSyncText, "error", "GPMLogin offline");
          alert("Không thể kết nối đến GPMLogin. Hãy chắc chắn GPMLogin đang mở (extension tự dò cổng 9495/19995/19996…).");
        } else {
          setSyncBar(fleetSyncBar, fleetSyncText, "idle", `Bỏ qua: ${reason}`);
          alert(`Bỏ qua: ${reason}`);
        }
      } else {
        setSyncBar(fleetSyncBar, fleetSyncText, "error", response?.error || "Đồng bộ thất bại");
        alert(
          response?.error ||
            "Đồng bộ thất bại. Kiểm tra Personal Token và máy chủ TikTokFlow."
        );
      }
    });
  });
});
