"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
  Settings,
  User,
  Shield,
  Palette,
  Key,
  Bot,
  RefreshCw,
  Copy,
  Check,
  Eye,
  EyeOff,
  Download,
  AlertTriangle,
  Lock,
  Sparkles,
  Sun,
  Moon,
  Laptop,
  CheckCircle2,
  Calendar,
  Zap,
  Trash2,
  Pencil,
  Plus,
  ExternalLink,
  ChevronRight,
  Clock,
  ShieldCheck,
  Layers,
  Bug,
  Camera,
  Upload,
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import ScheduleModal, {
  SyncScheduleConfig,
  SyncScheduleItem,
} from "@/features/schedule/ScheduleModal";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import BugReportsAdminSection from "@/features/settings/BugReportsAdminSection";

type ModalTarget = "GPM_FLEET" | "TIKTOK_SWEEPER" | null;
type SettingsTab = "profile" | "security" | "appearance" | "integrations" | "admin_system" | "admin_bugs";

// Preset trendy avatars for quick selection
const PRESET_AVATARS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80",
];

export default function SettingsPage() {
  const { data: session } = useSession();
  const rawRole = (session?.user as any)?.role || (session?.user as any)?.userType || "STAFF";
  const isAdmin = String(rawRole).toUpperCase() === "ADMIN";
  const { theme, setTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  // Query self profile
  const { data: userProfile, refetch: refetchProfile, isLoading: loadingProfile } =
    trpc.user.me.useQuery();

  // Open bug reports count for Admin badge
  const { data: bugStats } = trpc.support.listBugReports.useQuery(
    { status: "OPEN" },
    { enabled: isAdmin }
  );
  const openBugsCount = bugStats?.openCount ?? 0;

  // Deep-linking support (e.g. /settings?tab=bugs from alert email)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "bugs" || tab === "admin_bugs" || tab === "bug_reports") {
        setActiveTab("admin_bugs");
      } else if (tab === "cron" || tab === "schedule" || tab === "admin_system") {
        setActiveTab("admin_system");
      } else if (tab === "security") {
        setActiveTab("security");
      } else if (tab === "integrations" || tab === "token") {
        setActiveTab("integrations");
      } else if (tab === "appearance" || tab === "theme") {
        setActiveTab("appearance");
      }
    }
  }, []);

  // Mutations
  const updateProfileMutation = trpc.user.updateProfile.useMutation();
  const updatePasswordMutation = trpc.user.updatePassword.useMutation();
  const regenerateTokenMutation = trpc.user.regenerateToken.useMutation();

  // Form States - Profile
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload Avatar directly to Supabase Storage
  const handleAvatarFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn định dạng tệp ảnh (PNG, JPG, WEBP, GIF).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Kích thước ảnh tối đa là 5MB.");
      return;
    }

    const toastId = toast.loading("Đang tải ảnh lên Supabase Storage...");
    try {
      setUploadingAvatar(true);
      const formData = new FormData();
      formData.append("files", file);
      formData.append("bucket", "avatars");
      formData.append("folder", "users");

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.urls?.[0]) {
        toast.dismiss(toastId);
        throw new Error(data.error || "Không thể tải ảnh lên Supabase.");
      }

      const newAvatarUrl = data.urls[0];
      setAvatarUrl(newAvatarUrl);

      // Save directly to user profile
      await updateProfileMutation.mutateAsync({
        avatar: newAvatarUrl,
      });
      await refetchProfile();
      toast.dismiss(toastId);
      toast.success("Đã tải ảnh đại diện lên Supabase và lưu hồ sơ thành công!");
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(err.message || "Lỗi tải ảnh lên Supabase.");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Form States - Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Personal Token States
  const [showToken, setShowToken] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [isRegeneratingToken, setIsRegeneratingToken] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);

  // Sync profile data into local states
  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile.name || "");
      setUsername(userProfile.username || "");
      setAvatarUrl(userProfile.avatar || userProfile.image || "");
      setPhone(userProfile.phone || "");
    }
  }, [userProfile]);

  // Compute Password Strength
  const passwordStrength = useMemo(() => {
    if (!newPassword) return { score: 0, label: "Chưa nhập", color: "bg-slate-300" };
    let score = 0;
    if (newPassword.length >= 8) score += 1;
    if (/[A-Z]/.test(newPassword)) score += 1;
    if (/[0-9]/.test(newPassword)) score += 1;
    if (/[^A-Za-z0-9]/.test(newPassword)) score += 1;

    switch (score) {
      case 1:
        return { score: 25, label: "Yếu", color: "bg-rose-500" };
      case 2:
        return { score: 50, label: "Trung bình", color: "bg-amber-500" };
      case 3:
        return { score: 75, label: "Khá", color: "bg-blue-500" };
      case 4:
        return { score: 100, label: "Rất mạnh", color: "bg-emerald-500" };
      default:
        return { score: 10, label: "Rất yếu", color: "bg-rose-500" };
    }
  }, [newPassword]);

  // Handle Profile Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setProfileSaving(true);
      await updateProfileMutation.mutateAsync({
        name: displayName.trim(),
        username: username.trim(),
        avatar: avatarUrl.trim(),
        phone: phone.trim(),
      });
      await refetchProfile();
      toast.success("Cập nhật thông tin hồ sơ thành công!");
    } catch (err: any) {
      toast.error(err?.message || "Không thể cập nhật hồ sơ");
    } finally {
      setProfileSaving(false);
    }
  };

  // Handle Password Update
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Mật khẩu mới phải có ít nhất 8 ký tự!");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Mật khẩu xác nhận không khớp!");
      return;
    }

    try {
      setPasswordSaving(true);
      await updatePasswordMutation.mutateAsync({
        currentPassword: currentPassword || undefined,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Thay đổi mật khẩu thành công! Hãy lưu lại mật khẩu mới.");
    } catch (err: any) {
      toast.error(err?.message || "Lỗi khi đổi mật khẩu");
    } finally {
      setPasswordSaving(false);
    }
  };

  // Handle Token Copy
  const handleCopyToken = () => {
    const token = userProfile?.extensionToken || "";
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopiedToken(true);
    toast.success("Đã sao chép Personal Token vào clipboard!");
    setTimeout(() => setCopiedToken(false), 2500);
  };

  // Handle Token Regenerate
  const handleRegenerateToken = async () => {
    try {
      setIsRegeneratingToken(true);
      const res = await regenerateTokenMutation.mutateAsync();
      await refetchProfile();
      setShowRegenConfirm(false);
      toast.success("Đã cấp lại Token mới thành công! Vui lòng cập nhật lại Extension/Agent.");
    } catch (err: any) {
      toast.error(err?.message || "Lỗi cấp lại Token");
    } finally {
      setIsRegeneratingToken(false);
    }
  };

  // ==========================================
  // ADMIN SYSTEM CONFIG & CRON STATE (Tab 5)
  // ==========================================
  const [config, setConfig] = useState<any>({
    gpmConfig: {
      baseUrl: "http://localhost:9495/api/v1",
      autoSyncTime: "09:00",
      enabled: true,
    },
  });
  const [gpmSchedule, setGpmSchedule] = useState<SyncScheduleConfig>({ autoEnabled: false, schedules: [] });
  const [sweeperSchedule, setSweeperSchedule] = useState<SyncScheduleConfig>({ autoEnabled: false, schedules: [] });
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [modalTarget, setModalTarget] = useState<ModalTarget>(null);
  const [editingItem, setEditingItem] = useState<SyncScheduleItem | null>(null);
  const [manualGpmSyncing, setManualGpmSyncing] = useState(false);
  const [manualSweeperSyncing, setManualSweeperSyncing] = useState(false);
  const [gpmSaveStatus, setGpmSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: configData } = trpc.settings.getAll.useQuery(undefined, { enabled: isAdmin });
  const setConfigMutation = trpc.settings.set.useMutation();

  const parseScheduleConfig = (raw: any): SyncScheduleConfig => {
    if (!raw) return { autoEnabled: false, schedules: [] };
    let schedules: SyncScheduleItem[] = [];
    if (Array.isArray(raw.schedules)) {
      schedules = raw.schedules;
    } else if (raw.repeat) {
      schedules = [
        {
          id: "sch_1",
          enabled: true,
          repeat: raw.repeat || "HOURLY",
          intervalMinutes: raw.intervalMinutes || 60,
          timeOfDay: raw.timeOfDay || "17:00",
          startDate: raw.startDate || new Date().toISOString().split("T")[0],
          timezone: raw.timezone || "GMT+07:00, Asia/Bangkok",
          ends: raw.ends || "NEVER",
          endDate: raw.endDate || "",
          instructions: raw.instructions || "",
          lastRunAt: raw.lastRunAt,
          nextRunAt: raw.nextRunAt,
        },
      ];
    }
    return {
      autoEnabled: raw.autoEnabled ?? (raw.mode === "AUTO"),
      schedules,
    };
  };

  useEffect(() => {
    if (configData && isAdmin) {
      setConfig({
        gpmConfig: configData["gpm_config"] || config.gpmConfig,
      });
      const rawGpm = configData["gpm_sync_schedule"] || configData["sync_schedule"];
      setGpmSchedule(parseScheduleConfig(rawGpm));
      const rawSweeper = configData["tiktok_sweeper_schedule"];
      setSweeperSchedule(parseScheduleConfig(rawSweeper));
    }
  }, [configData, isAdmin]);

  const persistGpmConfig = async (newGpmConfig: any) => {
    try {
      setGpmSaveStatus("saving");
      await setConfigMutation.mutateAsync({
        key: "gpm_config",
        value: newGpmConfig,
        description: "Cấu hình GPMLogin Local API",
      });
      utils.settings.getAll.invalidate();
      setGpmSaveStatus("saved");
      setTimeout(() => setGpmSaveStatus("idle"), 2500);
    } catch (err: any) {
      setGpmSaveStatus("idle");
      setSaveMsg(`❌ Lỗi lưu cấu hình: ${err.message}`);
    }
  };

  const handleManualTriggerGpm = async () => {
    try {
      setManualGpmSyncing(true);
      const res = await fetch("/api/gpm/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(`Đồng bộ thành công: ${data.message || "Đã xong"}`);
      } else {
        toast.error(`Lỗi: ${data.error || "Không thể đồng bộ"}`);
      }
    } catch (e: any) {
      toast.error(`Lỗi: ${e.message}`);
    } finally {
      setManualGpmSyncing(false);
    }
  };

  const handleManualTriggerSweeper = async () => {
    try {
      setManualSweeperSyncing(true);
      const res = await fetch("/api/gpm/sweeper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 10 }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || "Đã quét vét số liệu TikTok thành công!");
      } else {
        toast.error(`Lỗi: ${data.error || "Không thể quét vét"}`);
      }
    } catch (e: any) {
      toast.error(`Lỗi: ${e.message}`);
    } finally {
      setManualSweeperSyncing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn max-w-6xl mx-auto pb-16">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Settings className="w-5 h-5 animate-spin-slow" />
            </div>
            Cài Đặt & Cá Nhân Hóa
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Quản lý thông tin hồ sơ, mật khẩu bảo mật, giao diện hiển thị và cấu hình tích hợp tự động hóa.
          </p>
        </div>

        {/* Quick User Identity Pill */}
        {userProfile && (
          <div className="flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
            <img
              src={userProfile.avatar || userProfile.image || PRESET_AVATARS[0]}
              alt={userProfile.name || "User"}
              className="w-9 h-9 rounded-xl object-cover ring-2 ring-indigo-500/30"
            />
            <div className="text-left leading-tight">
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                {userProfile.name || userProfile.username || "Thành viên"}
                <span
                  className={`px-1.5 py-0.2 rounded-md text-xs font-black uppercase ${
                    userProfile.role === "ADMIN"
                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                      : userProfile.role === "LEAD"
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                  }`}
                >
                  {userProfile.role}
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                @{userProfile.username || userProfile.email?.split("@")[0]}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modern Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab("profile")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "profile"
              ? "bg-white dark:bg-slate-800 text-pink-600 dark:text-pink-400 shadow-xs border border-slate-200/80 dark:border-slate-700/80"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <User className="w-4 h-4" />
          <span>Hồ Sơ Cá Nhân</span>
        </button>

        <button
          onClick={() => setActiveTab("security")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "security"
              ? "bg-white dark:bg-slate-800 text-pink-600 dark:text-pink-400 shadow-xs border border-slate-200/80 dark:border-slate-700/80"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Bảo Mật & Mật Khẩu</span>
        </button>

        <button
          onClick={() => setActiveTab("appearance")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "appearance"
              ? "bg-white dark:bg-slate-800 text-pink-600 dark:text-pink-400 shadow-xs border border-slate-200/80 dark:border-slate-700/80"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Palette className="w-4 h-4" />
          <span>Giao Diện (Theme)</span>
        </button>

        <button
          onClick={() => setActiveTab("integrations")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "integrations"
              ? "bg-white dark:bg-slate-800 text-pink-600 dark:text-pink-400 shadow-xs border border-slate-200/80 dark:border-slate-700/80"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Key className="w-4 h-4" />
          <span>Personal Token & Tải Gói</span>
        </button>

        {isAdmin && (
          <button
            onClick={() => setActiveTab("admin_system")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "admin_system"
                ? "bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-md shadow-pink-500/20"
                : "text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Lịch Trình Cron (Admin)</span>
          </button>
        )}

        {isAdmin && (
          <button
            onClick={() => setActiveTab("admin_bugs")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "admin_bugs"
                ? "bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-md shadow-pink-500/20"
                : "text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
            }`}
          >
            <Bug className="w-4 h-4" />
            <span>Báo Cáo Sự Cố (Bug Hub)</span>
            {openBugsCount > 0 && (
              <span
                className={`text-[10px] font-black px-1.5 py-0.5 rounded-full transition-colors ${
                  activeTab === "admin_bugs"
                    ? "bg-white text-rose-600"
                    : "bg-rose-500 text-white"
                }`}
              >
                {openBugsCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* ========================================================= */}
      {/* TAB 1: PROFILE TAB                                        */}
      {/* ========================================================= */}
      {activeTab === "profile" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
          {/* Avatar Card */}
          <div className="lg:col-span-1 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs flex flex-col items-center text-center">
            {/* Hidden native file input for Supabase upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarFileUpload}
            />

            <div
              onClick={() => !uploadingAvatar && fileInputRef.current?.click()}
              className="relative group cursor-pointer"
              title="Nhấp vào đây để tải ảnh đại diện từ máy tính lên Supabase"
            >
              <img
                src={avatarUrl || PRESET_AVATARS[0]}
                alt="Avatar"
                className="w-28 h-28 rounded-3xl object-cover ring-4 ring-pink-500/20 shadow-md group-hover:scale-105 transition-transform"
                onError={(e) => {
                  (e.target as any).src = PRESET_AVATARS[0];
                }}
              />

              {/* Hover overlay with Camera */}
              <div className="absolute inset-0 rounded-3xl bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white backdrop-blur-[1px]">
                {uploadingAvatar ? (
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                ) : (
                  <>
                    <Camera className="w-6 h-6 mb-1 text-white drop-shadow" />
                    <span className="text-[11px] font-bold">Đổi ảnh</span>
                  </>
                )}
              </div>

              {/* Floating Camera Button on bottom-right corner */}
              <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-gradient-to-tr from-pink-600 to-rose-500 text-white flex items-center justify-center ring-2 ring-white dark:ring-slate-900 shadow-md transition-transform group-hover:scale-110">
                {uploadingAvatar ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </div>
            </div>

            {/* Quick Upload Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="mt-3.5 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/40 dark:hover:bg-pink-900/50 text-pink-600 dark:text-pink-400 border border-pink-200/80 dark:border-pink-800/60 text-xs font-bold transition-all cursor-pointer disabled:opacity-60 shadow-2xs"
            >
              {uploadingAvatar ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang tải lên Supabase...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>Tải Ảnh Mới Lên</span>
                </>
              )}
            </button>

            <h3 className="text-base font-bold text-slate-900 dark:text-white mt-4">
              {displayName || userProfile?.name || "Thành viên"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              @{username || userProfile?.username || "user"}
            </p>

            <div className="w-full border-t border-slate-100 dark:border-slate-800 my-4" />

            <div className="w-full text-left">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 block">
                Chọn Avatar Mẫu (Quick Presets):
              </label>
              <div className="grid grid-cols-6 gap-2">
                {PRESET_AVATARS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAvatarUrl(p)}
                    className={`rounded-xl overflow-hidden aspect-square border-2 transition-all cursor-pointer ${
                      avatarUrl === p ? "border-indigo-500 scale-105 shadow-md" : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img src={p} alt={`Preset ${idx}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Profile Edit Form */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs">
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <User className="w-5 h-5 text-indigo-500" />
              Thông Tin Tài Khoản
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Cập nhật tên hiển thị, username định danh và ảnh đại diện trên toàn hệ thống TikTokFlow.
            </p>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                    Tên Hiển Thị (Họ & Tên)
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ví dụ: Nguyễn Văn A"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                    Username Định Danh (@)
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ví dụ: van_a_tiktok"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                    Địa Chỉ Email (Đăng Nhập)
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={userProfile?.email || ""}
                      disabled
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                    />
                    <span className="absolute right-3 top-2.5 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                      Verified
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                    Số Điện Thoại Liên Hệ
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ví dụ: 0987654321"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Group & Role Information Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase">Vai trò của bạn</div>
                    <div className="text-xs font-black text-slate-800 dark:text-slate-200">
                      {userProfile?.role === "ADMIN"
                        ? "Quản Trị Viên (Admin)"
                        : userProfile?.role === "LEAD"
                        ? "Trưởng Nhóm (Team Lead)"
                        : "Vận Hành Viên (Staff)"}
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase">Nhóm Trực Thuộc</div>
                    <div className="text-xs font-black text-slate-800 dark:text-slate-200">
                      {userProfile?.group?.name || "Chưa phân nhóm"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-3">
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-md shadow-pink-600/20 active:scale-95 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  {profileSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Lưu Thay Đổi Hồ Sơ</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: SECURITY TAB                                       */}
      {/* ========================================================= */}
      {activeTab === "security" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
          {/* Security Status Card */}
          <div className="lg:col-span-1 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Bảo Vệ Tài Khoản</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Tất cả mật khẩu trên hệ thống được băm bằng thuật toán Bcrypt 10 vòng, bảo đảm an toàn dữ liệu tuyệt đối theo tiêu chuẩn OWASP.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Trạng thái:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Hoạt động an toàn
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Mật khẩu:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {userProfile?.hasPassword ? "Đã thiết lập" : "Đăng nhập OAuth"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Lần đăng nhập cuối:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {userProfile?.lastActiveAt ? new Date(userProfile.lastActiveAt).toLocaleString("vi-VN") : "Hôm nay"}
                </span>
              </div>
            </div>

            <button
              onClick={() => signOut({ callbackUrl: "/signin" })}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all cursor-pointer"
            >
              Đăng Xuất Khỏi Tài Khoản
            </button>
          </div>

          {/* Password Change Form */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs">
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <Lock className="w-5 h-5 text-indigo-500" />
              Thay Đổi Mật Khẩu Đăng Nhập
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Mật khẩu mới yêu cầu tối thiểu 8 ký tự, bao gồm chữ hoa, chữ số hoặc ký tự đặc biệt để đạt độ an toàn cao nhất.
            </p>

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              {userProfile?.hasPassword && (
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                    Mật Khẩu Hiện Tại
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPass ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Nhập mật khẩu đang sử dụng"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPass(!showCurrentPass)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                  Mật Khẩu Mới
                </label>
                <div className="relative">
                  <input
                    type={showNewPass ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nhập mật khẩu mới (tối thiểu 8 ký tự)"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Password Strength Meter */}
                {newPassword && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Độ mạnh mật khẩu:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        {passwordStrength.label}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${passwordStrength.color} transition-all duration-300`}
                        style={{ width: `${passwordStrength.score}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                  Xác Nhận Mật Khẩu Mới
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
                />
                {confirmPassword && newPassword && (
                  <p className="text-xs mt-1 flex items-center gap-1 font-semibold">
                    {newPassword === confirmPassword ? (
                      <span className="text-emerald-500 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Mật khẩu xác nhận khớp hoàn toàn
                      </span>
                    ) : (
                      <span className="text-rose-500 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Mật khẩu xác nhận không khớp
                      </span>
                    )}
                  </p>
                )}
              </div>

              <div className="flex justify-end pt-3">
                <button
                  type="submit"
                  disabled={passwordSaving || !newPassword || newPassword !== confirmPassword}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-md shadow-pink-600/20 active:scale-95 transition-all disabled:opacity-40 cursor-pointer flex items-center gap-2"
                >
                  {passwordSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Cập Nhật Mật Khẩu Mới</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: APPEARANCE (THEME) TAB                             */}
      {/* ========================================================= */}
      {activeTab === "appearance" && (
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs animate-fadeIn space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <Palette className="w-5 h-5 text-pink-500" />
              Chế Độ Giao Diện & Trải Nghiệm Người Dùng
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Chọn chủ đề màu sắc phù hợp với môi trường làm việc của bạn. Giao diện được tối ưu hóa cho màn hình làm việc liên tục.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {/* Light Card */}
            <div
              onClick={() => setTheme("light")}
              className={`p-5 rounded-3xl border-2 transition-all cursor-pointer relative overflow-hidden group ${
                theme === "light"
                  ? "border-pink-600 bg-pink-50/20 dark:bg-pink-950/20 shadow-lg shadow-pink-500/10 scale-[1.02]"
                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700"
              }`}
            >
              <div className="w-full h-24 rounded-2xl bg-slate-100 border border-slate-200 p-3 flex flex-col justify-between shadow-inner">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                </div>
                <div className="h-3 w-3/4 rounded-md bg-slate-300" />
              </div>

              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-2">
                  <Sun className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-bold text-slate-900 dark:text-white">Giao Diện Sáng (Light)</span>
                </div>
                {theme === "light" && <Check className="w-4 h-4 text-pink-600 dark:text-pink-400" />}
              </div>
            </div>

            {/* Dark Card */}
            <div
              onClick={() => setTheme("dark")}
              className={`p-5 rounded-3xl border-2 transition-all cursor-pointer relative overflow-hidden group ${
                theme === "dark"
                  ? "border-pink-600 bg-pink-50/20 dark:bg-pink-950/20 shadow-lg shadow-pink-500/10 scale-[1.02]"
                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700"
              }`}
            >
              <div className="w-full h-24 rounded-2xl bg-slate-950 border border-slate-800 p-3 flex flex-col justify-between shadow-inner">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500" />
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                </div>
                <div className="h-3 w-3/4 rounded-md bg-slate-700" />
              </div>

              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-2">
                  <Moon className="w-4 h-4 text-pink-400" />
                  <span className="text-sm font-bold text-slate-900 dark:text-white">Giao Diện Tối (Dark Neon)</span>
                </div>
                {theme === "dark" && <Check className="w-4 h-4 text-pink-600 dark:text-pink-400" />}
              </div>
            </div>

            {/* System Card */}
            <div
              onClick={() => setTheme("system")}
              className={`p-5 rounded-3xl border-2 transition-all cursor-pointer relative overflow-hidden group ${
                theme === "system"
                  ? "border-pink-600 bg-pink-50/20 dark:bg-pink-950/20 shadow-lg shadow-pink-500/10 scale-[1.02]"
                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700"
              }`}
            >
              <div className="w-full h-24 rounded-2xl bg-gradient-to-r from-slate-100 to-slate-950 border border-slate-300 dark:border-slate-700 p-3 flex flex-col justify-between shadow-inner">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                </div>
                <div className="h-3 w-3/4 rounded-md bg-slate-400/50" />
              </div>

              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-bold text-slate-900 dark:text-white">Theo Hệ Thống (Auto)</span>
                </div>
                {theme === "system" && <Check className="w-4 h-4 text-pink-600 dark:text-pink-400" />}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: INTEGRATIONS & PERSONAL TOKEN TAB                  */}
      {/* ========================================================= */}
      {activeTab === "integrations" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Main Personal Token Card */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-pink-500" />
                  Mã Khóa Định Danh Cá Nhân (Personal Token)
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  Mã khóa bí mật dùng để định danh tài khoản của bạn trên máy tính. Cả <strong>Extension trên GPMLogin</strong> và <strong>Client Agent</strong> đều dùng mã này để tự động gửi số liệu về đúng tài khoản của bạn.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowRegenConfirm(true)}
                className="px-3.5 py-2 rounded-xl text-sm font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-all cursor-pointer whitespace-nowrap self-start sm:self-auto flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Cấp Lại Token Mới</span>
              </button>
            </div>

            {/* Token Display Box */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="font-mono text-sm text-slate-800 dark:text-slate-200 tracking-wider truncate select-all">
                {showToken
                  ? userProfile?.extensionToken || "Chưa có token"
                  : userProfile?.extensionToken
                  ? `${userProfile.extensionToken.slice(0, 10)}••••••••••••••••••••••••${userProfile.extensionToken.slice(-6)}`
                  : "Chưa có token"}
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="px-3 py-1.5 rounded-lg text-sm font-bold bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showToken ? "Ẩn" : "Hiện"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyToken}
                  className="px-3 py-1.5 rounded-lg text-sm font-bold bg-pink-600 hover:bg-pink-500 text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {copiedToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedToken ? "Đã chép!" : "Sao chép"}</span>
                </button>
              </div>
            </div>

            {/* Guide & Note on Token Usage */}
            <div className="mt-4 p-5 sm:p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 text-sm text-slate-700 dark:text-slate-300 space-y-3 leading-relaxed">
              <div className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-pink-500 shrink-0" />
                <span>Hướng dẫn sử dụng & Quy trình đổi Token:</span>
              </div>
              <ul className="list-disc pl-5 space-y-2.5 text-slate-700 dark:text-slate-300 text-sm">
                <li>
                  <strong className="text-slate-900 dark:text-white">Tự động cài đặt:</strong> Khi bạn bấm nút tải Extension hoặc Client Agent ở bên dưới, hệ thống <strong>đã tự động tích hợp sẵn mã Token này vào file cấu hình</strong>. Tải về là dùng được ngay (đặc biệt với Extension, bạn có thể nạp trực tiếp file <code className="font-mono text-pink-600 dark:text-pink-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs font-bold">.zip</code> lên GPMLogin mà không cần giải nén).
                </li>
                <li>
                  <strong className="text-slate-900 dark:text-white">Khi cấp lại Token mới hoặc đổi máy tính:</strong> Mã Token cũ sẽ lập tức bị vô hiệu hóa để bảo mật. Bạn có thể cập nhật rất đơn giản theo 1 trong 2 cách:
                  <div className="pl-0 sm:pl-3 pt-2 space-y-2 text-slate-700 dark:text-slate-300 text-sm">
                    <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 text-sm">
                      ➔ <strong className="text-pink-600 dark:text-pink-400">Cách 1 (Khuyên dùng):</strong> Tải lại bản Extension hoặc Client Agent mới từ các nút bên dưới (hệ thống tự động điền sẵn Token mới).
                    </div>
                    <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 text-sm space-y-1">
                      <div>➔ <strong className="text-cyan-600 dark:text-cyan-400">Cách 2 (Nhập trực tiếp):</strong></div>
                      <div className="pl-4 space-y-1 text-sm">
                        <div>• <strong>Extension:</strong> Mở popup tiện ích trên trình duyệt, dán mã Token mới rồi bấm <strong>Kiểm tra</strong> hoặc <strong>Lưu</strong>.</div>
                        <div>• <strong>Client Agent:</strong> Mở file <code className="font-mono text-cyan-600 dark:text-cyan-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs font-bold">setup-agent.bat</code> chọn phím <strong>3</strong> để nhập và test mã mới.</div>
                      </div>
                    </div>
                  </div>
                </li>
                <li>
                  <strong className="text-slate-900 dark:text-white">Bảo mật:</strong> Hãy giữ bí mật mã Token này và không gửi cho người khác để tránh đồng bộ nhầm dữ liệu.
                </li>
              </ul>
            </div>
          </div>

          {/* Quick Downloads */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Extension Download */}
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="w-11 h-11 rounded-2xl bg-pink-500/10 text-pink-600 dark:text-pink-400 flex items-center justify-center mb-3">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">TikTokFlow Extension (TikTokFlow Companion)</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  Cài đặt trực tiếp vào tiện ích Extensions của GPMLogin, tự động thu thập và đồng bộ các số liệu quan trọng như doanh thu từ nhiều nguồn, lượt xem, dữ liệu video và các chỉ số liên quan mỗi khi mở profile và đăng nhập tài khoản TikTok. Dữ liệu sau đó được gửi về máy chủ để tổng hợp, phân tích và quản lý tập trung.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-slate-400">Đã nhúng sẵn Token</span>
                <a
                  href="/api/extension/download"
                  download
                  className="px-4 py-2 rounded-xl text-sm font-bold bg-pink-600 hover:bg-pink-500 text-white transition-all shadow-md shadow-pink-600/20 flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải Extension (.zip)</span>
                </a>
              </div>
            </div>

            {/* Client Agent Download */}
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center mb-3">
                  <Bot className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">TikTokFlow Client Agent Worker</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  Phần mềm hoạt động nền trên Windows, tự động quét và đồng bộ dữ liệu theo lịch định kỳ hoặc ngay khi hệ thống khởi động. Quá trình vận hành hoàn toàn tự động, không chiếm quyền điều khiển chuột và không yêu cầu mở hoặc thao tác trình duyệt thủ công.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-slate-400">Đã nhúng sẵn Token</span>
                <a
                  href="/api/client-agent/download"
                  download
                  className="px-4 py-2 rounded-xl text-sm font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-all shadow-md shadow-cyan-600/20 flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải Client Agent (.zip)</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Regenerate Token */}
      {showRegenConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Xác Nhận Cấp Lại Mã Token Mới?
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                Khi bạn tạo mã mới, mã Token cũ sẽ bị vô hiệu hóa ngay lập tức vì lý do bảo mật.
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                Sau khi cấp lại, bạn chỉ cần tải lại gói Extension và Client Agent mới ở bên dưới (đã có sẵn Token mới), hoặc dán mã mới vào Extension và file cài đặt Agent là xong.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRegenConfirm(false)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                disabled={isRegeneratingToken}
                onClick={handleRegenerateToken}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-amber-600 hover:bg-amber-500 text-white transition-all shadow-md shadow-amber-600/20 cursor-pointer flex items-center gap-2"
              >
                {isRegeneratingToken && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Đồng Ý Cấp Lại</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 5: ADMIN SYSTEM CONFIG & CRON SCHEDULES               */}
      {/* ========================================================= */}
      {activeTab === "admin_system" && isAdmin && (
        <div className="space-y-6 animate-fadeIn">
          {/* Base URL Settings Card */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs">
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <Bot className="w-5 h-5 text-indigo-500" />
              Cổng Kết Nối GPMLogin Local REST API
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Cổng REST API nội bộ mặc định của phần mềm GPMLogin đang chạy trên máy chủ điều hành.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <input
                type="text"
                value={config.gpmConfig?.baseUrl || "http://localhost:9495/api/v1"}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    gpmConfig: { ...config.gpmConfig, baseUrl: e.target.value },
                  })
                }
                className="w-full sm:w-96 px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 font-mono text-slate-900 dark:text-white"
              />

              <button
                type="button"
                onClick={() => persistGpmConfig(config.gpmConfig)}
                disabled={gpmSaveStatus === "saving"}
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              >
                {gpmSaveStatus === "saving" ? "Đang lưu..." : gpmSaveStatus === "saved" ? "Đã lưu!" : "Lưu Base URL"}
              </button>
            </div>
          </div>

          {/* Schedule 1: GPM Fleet Inventory Schedule */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-cyan-500" />
                  1. Lịch Kiểm Kê Profile GPMLogin (Fleet Inventory Schedule)
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Tự động quét danh mục profile mới tạo trong GPMLogin và thêm vào danh sách quản lý.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleManualTriggerGpm}
                  disabled={manualGpmSyncing}
                  className="px-3.5 py-2 rounded-xl text-sm font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/10 hover:bg-cyan-100 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${manualGpmSyncing ? "animate-spin" : ""}`} />
                  <span>Quét Ngay</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModalTarget("GPM_FLEET");
                    setEditingItem(null);
                    setIsScheduleModalOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm Lịch</span>
                </button>
              </div>
            </div>

            {/* Schedule List Items */}
            <div className="space-y-2.5">
              {gpmSchedule.schedules.length === 0 ? (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                  Chưa thiết lập lịch kiểm kê tự động.
                </div>
              ) : (
                gpmSchedule.schedules.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-500 flex items-center justify-center font-bold text-xs">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {item.repeat === "HOURLY" ? `Mỗi ${item.intervalMinutes || 60} phút` : `Lúc ${item.timeOfDay || "17:00"}`}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          Lần chạy cuối: {item.lastRunAt ? new Date(item.lastRunAt).toLocaleString("vi-VN") : "Chưa chạy"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setModalTarget("GPM_FLEET");
                          setEditingItem(item);
                          setIsScheduleModalOpen(true);
                        }}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Schedule 2: Deep TikTok Sweeper Schedule */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-500" />
                  2. Lịch Quét Vét TikTok Studio Ngầm (Deep Sweeper Schedule)
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Khởi chạy headless Chromium quét vét số liệu Creator Rewards, RPM và video mới nhất.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleManualTriggerSweeper}
                  disabled={manualSweeperSyncing}
                  className="px-3.5 py-2 rounded-xl text-sm font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${manualSweeperSyncing ? "animate-spin" : ""}`} />
                  <span>Quét Vét Ngay</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModalTarget("TIKTOK_SWEEPER");
                    setEditingItem(null);
                    setIsScheduleModalOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm Lịch</span>
                </button>
              </div>
            </div>

            {/* Schedule List Items */}
            <div className="space-y-2.5">
              {sweeperSchedule.schedules.length === 0 ? (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                  Chưa thiết lập lịch quét vét ngầm tự động.
                </div>
              ) : (
                sweeperSchedule.schedules.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold text-xs">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {item.repeat === "DAILY" ? `Hàng ngày lúc ${item.timeOfDay || "18:00"}` : `Mỗi ${item.intervalMinutes || 60} phút`}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          Lần chạy cuối: {item.lastRunAt ? new Date(item.lastRunAt).toLocaleString("vi-VN") : "Chưa chạy"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setModalTarget("TIKTOK_SWEEPER");
                          setEditingItem(item);
                          setIsScheduleModalOpen(true);
                        }}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 6: ADMIN BUG REPORTS HUB                             */}
      {/* ========================================================= */}
      {activeTab === "admin_bugs" && isAdmin && (
        <div className="space-y-6 animate-fadeIn">
          <BugReportsAdminSection />
        </div>
      )}

      {/* Shared Schedule Modal for Admin */}
      <ScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => {
          setIsScheduleModalOpen(false);
          setEditingItem(null);
          setModalTarget(null);
        }}
        initialItem={editingItem || undefined}
        title={
          modalTarget === "GPM_FLEET"
            ? "Cấu Hình Lịch Kiểm Kê Profile GPMLogin"
            : "Cấu Hình Lịch Quét Vét TikTok Studio Ngầm"
        }
        onSave={async (savedItem) => {
          if (modalTarget === "GPM_FLEET") {
            const updated = editingItem
              ? gpmSchedule.schedules.map((s) => (s.id === savedItem.id ? savedItem : s))
              : [...gpmSchedule.schedules, savedItem];
            const newConfig = { autoEnabled: true, schedules: updated };
            setGpmSchedule(newConfig);
            await setConfigMutation.mutateAsync({
              key: "gpm_sync_schedule",
              value: newConfig,
              description: "Lịch quét profile GPMLogin tự động",
            });
          } else if (modalTarget === "TIKTOK_SWEEPER") {
            const updated = editingItem
              ? sweeperSchedule.schedules.map((s) => (s.id === savedItem.id ? savedItem : s))
              : [...sweeperSchedule.schedules, savedItem];
            const newConfig = { autoEnabled: true, schedules: updated };
            setSweeperSchedule(newConfig);
            await setConfigMutation.mutateAsync({
              key: "tiktok_sweeper_schedule",
              value: newConfig,
              description: "Lịch quét vét TikTok Studio ngầm tự động",
            });
          }
          utils.settings.getAll.invalidate();
          setIsScheduleModalOpen(false);
          toast.success("Lưu cấu hình lịch trình thành công!");
        }}
      />
    </div>
  );
}
