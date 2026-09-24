"use client";

import { useEffect, useState, useMemo, useRef, Suspense } from "react";
import { useUrlParams } from "@/hooks/useUrlState";
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
  Puzzle,
  ArrowRight,
  ShieldAlert,
  X,
  ZoomIn,
  Monitor,
  Globe,
  Inbox,
  KeyRound,
} from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import ScheduleModal, {
  SyncScheduleConfig,
  SyncScheduleItem,
} from "@/features/schedule/ScheduleModal";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { useColorTheme, COLOR_THEMES } from "@/components/theme/ColorThemeProvider";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { useConfirmDialog } from "@/components/ui/confirm-modal";
import BugReportsAdminSection from "@/features/settings/BugReportsAdminSection";
import { StaffRequestModals } from "@/components/access-requests/StaffRequestModals";

export const ALL_SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es-ES", label: "Español (España)" },
  { code: "es-LA", label: "Español (Latinoamérica)" },
  { code: "pt", label: "Português (Brasil)" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "ja", label: "日本語" },
  { code: "vi", label: "Tiếng Việt" },
];

const renderRequestUserAvatar = (
  u?: {
    name?: string | null;
    username?: string | null;
    email?: string | null;
    avatar?: string | null;
    image?: string | null;
    label?: string | null;
  } | null,
  size = "w-5 h-5 text-[9px]"
) => {
  if (!u) return null;
  const displayName = u.name || u.username || u.email || u.label || "U";
  const src = u.avatar || u.image;
  if (src) {
    return (
      <img
        src={src}
        alt={displayName}
        className={`${size} rounded-full object-cover shrink-0`}
      />
    );
  }
  return (
    <span
      className={`${size} rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 text-white font-bold flex items-center justify-center shrink-0 uppercase select-none`}
    >
      {displayName.slice(0, 2)}
    </span>
  );
};

type ModalTarget = "GPM_FLEET" | "TIKTOK_SWEEPER" | null;
type SettingsTab =
  | "profile"
  | "security"
  | "appearance"
  | "integrations"
  | "requests"
  | "admin_system"
  | "admin_bugs";

// Preset trendy avatars for quick selection
const PRESET_AVATARS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80",
];

function SettingsPageContent() {
  const { data: session } = useSession();
  const rawRole = (session?.user as any)?.role || (session?.user as any)?.userType || "STAFF";
  const isAdmin = String(rawRole).toUpperCase() === "ADMIN";
  const { theme, setTheme } = useTheme();
  const { colorTheme, setColorTheme, activeConfig } = useColorTheme();

  // SaaS URL Query State Synchronization
  const { searchParams, updateUrlParams } = useUrlParams();

  const getInitialTab = (): SettingsTab => {
    const tab = searchParams?.get("tab");
    if (tab === "bugs" || tab === "admin_bugs" || tab === "bug_reports") return "admin_bugs";
    if (tab === "cron" || tab === "schedule" || tab === "admin_system") return "admin_system";
    if (tab === "security") return "security";
    if (tab === "integrations" || tab === "token") return "integrations";
    if (tab === "requests" || tab === "yeu_cau" || tab === "yeucau") return "requests";
    if (tab === "appearance" || tab === "theme" || tab === "tuychon" || tab === "preferences" || tab === "preference" || tab === "currency") return "appearance";
    return "profile";
  };

  const [activeTab, setActiveTab] = useState<SettingsTab>(getInitialTab);
  const { confirm, confirmDialog } = useConfirmDialog();
  const [requestTypeFilter, setRequestTypeFilter] = useState<"ALL" | "MACHINE_CHANGE" | "EXTENSION_ACCESS">("ALL");
  const [requestStatusFilter, setRequestStatusFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");
  const [requestUserFilter, setRequestUserFilter] = useState<string>("ALL");
  const [requestDateFrom, setRequestDateFrom] = useState("");
  const [requestDateTo, setRequestDateTo] = useState("");
  const [isRequestRangeOpen, setIsRequestRangeOpen] = useState(false);
  const [requestRangeSelection, setRequestRangeSelection] = useState<DateRange | undefined>();

  // Query self profile
  const { data: userProfile, refetch: refetchProfile, isLoading: loadingProfile } =
    trpc.user.me.useQuery();

  // Open bug reports count for Admin badge
  const { data: bugStats } = trpc.support.listBugReports.useQuery(
    { status: "OPEN" },
    { enabled: isAdmin }
  );
  const openBugsCount = bugStats?.openCount ?? 0;

  // Auto sync activeTab to URL (always append tab to URL)
  useEffect(() => {
    updateUrlParams(
      { tab: activeTab },
      {}
    );
  }, [activeTab, updateUrlParams]);

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
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const [machineModalOpen, setMachineModalOpen] = useState(false);
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);

  const { data: pendingMachineChange, refetch: refetchMachineChange } =
    trpc.user.myMachineChangeRequest.useQuery(undefined, {
      enabled: activeTab === "integrations" || activeTab === "requests",
    });
  const { data: pendingExtensionAccess, refetch: refetchExtensionAccess } =
    trpc.user.myExtensionAccessRequest.useQuery();

  const utils = trpc.useUtils();
  const { data: myRequests, isLoading: loadingMyRequests } =
    trpc.user.listMyRequests.useQuery(undefined, {
      enabled: !isAdmin,
      staleTime: 30_000,
    });

  const { data: allRequests, isLoading: loadingAllRequests } =
    trpc.admin.listAllAccessRequests.useQuery(undefined, {
      enabled: isAdmin,
      staleTime: 30_000,
    });

  const requestsSource = isAdmin ? allRequests : myRequests;
  const loadingRequests = isAdmin ? loadingAllRequests : loadingMyRequests;

  const deleteMachineRequestMutation = trpc.user.deleteMachineChangeRequest.useMutation({
    onSuccess: () => {
      utils.user.listMyRequests.invalidate();
      utils.user.myMachineChangeRequest.invalidate();
      utils.admin.listAllAccessRequests.invalidate();
      utils.admin.listPendingMachineChangeRequests.invalidate();
      toast.success("Đã xóa yêu cầu đổi máy.");
    },
    onError: (err) => toast.error(err.message || "Lỗi xóa yêu cầu"),
  });

  const deleteExtensionRequestMutation = trpc.user.deleteExtensionAccessRequest.useMutation({
    onSuccess: () => {
      utils.user.listMyRequests.invalidate();
      utils.user.myExtensionAccessRequest.invalidate();
      utils.admin.listAllAccessRequests.invalidate();
      utils.admin.listPendingExtensionAccessRequests.invalidate();
      toast.success("Đã xóa yêu cầu kích hoạt Extension.");
    },
    onError: (err) => toast.error(err.message || "Lỗi xóa yêu cầu"),
  });

  const reviewMachineChangeMutation = trpc.admin.reviewMachineChangeRequest.useMutation({
    onSuccess: () => {
      utils.admin.listAllAccessRequests.invalidate();
      utils.admin.listPendingMachineChangeRequests.invalidate();
      toast.success("Đã cập nhật yêu cầu đổi máy.");
    },
    onError: (err) => toast.error(err.message || "Lỗi duyệt yêu cầu"),
  });

  const reviewExtensionAccessMutation = trpc.admin.reviewExtensionAccessRequest.useMutation({
    onSuccess: () => {
      utils.admin.listAllAccessRequests.invalidate();
      utils.admin.listPendingExtensionAccessRequests.invalidate();
      utils.admin.listUsers.invalidate();
      toast.success("Đã cập nhật yêu cầu kích hoạt Extension.");
    },
    onError: (err) => toast.error(err.message || "Lỗi duyệt yêu cầu"),
  });

  const filteredMyRequests = useMemo(() => {
    const machineItems = (requestsSource?.machineChangeRequests || []).map((req: any) => ({
      kind: "MACHINE_CHANGE" as const,
      id: req.id,
      status: req.status as string,
      reason: req.reason as string,
      createdAt: req.createdAt as string | Date,
      user: req.user as
        | { id?: string; name?: string | null; username?: string | null; email?: string | null }
        | undefined,
      userId: req.userId as string | undefined,
      raw: req,
    }));
    const extensionItems = (requestsSource?.extensionAccessRequests || []).map((req: any) => ({
      kind: "EXTENSION_ACCESS" as const,
      id: req.id,
      status: req.status as string,
      reason: req.reason as string,
      createdAt: req.createdAt as string | Date,
      user: req.user as
        | { id?: string; name?: string | null; username?: string | null; email?: string | null }
        | undefined,
      userId: req.userId as string | undefined,
      raw: req,
    }));
    let all = [...machineItems, ...extensionItems].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
    if (requestTypeFilter !== "ALL") {
      all = all.filter((r) => r.kind === requestTypeFilter);
    }
    if (requestStatusFilter !== "ALL") {
      all = all.filter((r) => r.status === requestStatusFilter);
    }
    if (isAdmin && requestUserFilter !== "ALL") {
      all = all.filter((r) => (r.userId || r.user?.id) === requestUserFilter);
    }
    if (requestDateFrom) {
      const fromTs = new Date(requestDateFrom + "T00:00:00").getTime();
      all = all.filter((r) => new Date(r.createdAt).getTime() >= fromTs);
    }
    if (requestDateTo) {
      const toTs = new Date(requestDateTo + "T23:59:59").getTime();
      all = all.filter((r) => new Date(r.createdAt).getTime() <= toTs);
    }
    return all;
  }, [
    requestsSource,
    requestTypeFilter,
    requestStatusFilter,
    requestUserFilter,
    requestDateFrom,
    requestDateTo,
    isAdmin,
  ]);

  const requestPersonnelOptions = useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map<
      string,
      {
        id: string;
        label: string;
        name?: string | null;
        username?: string | null;
        email?: string | null;
        avatar?: string | null;
        image?: string | null;
      }
    >();
    const add = (req: any) => {
      const id = req.userId || req.user?.id;
      if (!id) return;
      const label = req.user?.name || req.user?.username || req.user?.email || id;
      map.set(id, {
        id,
        label,
        name: req.user?.name,
        username: req.user?.username,
        email: req.user?.email,
        avatar: req.user?.avatar,
        image: req.user?.image,
      });
    };
    (requestsSource?.machineChangeRequests || []).forEach(add);
    (requestsSource?.extensionAccessRequests || []).forEach(add);
    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, "vi")
    );
  }, [requestsSource, isAdmin]);

  const myPendingCount =
    (requestsSource?.machineChangeRequests || []).filter((r: any) => r.status === "PENDING").length +
    (requestsSource?.extensionAccessRequests || []).filter((r: any) => r.status === "PENDING").length;

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

  // Handle Password Update / Set up
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
      await refetchProfile();
      toast.success(
        userProfile?.hasPassword
          ? "Thay đổi mật khẩu thành công! Hãy lưu lại mật khẩu mới."
          : "Thiết lập mật khẩu thành công! Bạn có thể đăng nhập bằng email và mật khẩu này."
      );
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

  const formatScheduleItemLabel = (s: SyncScheduleItem) => {
    if (s.repeat === "HOURLY") {
      const h = s.everyCount || (s.intervalMinutes ? Math.round(s.intervalMinutes / 60) : 1);
      return h > 1 ? `Mỗi ${h} giờ` : "Mỗi 1 giờ";
    }
    if (s.repeat === "DAILY") {
      const d = s.everyCount || 1;
      return d > 1 ? `Mỗi ${d} ngày lúc ${s.timeOfDay || "18:00"}` : `Hàng ngày lúc ${s.timeOfDay || "18:00"}`;
    }
    if (s.repeat === "WEEKLY") return `Hàng tuần lúc ${s.timeOfDay || "18:00"}`;
    if (s.repeat === "EVERY_15_MIN") return "Mỗi 15 phút";
    if (s.repeat === "EVERY_30_MIN") return "Mỗi 30 phút";
    if (s.repeat === "CUSTOM") return `Mỗi ${s.intervalMinutes || 60} phút`;
    if (s.repeat === "ONCE") return `1 lần duy nhất lúc ${s.timeOfDay || "18:00"}`;
    return s.timeOfDay ? `Lúc ${s.timeOfDay}` : `Mỗi ${s.intervalMinutes || 60} phút`;
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
    if (manualGpmSyncing) return;
    try {
      setManualGpmSyncing(true);
      const res = await fetch("/api/gpm/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(`Đồng bộ: ${data.message || "Đã xong"}`);
      } else {
        if (data.inProgress) {
          toast.info(data.message);
        } else {
          toast.error(`Lỗi: ${data.error || data.message || "Không thể đồng bộ"}`);
        }
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
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5 min-w-0">
            <Settings className="w-6 h-6 text-pink-500 shrink-0 animate-spin-slow" />
            <span className="truncate">Cài Đặt & Cá Nhân Hóa</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
            Quản lý thông tin hồ sơ, mật khẩu bảo mật, giao diện hiển thị và cấu hình tích hợp tự động hóa.
          </p>
        </div>

        {/* Quick User Identity Pill */}
        {loadingProfile ? (
          <div className="flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs animate-pulse">
            <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-800 shrink-0" />
            <div className="space-y-1.5">
              <div className="w-28 h-3.5 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="w-16 h-3 rounded bg-slate-200 dark:bg-slate-800" />
            </div>
          </div>
        ) : userProfile ? (
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
                  className={`px-1.5 py-0.2 rounded-md text-xs font-black uppercase ${userProfile.role === "ADMIN"
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
        ) : null}
      </div>

      {/* Modern Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto scrollbar-none w-full">
        <button
          onClick={() => setActiveTab("profile")}
          className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${activeTab === "profile"
            ? "bg-white dark:bg-slate-800 text-pink-600 dark:text-pink-400 shadow-xs border border-slate-200/80 dark:border-slate-700/80"
            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
        >
          <User className="w-4 h-4" />
          <span>Hồ Sơ Cá Nhân</span>
        </button>

        <button
          onClick={() => setActiveTab("security")}
          className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${activeTab === "security"
            ? "bg-white dark:bg-slate-800 text-pink-600 dark:text-pink-400 shadow-xs border border-slate-200/80 dark:border-slate-700/80"
            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
        >
          <Lock className="w-4 h-4" />
          <span>Bảo Mật & Mật Khẩu</span>
        </button>

        <button
          onClick={() => setActiveTab("appearance")}
          className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${activeTab === "appearance"
            ? "bg-white dark:bg-slate-800 text-pink-600 dark:text-pink-400 shadow-xs border border-slate-200/80 dark:border-slate-700/80"
            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
        >
          <Palette className="w-4 h-4" />
          <span>Tùy Chọn</span>
        </button>

        <button
          onClick={() => setActiveTab("integrations")}
          className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${activeTab === "integrations"
            ? "bg-white dark:bg-slate-800 text-pink-600 dark:text-pink-400 shadow-xs border border-slate-200/80 dark:border-slate-700/80"
            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
        >
          <Key className="w-4 h-4" />
          <span>Personal Token</span>
        </button>

        <button
          onClick={() => setActiveTab("requests")}
          className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${activeTab === "requests"
            ? "bg-white dark:bg-slate-800 text-pink-600 dark:text-pink-400 shadow-xs border border-slate-200/80 dark:border-slate-700/80"
            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
        >
          <Inbox className="w-4 h-4" />
          <span>Yêu cầu</span>
          {myPendingCount > 0 && (
            <span
              className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${activeTab === "requests"
                  ? "bg-amber-500 text-white"
                  : "bg-amber-500 text-white animate-pulse"
                }`}
            >
              {myPendingCount}
            </span>
          )}
        </button>

        {isAdmin && (
          <button
            onClick={() => setActiveTab("admin_system")}
            className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${activeTab === "admin_system"
              ? "bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-md shadow-pink-500/20"
              : "text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
              }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Thiết Lập Đồng Bộ</span>
          </button>
        )}

        {isAdmin && (
          <button
            onClick={() => setActiveTab("admin_bugs")}
            className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${activeTab === "admin_bugs"
              ? "bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-md shadow-pink-500/20"
              : "text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
              }`}
          >
            <Bug className="w-4 h-4" />
            <span>Quản Lý Sự Cố</span>
            {openBugsCount > 0 && (
              <span
                className={`text-[10px] font-black px-1.5 py-0.5 rounded-full transition-colors ${activeTab === "admin_bugs"
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
                    className={`rounded-xl overflow-hidden aspect-square border-2 transition-all cursor-pointer ${avatarUrl === p ? "border-indigo-500 scale-105 shadow-md" : "border-transparent opacity-70 hover:opacity-100"
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
              Cập nhật tên hiển thị, username và ảnh đại diện trên toàn hệ thống TikTokFlow.
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
                    Username (@)
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="absolute right-3 top-2.5 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold cursor-help">
                          Verified
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs font-medium">
                        Email đã được xác minh — không thể thay đổi
                      </TooltipContent>
                    </Tooltip>
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
                    <div className="mt-0.5 text-xs font-black text-slate-800 dark:text-slate-200">
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
                    <div className="mt-0.5 text-xs font-black text-slate-800 dark:text-slate-200">
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
                  {userProfile?.hasPassword ? "Đã thiết lập" : "Chưa thiết lập (OAuth)"}
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

          {/* Password Set up / Change Form */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs">
            {userProfile?.hasPassword ? (
              <>
                <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                  <Lock className="w-5 h-5 text-indigo-500" />
                  Thay Đổi Mật Khẩu Đăng Nhập
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                  Mật khẩu mới yêu cầu tối thiểu 8 ký tự, bao gồm chữ hoa, chữ số hoặc ký tự đặc biệt để đạt độ an toàn cao nhất.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-emerald-500" />
                  Thiết Lập Mật Khẩu Đăng Nhập
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                  Tài khoản của bạn hiện đăng nhập bằng OAuth (Google). Hãy thiết lập mật khẩu riêng để có thể đăng nhập bằng email
                  và tăng cường bảo mật cho tài khoản.
                </p>
              </>
            )}

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
                  {userProfile?.hasPassword ? "Mật Khẩu Mới" : "Mật Khẩu Mới"}
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
                  ) : userProfile?.hasPassword ? (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Cập Nhật Mật Khẩu Mới</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      <span>Thiết Lập Mật Khẩu</span>
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                <Palette className="w-5 h-5 text-pink-500" />
                Tùy Chọn Giao Diện & Ngôn Ngữ
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-3xl leading-relaxed">
                Cá nhân hóa giao diện làm việc, chủ đề màu sắc và tùy chọn ngôn ngữ hệ thống.
              </p>
            </div>

            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 self-start sm:self-auto shrink-0">
              <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
              <span>
                Đang chọn:{" "}
                {theme === "light"
                  ? "Giao Diện Sáng"
                  : theme === "dark"
                    ? "Giao Diện Tối"
                    : "Theo Hệ Thống"}
              </span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {/* Light Card */}
            <div
              onClick={() => setTheme("light")}
              className={`p-5 rounded-3xl border-2 transition-all cursor-pointer relative overflow-hidden group ${theme === "light"
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
              className={`p-5 rounded-3xl border-2 transition-all cursor-pointer relative overflow-hidden group ${theme === "dark"
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
              className={`p-5 rounded-3xl border-2 transition-all cursor-pointer relative overflow-hidden group ${theme === "system"
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

          {/* ========================================================= */}
          {/* BRAND COLOR THEME SELECTION                               */}
          {/* ========================================================= */}
          <div className="border-t border-slate-100 dark:border-slate-800/80 pt-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-pink-500" />
                  <span>Màu Sắc Nhận Diện Chủ Đạo</span>
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl leading-relaxed">
                  Tùy chỉnh màu chủ đạo của hệ thống. Màu đã chọn sẽ được áp dụng tự động cho nút bấm, thanh điều hướng, huy hiệu và các điểm nhấn giao diện.
                </p>
              </div>

              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 self-start sm:self-auto shrink-0">
                <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
                <span>Đang chọn: {activeConfig.name}</span>
              </span>
            </div>

            {/* Color Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {COLOR_THEMES.map((themeOpt) => {
                const isSelected = colorTheme === themeOpt.id;
                return (
                  <div
                    key={themeOpt.id}
                    onClick={() => {
                      setColorTheme(themeOpt.id);
                      toast.success(`Đã áp dụng màu chủ đạo: ${themeOpt.name}`, {
                        description: "Giao diện và phong cách nút bấm đã được cập nhật đồng bộ.",
                      });
                    }}
                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between group active:scale-[0.98] ${isSelected
                      ? "border-pink-600 bg-pink-50/25 dark:bg-pink-950/25 shadow-lg shadow-pink-500/10 scale-[1.01]"
                      : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm"
                      }`}
                  >
                    <div className="space-y-3">
                      {/* Swatch & Indicator */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-7 h-7 rounded-xl shadow-md border border-white/20 flex items-center justify-center shrink-0"
                            style={{
                              background: `linear-gradient(135deg, ${themeOpt.primaryColor}, ${themeOpt.secondaryColor})`,
                            }}
                          >
                            <div className="w-2 h-2 rounded-full bg-white/90 shadow-xs" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-900 dark:text-white block">
                              {themeOpt.name}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                              {themeOpt.subName}
                            </span>
                          </div>
                        </div>

                        {isSelected ? (
                          <div className="w-6 h-6 rounded-full bg-pink-600 text-white flex items-center justify-center shadow-xs shrink-0">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-700 group-hover:border-slate-400 shrink-0" />
                        )}
                      </div>

                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {themeOpt.description}
                      </p>
                    </div>

                    {/* Mini Button Preview inside Card */}
                    <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80">
                      <div
                        className="w-full py-2 px-3 rounded-xl text-xs font-bold text-white shadow-xs flex items-center justify-center gap-1.5 transition-transform group-hover:scale-[1.02]"
                        style={{
                          background: `linear-gradient(135deg, ${themeOpt.primaryColor}, ${themeOpt.secondaryColor})`,
                        }}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Xem mẫu nút</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Live Interactive UI Components Preview */}
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-pink-500" />
                  Trực Quan Phong Cách Sau Khi Đổi Màu (Live Preview)
                </span>
                <span className="text-[11px] text-slate-500">
                  Tự động đồng bộ toàn bộ trang
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                {/* Primary Button */}
                <button
                  type="button"
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-md shadow-pink-600/25 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Zap className="w-4 h-4" />
                  <span>Nút Bấm Chính (Primary Button)</span>
                </button>

                {/* Secondary Button */}
                <button
                  type="button"
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                >
                  <span>Nút Phụ (Outline)</span>
                </button>

                {/* Badge */}
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Huy Hiệu Trạng Thái (Badge)</span>
                </span>

                {/* Ring / Input demo */}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-pink-500/40 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-pink-500" />
                  <span>Đường viền viền sáng (Focus Ring)</span>
                </div>
              </div>
            </div>
          </div>


          {/* ========================================================= */}
          {/* SYSTEM LANGUAGE SELECTION SECTION                         */}
          {/* ========================================================= */}
          <div className="border-t border-slate-100 dark:border-slate-800/80 pt-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Globe className="w-5 h-5 text-cyan-500" />
                  <span>Ngôn Ngữ Hệ Thống (System Language)</span>
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl leading-relaxed">
                  Hệ thống chuẩn hóa hỗ trợ đa ngôn ngữ quốc tế. Hiện tại phiên bản vận hành được tối ưu hóa đầy đủ bằng Tiếng Việt.
                </p>
              </div>

              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 self-start sm:self-auto shrink-0">
                <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                <span>Tiếng Việt (vi)</span>
              </span>
            </div>

            {/* Languages Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {ALL_SUPPORTED_LANGUAGES.map((lang) => {
                const isCurrent = lang.code === "vi";

                if (isCurrent) {
                  return (
                    <div
                      key={lang.code}
                      className="p-4 rounded-2xl border-2 border-pink-600 bg-pink-50/20 dark:bg-pink-950/20 shadow-md shadow-pink-500/10 flex items-center justify-between transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-pink-100 dark:bg-pink-950/60 text-pink-600 dark:text-pink-400 flex items-center justify-center font-bold text-xs border border-pink-200 dark:border-pink-800">
                          {lang.code.toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-slate-900 dark:text-white">
                            {lang.label}
                          </div>
                          <div className="text-[11px] text-pink-600 dark:text-pink-400 font-semibold">
                            Ngôn ngữ mặc định
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-xs font-bold text-pink-600 dark:text-pink-400">
                        <Check className="w-4 h-4" />
                        <span>Kích hoạt</span>
                      </div>
                    </div>
                  );
                }

                return (
                  <Tooltip key={lang.code}>
                    <TooltipTrigger asChild>
                      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/30 opacity-60 hover:opacity-75 transition-all cursor-not-allowed select-none flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center font-bold text-xs">
                            {lang.code.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-sm text-slate-700 dark:text-slate-300">
                              {lang.label}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {lang.code}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-400 font-medium">
                          <Lock className="w-3.5 h-3.5" />
                          <span>Khóa</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs max-w-xs font-medium bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xl">
                      Hiện tại hệ thống chỉ hỗ trợ Tiếng Việt (Only Vietnamese is supported right now)
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: INTEGRATIONS & PERSONAL TOKEN TAB                  */}
      {/* ========================================================= */}
      {activeTab === "integrations" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Bound machine + change request */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-cyan-500" />
                  Máy tính đã liên kết
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  Extension và Client Agent chỉ hoạt động trên thiết bị đã được liên kết. Khi đổi thiết bị, cần được Admin phê duyệt.
                </p>
              </div>
              {userProfile?.boundMachineId && (
                pendingMachineChange ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 whitespace-nowrap shrink-0">
                    Đang chờ duyệt đổi máy
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMachineModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm cursor-pointer shrink-0"
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    Yêu cầu đổi máy
                  </button>
                )
              )}
            </div>

            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 px-4 py-3 text-sm">
              {userProfile?.boundMachineId ? (
                <div className="space-y-1">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {userProfile.boundMachineName || "Máy đã gắn"}
                  </div>
                  <div className="font-mono text-xs text-slate-500 dark:text-slate-400 break-all">
                    {userProfile.boundMachineId}
                    {userProfile.boundOsUser ? ` · ${userProfile.boundOsUser}` : ""}
                  </div>
                  {userProfile.boundMachineAt && (
                    <div className="text-xs text-slate-400">
                      Gắn lúc {new Date(userProfile.boundMachineAt).toLocaleString("vi-VN")}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-slate-600 dark:text-slate-400">
                  **Chưa liên kết thiết bị** — Mở Extension hoặc chạy Client Agent trên thiết bị làm việc để tự động liên kết lần đầu.
                </p>
              )}
            </div>

            {pendingMachineChange && (
              <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                Đang chờ duyệt đổi máy
                {pendingMachineChange.reason
                  ? `: “${pendingMachineChange.reason}”`
                  : "."}{" "}
                Admin sẽ hủy liên kết cũ sau khi duyệt.
              </div>
            )}
          </div>

          {/* Main Personal Token Card */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-pink-500" />
                  Mã Khóa Định Danh Cá Nhân (Personal Token)
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed max-w-3xl">
                  Mã liên kết riêng của bạn trên máy tính, được Extension và Client Agent sử dụng để xác định và đồng bộ dữ liệu đúng với tài khoản. Không chia sẻ mã này với người khác.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                {userProfile?.extensionAccessEnabled === false ? (
                  <span className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 whitespace-nowrap shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Đã thu hồi — cần xác thực lại</span>
                  </span>
                ) : userProfile?.extensionToken ? (
                  <span className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Đang hoạt động</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 whitespace-nowrap shrink-0">
                    <span>Chưa có token</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (userProfile?.extensionAccessEnabled === false) {
                      if (pendingExtensionAccess) {
                        toast.info("Đã có yêu cầu kích hoạt đang chờ Admin duyệt.");
                        return;
                      }
                      setExtensionModalOpen(true);
                      return;
                    }
                    setShowRegenConfirm(true);
                  }}
                  className="px-3.5 py-2 rounded-xl text-sm font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {userProfile?.extensionAccessEnabled === false
                      ? pendingExtensionAccess
                        ? "Đã gửi yêu cầu"
                        : "Yêu cầu kích hoạt Extension"
                      : "Cấp Lại Token Mới"}
                  </span>
                </button>
              </div>
            </div>

            {userProfile?.extensionAccessEnabled === false && (
              <div className="mb-4 p-4 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-sm text-rose-700 dark:text-rose-300 leading-relaxed space-y-2">
                <p>
                  <strong className="font-bold">Yêu cầu xác thực lại:</strong> Token Extension/Client Agent của bạn đã bị vô hiệu hóa
                  {userProfile?.extensionRevokedAt
                    ? ` (lúc ${new Date(userProfile.extensionRevokedAt).toLocaleString("vi-VN")})`
                    : ""}
                  . Extension sẽ hiện banner đỏ và Client Agent sẽ dừng đồng bộ cho đến khi Admin mở khóa &amp; cấp token mới.
                </p>
                {pendingExtensionAccess ? (
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                    Đã gửi yêu cầu kích hoạt — đang chờ Admin duyệt
                    {pendingExtensionAccess.reason ? `: “${pendingExtensionAccess.reason}”` : "."}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => setExtensionModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                  >
                    <Key className="w-3.5 h-3.5" />
                    Gửi yêu cầu kích hoạt Extension
                  </button>
                )}
              </div>
            )}

            {/* Token Display Box */}
            <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${userProfile?.extensionAccessEnabled === false
              ? "bg-rose-50/80 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50"
              : "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700"
              }`}>
              <div className="font-mono text-sm text-slate-800 dark:text-slate-200 tracking-wider truncate select-all">
                {userProfile?.extensionAccessEnabled === false
                  ? "Token đã bị thu hồi — cấp lại để tiếp tục dùng Extension / Client Agent"
                  : showToken
                    ? userProfile?.extensionToken || "Chưa có token"
                    : userProfile?.extensionToken
                      ? `${userProfile.extensionToken.slice(0, 10)}••••••••••••••••••••••••${userProfile.extensionToken.slice(-6)}`
                      : "Chưa có token"}
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  disabled={userProfile?.extensionAccessEnabled === false || !userProfile?.extensionToken}
                  className="px-3 py-1.5 rounded-lg text-sm font-bold bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showToken ? "Ẩn" : "Hiện"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyToken}
                  disabled={userProfile?.extensionAccessEnabled === false || !userProfile?.extensionToken}
                  className="px-3 py-1.5 rounded-lg text-sm font-bold bg-pink-600 hover:bg-pink-500 text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-40"
                >
                  {copiedToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedToken ? "Đã chép!" : "Sao chép"}</span>
                </button>
              </div>
            </div>

            {/* Prominent Security Alert Banner */}
            <div className="mt-4 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-rose-500/15 via-rose-500/10 to-amber-500/10 border-2 border-rose-500/50 dark:border-rose-500/40 shadow-sm flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div className="space-y-1.5 text-sm leading-relaxed flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-rose-700 dark:text-rose-300 uppercase text-[11px] tracking-wider px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800">
                    Bảo Mật Nghiêm Ngặt
                  </span>
                  <strong className="text-slate-900 dark:text-white font-bold text-sm sm:text-base">
                    Tuyệt đối không chia sẻ công khai file ZIP hoặc Personal Token
                  </strong>
                </div>
                <p className="text-slate-700 dark:text-slate-300 text-xs sm:text-sm">
                  Không gửi mã qua chat, email hoặc nhóm làm việc chung. Mỗi người chỉ dùng gói tải về của chính mình để tránh xung đột dữ liệu tài khoản.{" "}
                  <strong className="text-rose-600 dark:text-rose-400 font-bold">Nếu nghi bị lộ, hãy bấm &quot;Cấp Lại Token Mới&quot; ngay lập tức.</strong>
                </p>
              </div>
            </div>

            {/* Hướng Dẫn Vận Hành & Quy Trình Đổi Token */}
            <div className="mt-5 p-5 sm:p-6 rounded-3xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/60 dark:border-slate-800 pb-3.5">
                <div className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-pink-500 shrink-0" />
                  <span>Hướng dẫn sử dụng & Quy trình cập nhật Token</span>
                </div>
                <Link
                  href="/docs"
                  className="text-xs font-bold text-pink-600 dark:text-pink-400 hover:underline flex items-center gap-1 self-start sm:self-auto"
                >
                  <span>Xem tài liệu chi tiết</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* Vai trò của 2 công cụ */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs sm:text-sm">
                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-1 shadow-2xs">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Bot className="w-4 h-4 text-cyan-500 shrink-0" />
                    <span>1. Client Agent (máy Windows — làm trước)</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-xs">
                    Giải nén ZIP ➔ <code className="font-mono text-xs font-bold bg-slate-100 dark:bg-slate-800 px-1 rounded">setup-agent.bat</code> phím <strong>1</strong> (Cho phép UAC nếu hỏi). Agent chạy ngầm, cập nhật số liệu. Mỗi máy chỉ một Agent.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-1 shadow-2xs">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Puzzle className="w-4 h-4 text-pink-500 shrink-0" />
                    <span>2. Extension (cài trên GPMLogin — sau Agent)</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-xs">
                    Nạp <code className="font-mono text-xs font-bold bg-slate-100 dark:bg-slate-800 px-1 rounded">extension.zip</code> vào GPMLogin khi Agent đã chạy. Extension nhận diện tài khoản TikTok trên từng profile.
                  </p>
                </div>
              </div>

              {/* Hướng dẫn khi cấp lại Token mới */}
              <div className="space-y-3 pt-1">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Khi bạn bấm &quot;Cấp Lại Token Mới&quot;, chọn 1 trong 2 cách cập nhật:
                </div>

                {/* Cách 1: Tải file ZIP mới */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/50 space-y-1.5 shadow-2xs">
                  <div className="font-bold text-emerald-700 dark:text-emerald-400 text-sm flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-300 flex items-center justify-center text-xs font-black">1</span>
                    <span>Cách 1 (Khuyên dùng): Tải lại file ZIP mới</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed pl-7">
                    Vào <Link href="/extensions" className="font-bold text-pink-600 dark:text-pink-400 hover:underline">Kho Tiện Ích (/extensions)</Link> tải gói mới: cài lại Agent (<code className="font-mono text-xs font-bold text-pink-600 dark:text-pink-400 bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">setup-agent.bat</code> phím 1) rồi nạp lại Extension vào GPMLogin. Hệ thống đã tích hợp sẵn cơ chế xác thực tự động với tài khoản của bạn.
                  </p>
                </div>

                {/* Cách 2: Nhập Token thủ công kèm 2 ảnh */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/50 space-y-4 shadow-2xs">
                  <div className="font-bold text-amber-700 dark:text-amber-400 text-sm flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-300 flex items-center justify-center text-xs font-black">2</span>
                    <span>Cách 2: Nhập Token thủ công (Sao chép mã ở trên)</span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Cửa sổ Extension */}
                    <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2.5 flex flex-col justify-between">
                      <div className="space-y-1">
                        <div className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm flex items-center gap-1.5">
                          <Puzzle className="w-3.5 h-3.5 text-pink-500" />
                          <span>Dán vào Extension trên trình duyệt</span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          Mở popup Extension trên trình duyệt ➔ Dán mã Personal Token mới vào ô <strong>Personal Token</strong> ➔ Bấm <strong>Lưu</strong> (hoặc Kiểm tra).
                        </p>
                      </div>

                      <div
                        onClick={() => setPreviewImage({ src: "/images/docs/extensions/anh-3.png", alt: "Giao diện popup Extension dán mã Personal Token mới" })}
                        className="group relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black max-w-sm mx-auto shadow-xs cursor-pointer"
                        title="Nhấp để phóng to ảnh"
                      >
                        <img
                          src="/images/docs/extensions/anh-3.png"
                          alt="Giao diện popup Extension dán mã Personal Token mới"
                          className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-bold">
                          <ZoomIn className="w-4 h-4" />
                          <span>Phóng to ảnh</span>
                        </div>
                      </div>
                    </div>

                    {/* Cửa sổ Client Agent (Phím 3) */}
                    <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2.5 flex flex-col justify-between">
                      <div className="space-y-1">
                        <div className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm flex items-center gap-1.5">
                          <Bot className="w-3.5 h-3.5 text-cyan-500" />
                          <span>Dán vào Client Agent (Phím 3)</span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          Nhấp đúp file <code className="font-mono text-cyan-600 dark:text-cyan-400 font-bold bg-cyan-50 dark:bg-cyan-950/60 px-1 py-0.5 rounded">setup-agent.bat</code> ➔ Nhấn phím <strong className="text-amber-600 dark:text-amber-400 font-bold">3</strong> ➔ Dán mã Token mới và nhấn Enter.
                        </p>
                      </div>

                      <div
                        onClick={() => setPreviewImage({ src: "/images/docs/clientagent/anh-3.png", alt: "Màn hình CMD setup-agent.bat phím 3 để cập nhật Token" })}
                        className="group relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black max-w-sm mx-auto shadow-xs cursor-pointer"
                        title="Nhấp để phóng to ảnh"
                      >
                        <img
                          src="/images/docs/clientagent/anh-3.png"
                          alt="Màn hình CMD setup-agent.bat phím 3 để cập nhật Token"
                          className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-bold">
                          <ZoomIn className="w-4 h-4" />
                          <span>Phóng to ảnh</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Extension & Client Agent Download Redirect Banner */}
          <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-indigo-500/10 border border-pink-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
            <div className="space-y-1">
              <div className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Puzzle className="w-5 h-5 text-pink-500 shrink-0" />
                <span>Cần tải gói Extension hoặc Client Agent?</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
                Tất cả gói cài đặt được đóng gói sẵn và quản lý tập trung tại <strong>Kho Thiết Bị Mở Rộng</strong>.
                File tải về đã được tích hợp sẵn cơ chế xác thực tự động với tài khoản của bạn.
              </p>
            </div>
            <Link
              href="/extensions"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-md shadow-pink-600/20 transition-all shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Đến Kho Thiết Bị Mở Rộng</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
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
      {/* TAB: YÊU CẦU (own machine + extension requests)           */}
      {/* ========================================================= */}
      {activeTab === "requests" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Inbox className="w-5 h-5 text-amber-500" />
                {isAdmin ? "Yêu cầu nhân sự" : "Yêu cầu của bạn"}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {isAdmin
                  ? "Xem và xử lý toàn bộ yêu cầu đổi máy / kích hoạt Extension từ nhân sự."
                  : "Theo dõi trạng thái yêu cầu đổi máy và kích hoạt Extension."}
              </p>
            </div>

            <div className={`grid grid-cols-1 sm:grid-cols-2 ${isAdmin ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-2.5`}>
              <Select
                value={requestTypeFilter}
                onValueChange={(v) => setRequestTypeFilter(v as typeof requestTypeFilter)}
              >
                <SelectTrigger className="h-9 rounded-xl text-xs cursor-pointer bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                  <SelectValue placeholder="Loại yêu cầu" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="ALL" className="text-xs cursor-pointer">Tất cả loại</SelectItem>
                  <SelectItem value="MACHINE_CHANGE" className="text-xs cursor-pointer">Đổi máy</SelectItem>
                  <SelectItem value="EXTENSION_ACCESS" className="text-xs cursor-pointer">Kích hoạt Extension</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={requestStatusFilter}
                onValueChange={(v) => setRequestStatusFilter(v as typeof requestStatusFilter)}
              >
                <SelectTrigger className="h-9 rounded-xl text-xs cursor-pointer bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="ALL" className="text-xs cursor-pointer">Tất cả trạng thái</SelectItem>
                  <SelectItem value="PENDING" className="text-xs cursor-pointer">Đang chờ</SelectItem>
                  <SelectItem value="APPROVED" className="text-xs cursor-pointer">Đã duyệt</SelectItem>
                  <SelectItem value="REJECTED" className="text-xs cursor-pointer">Từ chối</SelectItem>
                </SelectContent>
              </Select>

              {isAdmin && (
                <Select
                  value={requestUserFilter}
                  onValueChange={setRequestUserFilter}
                >
                  <SelectTrigger className="h-9 rounded-xl text-xs cursor-pointer bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                    <SelectValue placeholder="Nhân sự">
                      {requestUserFilter === "ALL" ? (
                        <span>Tất cả nhân sự</span>
                      ) : (
                        (() => {
                          const selected = requestPersonnelOptions.find(
                            (u) => u.id === requestUserFilter
                          );
                          if (!selected) return <span>Nhân sự</span>;
                          return (
                            <span className="flex items-center gap-2 min-w-0">
                              {renderRequestUserAvatar(selected, "w-4 h-4 text-[8px]")}
                              <span className="truncate">{selected.label}</span>
                            </span>
                          );
                        })()
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="rounded-xl max-h-64">
                    <SelectItem value="ALL" className="text-xs cursor-pointer">
                      Tất cả nhân sự
                    </SelectItem>
                    {requestPersonnelOptions.map((u) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs cursor-pointer">
                        <div className="flex items-center gap-2">
                          {renderRequestUserAvatar(u, "w-4 h-4 text-[8px]")}
                          <span>{u.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Popover open={isRequestRangeOpen} onOpenChange={setIsRequestRangeOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="h-9 w-full inline-flex items-center justify-between gap-2 rounded-xl text-xs px-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900"
                  >
                    <span className="inline-flex items-center gap-1.5 truncate">
                      <Calendar className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                      {requestDateFrom && requestDateTo
                        ? `${format(new Date(requestDateFrom + "T00:00:00"), "dd/MM/yy")} – ${format(new Date(requestDateTo + "T00:00:00"), "dd/MM/yy")}`
                        : "Thời gian"}
                    </span>
                    {(requestDateFrom || requestDateTo) && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRequestRangeSelection(undefined);
                          setRequestDateFrom("");
                          setRequestDateTo("");
                        }}
                        className="text-slate-400 hover:text-rose-500"
                      >
                        <X className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="end"
                  sideOffset={6}
                  className="w-[325px] p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50"
                >
                  <div className="flex items-center justify-between gap-2 pb-2 mb-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Chọn thời gian
                    </span>
                    {requestRangeSelection?.from && (
                      <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 whitespace-nowrap">
                        {format(requestRangeSelection.from, "dd/MM/yy")} –{" "}
                        {requestRangeSelection.to
                          ? format(requestRangeSelection.to, "dd/MM/yy")
                          : "..."}
                      </span>
                    )}
                  </div>
                  <CalendarPicker
                    mode="range"
                    selected={requestRangeSelection}
                    onSelect={setRequestRangeSelection}
                    numberOfMonths={1}
                    className="w-full p-0"
                  />
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setRequestRangeSelection(undefined);
                        setRequestDateFrom("");
                        setRequestDateTo("");
                        setIsRequestRangeOpen(false);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Xóa
                    </button>
                    <button
                      type="button"
                      disabled={!requestRangeSelection?.from}
                      onClick={() => {
                        if (!requestRangeSelection?.from) return;
                        let from = requestRangeSelection.from;
                        let to = requestRangeSelection.to || from;
                        if (to.getTime() < from.getTime()) {
                          const tmp = from;
                          from = to;
                          to = tmp;
                        }
                        setRequestDateFrom(format(from, "yyyy-MM-dd"));
                        setRequestDateTo(format(to, "yyyy-MM-dd"));
                        setRequestRangeSelection({ from, to });
                        setIsRequestRangeOpen(false);
                      }}
                      className="px-4 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      Áp dụng
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {loadingRequests ? (
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center text-xs text-slate-400">
              Đang tải yêu cầu...
            </div>
          ) : filteredMyRequests.length === 0 ? (
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center space-y-3">
              <Inbox className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Không có yêu cầu nào
              </h3>
              <p className="text-xs text-slate-400">
                {isAdmin
                  ? "Chưa có yêu cầu nào từ nhân sự, hoặc không khớp bộ lọc hiện tại."
                  : "Bạn chưa gửi yêu cầu nào, hoặc không khớp bộ lọc hiện tại."}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredMyRequests.map((item) => {
                const isMachine = item.kind === "MACHINE_CHANGE";
                const status = item.status;
                const displayUser =
                  item.user ||
                  (userProfile
                    ? {
                      name: userProfile.name,
                      username: userProfile.username,
                      email: userProfile.email,
                      avatar: userProfile.avatar,
                      image: userProfile.image,
                    }
                    : null);
                const requesterName =
                  displayUser?.name ||
                  displayUser?.username ||
                  displayUser?.email ||
                  null;
                const statusBadge =
                  status === "APPROVED" ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                      Đã duyệt
                    </span>
                  ) : status === "REJECTED" ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      Từ chối
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
                      Đang chờ
                    </span>
                  );

                return (
                  <div
                    key={`${item.kind}-${item.id}`}
                    className={`rounded-2xl border px-4 py-3.5 shadow-sm bg-white dark:bg-slate-900/80 space-y-2.5 ${isMachine
                        ? "border-amber-200/80 dark:border-amber-900/40"
                        : "border-rose-200/80 dark:border-rose-900/40"
                      }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isMachine
                              ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                              : "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                            }`}
                        >
                          {isMachine ? (
                            <Monitor className="w-4.5 h-4.5" />
                          ) : (
                            <KeyRound className="w-4.5 h-4.5" />
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${isMachine
                                ? "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/50"
                                : "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/50"
                              }`}
                          >
                            {isMachine ? "Đổi máy" : "Kích hoạt Extension"}
                          </span>
                          {statusBadge}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isAdmin && status === "PENDING" && (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  disabled={
                                    reviewMachineChangeMutation.isPending ||
                                    reviewExtensionAccessMutation.isPending
                                  }
                                  onClick={() => {
                                    if (isMachine) {
                                      reviewMachineChangeMutation.mutate({
                                        requestId: item.id,
                                        decision: "APPROVED",
                                      });
                                    } else {
                                      reviewExtensionAccessMutation.mutate({
                                        requestId: item.id,
                                        decision: "APPROVED",
                                      });
                                    }
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                                >
                                  {isMachine ? "Duyệt" : "Duyệt & Cấp Token"}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                {isMachine
                                  ? "Duyệt yêu cầu đổi máy"
                                  : "Duyệt & cấp Personal Token"}
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  disabled={
                                    reviewMachineChangeMutation.isPending ||
                                    reviewExtensionAccessMutation.isPending
                                  }
                                  onClick={() => {
                                    if (isMachine) {
                                      reviewMachineChangeMutation.mutate({
                                        requestId: item.id,
                                        decision: "REJECTED",
                                      });
                                    } else {
                                      reviewExtensionAccessMutation.mutate({
                                        requestId: item.id,
                                        decision: "REJECTED",
                                      });
                                    }
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-300 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
                                >
                                  Từ chối
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                {isMachine
                                  ? "Từ chối yêu cầu đổi máy"
                                  : "Từ chối yêu cầu kích hoạt"}
                              </TooltipContent>
                            </Tooltip>
                          </>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              disabled={
                                deleteMachineRequestMutation.isPending ||
                                deleteExtensionRequestMutation.isPending
                              }
                              onClick={async () => {
                                const ok = await confirm({
                                  title: isMachine
                                    ? "Xóa yêu cầu đổi máy"
                                    : "Xóa yêu cầu kích hoạt",
                                  description: isAdmin
                                    ? "Xóa yêu cầu này khỏi hệ thống?"
                                    : "Xóa yêu cầu này khỏi danh sách của bạn?",
                                  confirmLabel: "Xóa yêu cầu",
                                  variant: "danger",
                                });
                                if (!ok) return;
                                if (isMachine) {
                                  deleteMachineRequestMutation.mutate({ requestId: item.id });
                                } else {
                                  deleteExtensionRequestMutation.mutate({ requestId: item.id });
                                }
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                              aria-label="Xóa yêu cầu"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            Xóa yêu cầu
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {requesterName && (
                        <div className="flex items-center gap-2 min-w-0">
                          {renderRequestUserAvatar(displayUser, "w-6 h-6 text-[9px]")}
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                              {requesterName}
                            </div>
                            {displayUser?.email && (
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                {displayUser.email}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="text-xs text-slate-600 dark:text-slate-300">{item.reason}</div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(item.createdAt).toLocaleString("vi-VN")}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 5: ADMIN SYSTEM CONFIG & CRON SCHEDULES               */}
      {/* ========================================================= */}
      {activeTab === "admin_system" && isAdmin && (
        <div className="space-y-6 animate-fadeIn">
          {/* Schedule 1: GPM Fleet Inventory Schedule */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-cyan-500" />
                  1. Lịch Đồng Bộ Profile GPMLogin
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Tự động kiểm tra các profile và tài khoản TikTok trong GPMLogin, sau đó đồng bộ vào danh sách quản lý.
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
                  <span>Đồng Bộ Ngay</span>
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
                  Chưa thiết lập lịch đồng bộ tự động.
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
                          {formatScheduleItemLabel(item)}
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
                  2. Lịch Tự Động Cập Nhật Số Liệu TikTok
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Tự động cập nhật số liệu TikTok như doanh thu, RPM và video mới nhất.
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
                  <span>Đồng Bộ Ngay</span>
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
                  Chưa thiết lập lịch đồng bộ tự động.
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
                          {formatScheduleItemLabel(item)}
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
            ? "Cấu Hình Lịch Đồng Bộ Profile GPMLogin"
            : "Cấu Hình Lịch Tự Động Cập Nhật Số Liệu TikTok"
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

      {/* Image Preview Lightbox Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-4xl w-full bg-slate-900 border border-slate-700 rounded-3xl overflow-hidden shadow-2xl p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 text-white">
              <span className="text-xs sm:text-sm font-semibold text-slate-200 truncate pr-4">
                {previewImage.alt}
              </span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden bg-black flex items-center justify-center p-1">
              <img
                src={previewImage.src}
                alt={previewImage.alt}
                className="max-h-[82vh] w-auto object-contain rounded-xl shadow-inner"
              />
            </div>
          </div>
        </div>
      )}

      <StaffRequestModals
        machineModalOpen={machineModalOpen}
        onMachineModalOpenChange={setMachineModalOpen}
        extensionModalOpen={extensionModalOpen}
        onExtensionModalOpenChange={setExtensionModalOpen}
        boundMachineName={userProfile?.boundMachineName}
        boundMachineId={userProfile?.boundMachineId}
        boundOsUser={userProfile?.boundOsUser}
        onMachineSuccess={() => {
          refetchMachineChange();
          utils.user.listMyRequests.invalidate();
          toast.success("Đã gửi yêu cầu đổi máy. Chờ admin duyệt.");
        }}
        onExtensionSuccess={() => {
          refetchExtensionAccess();
          utils.user.listMyRequests.invalidate();
          toast.success("Đã gửi yêu cầu kích hoạt Extension. Chờ admin duyệt.");
        }}
      />
      {confirmDialog}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400 text-xs">Đang tải cài đặt...</div>}>
      <SettingsPageContent />
    </Suspense>
  );
}