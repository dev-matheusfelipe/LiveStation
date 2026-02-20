"use client";

import {
  ChangeEvent,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { extractYouTubeVideoId } from "@/lib/youtube-url";

type LayoutPreset = {
  id: string;
  label: string;
  columns: number;
  maxSlots: number;
};

const LAYOUTS: LayoutPreset[] = [
  { id: "single", label: "1 tela", columns: 1, maxSlots: 1 },
  { id: "duo", label: "2 telas", columns: 2, maxSlots: 2 },
  { id: "quad", label: "4 telas", columns: 2, maxSlots: 4 },
  { id: "six", label: "6 telas", columns: 3, maxSlots: 6 },
  { id: "nine", label: "9 telas", columns: 3, maxSlots: 9 },
  { id: "twelve", label: "12 telas", columns: 4, maxSlots: 12 }
];

type WatchStationProps = {
  email: string;
};

const CHAT_WIDTH = 360;
const CHAT_HEIGHT = 420;
const SUSPENDED_WIDTH = 420;
const SUSPENDED_HEIGHT = 246;
const ICON_SIZE = 14;
const AUTO_LAYOUT_DELAY_MS = 90_000;
const PRESENCE_HEARTBEAT_MS = 5_000;
const MOBILE_MAX_VIDEOS = 3;
const APP_VERSION = "v0.4.5";
const BUG_TYPES: Array<{ value: BugType; label: string }> = [
  { value: "ui", label: "Interface" },
  { value: "audio", label: "Audio" },
  { value: "video", label: "Video/Player" },
  { value: "account", label: "Conta/Login" },
  { value: "performance", label: "Performance" },
  { value: "other", label: "Outro" }
];

type ChatWindowState = {
  id: string;
  slot: number;
  x: number;
  y: number;
  z: number;
};

type SuspendedWindowState = {
  id: string;
  slot: number;
  videoId: string;
  pinMode: "free" | "locked" | "global";
  x: number;
  y: number;
  z: number;
};

type SiteStats = {
  totalUsers: number;
  onlineUsers: number;
  offlineUsers: number;
  totalActiveVideos: number;
  profilesWithAvatar: number;
  totalWatchSeconds: number;
  topWatcherName: string;
  topWatcherSeconds: number;
};

type SiteMessage = {
  id: string;
  userEmail: string;
  userName: string;
  avatarDataUrl: string | null;
  text: string;
  createdAt: string;
};

type SearchVideoResult = {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string | null;
};

type SearchChannelResult = {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
};

type ChangelogEntry = {
  version: string;
  date: string;
  improvements: string[];
  fixes: string[];
};

type BugType = "ui" | "audio" | "video" | "account" | "performance" | "other";

type BugReportItem = {
  id: string;
  userEmail: string;
  userName: string;
  avatarDataUrl: string | null;
  bugType: BugType;
  text: string;
  imageDataUrl: string | null;
  adminReply: string | null;
  createdAt: string;
  updatedAt: string;
};

type PersistedWatchState = {
  layoutId: string | null;
  slots: Array<string | null>;
  slotMuted: Record<number, boolean>;
  slotVolume: Record<number, number>;
  slotHidden: Record<number, boolean>;
  slotAudioEffectEnabled: Record<number, boolean>;
};

type LayoutSnapshot = {
  layoutId: string | null;
  slots: Array<string | null>;
  slotInputs: string[];
  selectedSlot: number | null;
  slotMuted: Record<number, boolean>;
  slotVolume: Record<number, number>;
  slotHidden: Record<number, boolean>;
  slotAudioEffectEnabled: Record<number, boolean>;
};

function formatMessageDateTime(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function formatWatchDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

async function fileToOptimizedAvatarDataUrl(file: File): Promise<string> {
  const sourceDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Falha ao ler imagem."));
      }
    };
    reader.onerror = () => reject(new Error("Falha ao ler imagem."));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Imagem invalida."));
    img.src = sourceDataUrl;
  });

  const maxSide = 640;
  const largestSide = Math.max(image.naturalWidth, image.naturalHeight) || 1;
  const scale = Math.min(1, maxSide / largestSide);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return sourceDataUrl;
  }

  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.86);
}

function formatBugTypeLabel(type: BugType): string {
  const match = BUG_TYPES.find((item) => item.value === type);
  return match?.label ?? "Outro";
}

export function WatchStation({ email }: WatchStationProps) {
  const router = useRouter();
  const initialName = email.split("@")[0] ?? email;

  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [slots, setSlots] = useState<Array<string | null>>([]);
  const [slotInputs, setSlotInputs] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [errorBySlot, setErrorBySlot] = useState<Record<number, string | null>>({});
  const [isLightMode, setIsLightMode] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isPortraitViewport, setIsPortraitViewport] = useState(true);
  const [chatWindows, setChatWindows] = useState<ChatWindowState[]>([]);
  const [zCounter, setZCounter] = useState(1);
  const [embedDomain, setEmbedDomain] = useState("localhost");
  const [embedOrigin, setEmbedOrigin] = useState("http://localhost");
  const [slotMuted, setSlotMuted] = useState<Record<number, boolean>>({});
  const [slotVolume, setSlotVolume] = useState<Record<number, number>>({});
  const [slotHidden, setSlotHidden] = useState<Record<number, boolean>>({});
  const [slotAudioEffectEnabled, setSlotAudioEffectEnabled] = useState<Record<number, boolean>>({});
  const [volumePanelSlot, setVolumePanelSlot] = useState<number | null>(null);
  const [suspendedVolumePanelId, setSuspendedVolumePanelId] = useState<string | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);
  const [suspendedWindows, setSuspendedWindows] = useState<SuspendedWindowState[]>([]);

  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordPopupOpen, setPasswordPopupOpen] = useState(false);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [updatesList, setUpdatesList] = useState<ChangelogEntry[]>([]);
  const [updatesError, setUpdatesError] = useState<string | null>(null);
  const [bugPopupOpen, setBugPopupOpen] = useState(false);
  const [bugLoading, setBugLoading] = useState(false);
  const [bugSubmitting, setBugSubmitting] = useState(false);
  const [bugError, setBugError] = useState<string | null>(null);
  const [bugType, setBugType] = useState<BugType>("ui");
  const [bugText, setBugText] = useState("");
  const [bugImageDataUrl, setBugImageDataUrl] = useState<string | null>(null);
  const [bugImageLoading, setBugImageLoading] = useState(false);
  const [bugReports, setBugReports] = useState<BugReportItem[]>([]);
  const [bugIsAdmin, setBugIsAdmin] = useState(false);
  const [editingBugId, setEditingBugId] = useState<string | null>(null);
  const [editingBugText, setEditingBugText] = useState("");
  const [editingBugType, setEditingBugType] = useState<BugType>("ui");
  const [editingBugImageDataUrl, setEditingBugImageDataUrl] = useState<string | null>(null);
  const [replyingBugId, setReplyingBugId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [profileName, setProfileName] = useState(initialName);
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [profileWatchSeconds, setProfileWatchSeconds] = useState(0);
  const [avatarCenterLabel, setAvatarCenterLabel] = useState("Editar");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNext, setPasswordNext] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [profilePopoverPos, setProfilePopoverPos] = useState({ top: 72, left: 16 });
  const [siteStats, setSiteStats] = useState<SiteStats>({
    totalUsers: 0,
    onlineUsers: 0,
    offlineUsers: 0,
    totalActiveVideos: 0,
    profilesWithAvatar: 0,
    totalWatchSeconds: 0,
    topWatcherName: "-",
    topWatcherSeconds: 0
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchVideos, setSearchVideos] = useState<SearchVideoResult[]>([]);
  const [searchChannels, setSearchChannels] = useState<SearchChannelResult[]>([]);
  const [searchSource, setSearchSource] = useState<"api" | "mock">("mock");
  const [hasSearched, setHasSearched] = useState(false);
  const [movingSlot, setMovingSlot] = useState<number | null>(null);
  const [siteChatOpen, setSiteChatOpen] = useState(false);
  const [mobileStatsOpen, setMobileStatsOpen] = useState(false);
  const [siteMessages, setSiteMessages] = useState<SiteMessage[]>([]);
  const [siteMessageText, setSiteMessageText] = useState("");
  const [siteChatSending, setSiteChatSending] = useState(false);
  const [layoutsMenuOpen, setLayoutsMenuOpen] = useState(false);
  const [pendingLayout, setPendingLayout] = useState<LayoutPreset | null>(null);
  const [slotsToClose, setSlotsToClose] = useState<number[]>([]);
  const [autoLayoutInfo, setAutoLayoutInfo] = useState<string | null>(null);
  const [layoutMobileNotice, setLayoutMobileNotice] = useState<string | null>(null);

  const screenAreaRef = useRef<HTMLDivElement | null>(null);
  const profileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const profileFileInputRef = useRef<HTMLInputElement | null>(null);
  const slotRefs = useRef<Array<HTMLElement | null>>([]);
  const iframeRefs = useRef<Array<HTMLIFrameElement | null>>([]);
  const suspendedIframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
  const suspendedWindowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const suspendedPopoutRefs = useRef<Record<string, Window | null>>({});
  const suspendedPopoutCheckRefs = useRef<Record<string, ReturnType<typeof setInterval> | null>>({});
  const previousActiveVideosRef = useRef(0);
  const autoLayoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeVideosRef = useRef(0);
  const watchStateHydratedRef = useRef(false);
  const layoutSnapshotRef = useRef<LayoutSnapshot | null>(null);
  const dragStateRef = useRef<{
    offsetX: number;
    offsetY: number;
    targetId: string | null;
    targetType: "chat" | "suspended" | null;
    active: boolean;
  }>({ offsetX: 0, offsetY: 0, targetId: null, targetType: null, active: false });

  const layout = useMemo(() => {
    if (!layoutId) {
      return null;
    }
    return LAYOUTS.find((item) => item.id === layoutId) ?? LAYOUTS[2];
  }, [layoutId]);
  const effectiveColumns = useMemo(() => {
    if (!layout) {
      return 0;
    }
    if (!isMobileViewport) {
      return layout.columns;
    }

    return 1;
  }, [layout, isMobileViewport]);
  const renderedSlotCount = layout ? Math.min(layout.maxSlots, isMobileViewport ? MOBILE_MAX_VIDEOS : layout.maxSlots) : 0;
  const rowCount = renderedSlotCount ? Math.ceil(renderedSlotCount / effectiveColumns) : 0;
  const useAutoRowsOnMobile = isMobileViewport && effectiveColumns === 1;
  const renderedSlots = useMemo(() => slots.slice(0, renderedSlotCount), [slots, renderedSlotCount]);
  const logoSrc = isLightMode ? "/rizzer-logo-dark.png" : "/rizzer-logo-light.png";
  const initials = (profileName || initialName).slice(0, 2).toUpperCase();
  const watchStorageKey = useMemo(() => `livestation:watch:${email.toLowerCase()}`, [email]);

  const sendPresenceUpdate = useCallback(
    async (activeVideos: number, keepalive = false) => {
      const payload = JSON.stringify({ activeVideos: Math.max(0, Math.floor(activeVideos)) });
      try {
        const response = await fetch("/api/site/presence", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive
        });
        if (response.status === 401) {
          window.location.replace("/login");
          return;
        }
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { watchSeconds?: number };
        if (typeof data.watchSeconds === "number" && Number.isFinite(data.watchSeconds)) {
          const nextSeconds = Math.max(0, Math.floor(data.watchSeconds));
          setProfileWatchSeconds((prev) => Math.max(prev, nextSeconds));
        }
      } catch {
        // ignore presence errors
      }
    },
    []
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setIsLightMode(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(watchStorageKey);
      if (!raw) {
        watchStateHydratedRef.current = true;
        return;
      }

      const parsed = JSON.parse(raw) as PersistedWatchState;
      const restoredLayout = parsed.layoutId ? LAYOUTS.find((item) => item.id === parsed.layoutId) : null;
      if (!restoredLayout) {
        watchStateHydratedRef.current = true;
        return;
      }

      const restoredSlots = Array.from({ length: restoredLayout.maxSlots }, (_, index) => {
        const value = parsed.slots?.[index];
        return typeof value === "string" && value.trim() ? value : null;
      });

      const nextMuted: Record<number, boolean> = {};
      const nextVolume: Record<number, number> = {};
      const nextHidden: Record<number, boolean> = {};
      const nextAudioEffect: Record<number, boolean> = {};

      for (let index = 0; index < restoredSlots.length; index += 1) {
        if (!restoredSlots[index]) {
          continue;
        }
        nextMuted[index] = parsed.slotMuted?.[index] ?? true;
        const storedVolume = parsed.slotVolume?.[index];
        nextVolume[index] =
          typeof storedVolume === "number" && Number.isFinite(storedVolume)
            ? Math.max(0, Math.min(100, Math.floor(storedVolume)))
            : 100;
        nextHidden[index] = parsed.slotHidden?.[index] ?? false;
        nextAudioEffect[index] = parsed.slotAudioEffectEnabled?.[index] ?? true;
      }

      setLayoutId(restoredLayout.id);
      setSlots(restoredSlots);
      setSlotInputs(Array.from({ length: restoredLayout.maxSlots }, () => ""));
      setSlotMuted(nextMuted);
      setSlotVolume(nextVolume);
      setSlotHidden(nextHidden);
      setSlotAudioEffectEnabled(nextAudioEffect);
      setSelectedSlot(null);
      setExpandedSlot(null);
      setVolumePanelSlot(null);
      setErrorBySlot({});
    } catch {
      // Ignore invalid local storage payload.
    } finally {
      watchStateHydratedRef.current = true;
    }
  }, [watchStorageKey]);

  useEffect(() => {
    if (!watchStateHydratedRef.current) {
      return;
    }

    if (!layoutId) {
      window.localStorage.removeItem(watchStorageKey);
      return;
    }

    const payload: PersistedWatchState = {
      layoutId,
      slots,
      slotMuted,
      slotVolume,
      slotHidden,
      slotAudioEffectEnabled
    };
    try {
      window.localStorage.setItem(watchStorageKey, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors.
    }
  }, [layoutId, slots, slotMuted, slotVolume, slotHidden, slotAudioEffectEnabled, watchStorageKey]);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 960px)");
    const onChange = () => setIsMobileViewport(mobile.matches);
    onChange();
    mobile.addEventListener("change", onChange);
    return () => mobile.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const portrait = window.matchMedia("(orientation: portrait)");
    const onChange = () => setIsPortraitViewport(portrait.matches);
    onChange();
    portrait.addEventListener("change", onChange);
    return () => portrait.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    setEmbedDomain(window.location.hostname || "localhost");
    setEmbedOrigin(window.location.origin || "http://localhost");
  }, []);

  useEffect(() => {
    async function loadProfile() {
      try {
        const response = await fetch("/api/auth/profile");
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as {
          username: string;
          displayName: string;
          avatarDataUrl: string | null;
          watchSeconds?: number;
        };
        setProfileName(data.username || data.displayName || initialName);
        setProfileAvatar(data.avatarDataUrl ?? null);
        const nextSeconds = Math.max(0, Math.floor(data.watchSeconds ?? 0));
        setProfileWatchSeconds((prev) => Math.max(prev, nextSeconds));
      } catch {
        // keep default profile
      }
    }
    loadProfile();
  }, [initialName]);

  useEffect(() => {
    async function pullStats() {
      try {
        const response = await fetch("/api/site/stats");
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as Partial<SiteStats>;
        setSiteStats({
          totalUsers: data.totalUsers ?? 0,
          onlineUsers: data.onlineUsers ?? 0,
          offlineUsers: data.offlineUsers ?? 0,
          totalActiveVideos: data.totalActiveVideos ?? 0,
          profilesWithAvatar: data.profilesWithAvatar ?? 0,
          totalWatchSeconds: Math.max(0, Math.floor(data.totalWatchSeconds ?? 0)),
          topWatcherName: data.topWatcherName ?? "-",
          topWatcherSeconds: Math.max(0, Math.floor(data.topWatcherSeconds ?? 0))
        });
      } catch {
        // ignore polling errors
      }
    }

    pullStats();
    const timer = setInterval(pullStats, 10_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const activeVideos = slots.filter(Boolean).length + suspendedWindows.length;
    activeVideosRef.current = activeVideos;
    void sendPresenceUpdate(activeVideos);
  }, [slots, suspendedWindows, sendPresenceUpdate]);

  useEffect(() => {
    if (!isMobileViewport || !layout) {
      return;
    }

    const limit = Math.min(layout.maxSlots, MOBILE_MAX_VIDEOS);
    if (slots.length <= limit) {
      return;
    }

    setSlots((prev) => prev.slice(0, limit));
    setSlotInputs((prev) => prev.slice(0, limit));
    setChatWindows((prev) => prev.filter((item) => item.slot < limit));
    setSuspendedWindows((prev) => prev.filter((item) => item.slot < limit));
    setSelectedSlot((current) => (current !== null && current >= limit ? null : current));
    setExpandedSlot((current) => (current !== null && current >= limit ? null : current));
    setVolumePanelSlot((current) => (current !== null && current >= limit ? null : current));
    setErrorBySlot((prev) => {
      const next: Record<number, string | null> = {};
      for (const [index, value] of Object.entries(prev)) {
        const slotIndex = Number(index);
        if (Number.isFinite(slotIndex) && slotIndex < limit) {
          next[slotIndex] = value;
        }
      }
      return next;
    });
  }, [isMobileViewport, layout, slots.length]);

  useEffect(() => {
    const timer = setInterval(() => {
      void sendPresenceUpdate(activeVideosRef.current);
    }, PRESENCE_HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [sendPresenceUpdate]);

  useEffect(() => {
    const clampFloatingWindows = () => {
      const area = screenAreaRef.current;
      if (!area) {
        return;
      }
      const rect = area.getBoundingClientRect();
      const chatWidth = isMobileViewport ? Math.min(rect.width * 0.92, CHAT_WIDTH) : CHAT_WIDTH;
      const chatHeight = isMobileViewport ? Math.min(rect.height * 0.58, CHAT_HEIGHT) : CHAT_HEIGHT;
      const suspendedWidth = isMobileViewport ? Math.min(rect.width * 0.92, SUSPENDED_WIDTH) : SUSPENDED_WIDTH;
      const suspendedHeight = isMobileViewport ? Math.min(rect.height * 0.42, SUSPENDED_HEIGHT) : SUSPENDED_HEIGHT;

      setChatWindows((prev) =>
        prev.map((item) => ({
          ...item,
          x: Math.min(Math.max(0, item.x), Math.max(0, rect.width - chatWidth - 4)),
          y: Math.min(Math.max(0, item.y), Math.max(0, rect.height - chatHeight - 4))
        }))
      );
      setSuspendedWindows((prev) =>
        prev.map((item) => ({
          ...item,
          x: Math.min(Math.max(0, item.x), Math.max(0, rect.width - suspendedWidth - 4)),
          y: Math.min(Math.max(0, item.y), Math.max(0, rect.height - suspendedHeight - 4))
        }))
      );
      if (isMobileViewport) {
        setVolumePanelSlot(null);
      }
    };

    const timer = setTimeout(clampFloatingWindows, 30);
    window.addEventListener("resize", clampFloatingWindows);
    window.addEventListener("orientationchange", clampFloatingWindows);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", clampFloatingWindows);
      window.removeEventListener("orientationchange", clampFloatingWindows);
    };
  }, [isMobileViewport, isPortraitViewport]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (activeVideosRef.current > 0) {
        setProfileWatchSeconds((prev) => prev + 1);
      }
    }, 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const flushPresence = () => {
      const activeVideos = activeVideosRef.current;
      const payload = JSON.stringify({ activeVideos: Math.max(0, Math.floor(activeVideos)) });
      try {
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: "application/json" });
          navigator.sendBeacon("/api/site/presence", blob);
          return;
        }
      } catch {
        // fallback to fetch below
      }
      void sendPresenceUpdate(activeVideos, true);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPresence();
      }
    };

    window.addEventListener("pagehide", flushPresence);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushPresence);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [sendPresenceUpdate]);

  useEffect(() => {
    slots.forEach((videoId, index) => {
      if (!videoId) {
        return;
      }
      const iframe = iframeRefs.current[index];
      if (!iframe?.contentWindow) {
        return;
      }
      const isMuted = slotMuted[index] ?? true;
      const volume = Math.max(0, Math.min(100, slotVolume[index] ?? 100));
      iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func: "setVolume", args: [volume] }), "*");
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: isMuted ? "mute" : "unMute", args: [] }),
        "*"
      );
    });
  }, [slots, slotMuted, slotVolume]);

  useEffect(() => {
    suspendedWindows.forEach((windowItem) => {
      const iframe = suspendedIframeRefs.current[windowItem.id];
      if (!iframe?.contentWindow) {
        return;
      }
      const isMuted = slotMuted[windowItem.slot] ?? true;
      const volume = Math.max(0, Math.min(100, slotVolume[windowItem.slot] ?? 100));
      iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func: "setVolume", args: [volume] }), "*");
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: isMuted ? "mute" : "unMute", args: [] }),
        "*"
      );
    });
  }, [suspendedWindows, slotMuted, slotVolume]);

  useEffect(() => {
    if (!siteChatOpen) {
      return;
    }
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    const source = new EventSource("/api/site/chat/stream");

    const onMessages = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as { messages: SiteMessage[] };
        setSiteMessages(data.messages);
      } catch {
        // ignore malformed events
      }
    };

    const onMessage = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as { message: SiteMessage };
        const next = data.message;
        setSiteMessages((prev) => {
          if (prev.some((item) => item.id === next.id)) {
            return prev;
          }
          return [...prev, next].slice(-200);
        });
      } catch {
        // ignore malformed events
      }
    };

    const enableFallbackPolling = () => {
      if (fallbackTimer) {
        return;
      }
      const pullMessages = async () => {
        try {
          const response = await fetch("/api/site/chat");
          if (!response.ok) {
            return;
          }
          const data = (await response.json()) as { messages: SiteMessage[] };
          setSiteMessages(data.messages);
        } catch {
          // ignore polling errors
        }
      };
      void pullMessages();
      fallbackTimer = setInterval(pullMessages, 4_000);
    };

    source.addEventListener("messages", onMessages as EventListener);
    source.addEventListener("message", onMessage as EventListener);
    source.onerror = () => {
      source.close();
      enableFallbackPolling();
    };

    return () => {
      source.close();
      source.removeEventListener("messages", onMessages as EventListener);
      source.removeEventListener("message", onMessage as EventListener);
      if (fallbackTimer) {
        clearInterval(fallbackTimer);
      }
    };
  }, [siteChatOpen]);

  const sendPlayerCommand = useCallback(
    (slotIndex: number, func: string, args: Array<string | number | boolean> = []) => {
      const iframe = iframeRefs.current[slotIndex];
      if (!iframe?.contentWindow) {
        return;
      }
      iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func, args }), "*");
    },
    []
  );

  const syncPlayerState = useCallback(
    (slotIndex: number) => {
      const isMuted = slotMuted[slotIndex] ?? true;
      const volume = Math.max(0, Math.min(100, slotVolume[slotIndex] ?? 100));
      sendPlayerCommand(slotIndex, "setVolume", [volume]);
      sendPlayerCommand(slotIndex, isMuted ? "mute" : "unMute");
    },
    [sendPlayerCommand, slotMuted, slotVolume]
  );

  const sendSuspendedPlayerCommand = useCallback(
    (windowId: string, func: string, args: Array<string | number | boolean> = []) => {
      const iframe = suspendedIframeRefs.current[windowId];
      if (!iframe?.contentWindow) {
        return;
      }
      iframe.contentWindow.postMessage(
        JSON.stringify({
          event: "command",
          func,
          args
        }),
        "*"
      );
    },
    []
  );

  const syncSuspendedPlayerState = useCallback(
    (windowItem: SuspendedWindowState) => {
      const isMuted = slotMuted[windowItem.slot] ?? true;
      const volume = Math.max(0, Math.min(100, slotVolume[windowItem.slot] ?? 100));
      sendSuspendedPlayerCommand(windowItem.id, "setVolume", [volume]);
      sendSuspendedPlayerCommand(windowItem.id, isMuted ? "mute" : "unMute");
    },
    [sendSuspendedPlayerCommand, slotMuted, slotVolume]
  );

  function onPlayerReady(slotIndex: number) {
    syncPlayerState(slotIndex);
  }

  function onSuspendedPlayerReady(windowItem: SuspendedWindowState) {
    syncSuspendedPlayerState(windowItem);
  }

  function toggleSlotMute(slotIndex: number) {
    setSlotMuted((prev) => {
      const next = { ...prev, [slotIndex]: !(prev[slotIndex] ?? true) };
      return next;
    });
  }

  function setSlotVolumeLevel(slotIndex: number, level: number) {
    const normalized = Math.max(0, Math.min(100, Math.floor(level)));
    setSlotVolume((prev) => ({ ...prev, [slotIndex]: normalized }));
  }

  function toggleSlotHidden(slotIndex: number) {
    setSlotHidden((prev) => ({ ...prev, [slotIndex]: !(prev[slotIndex] ?? false) }));
  }

  function toggleSlotAudioEffect(slotIndex: number) {
    setSlotAudioEffectEnabled((prev) => ({ ...prev, [slotIndex]: !(prev[slotIndex] ?? true) }));
  }

  function addVideoToSlot(slotIndex: number, videoId: string) {
    if (!videoId) {
      return;
    }
    if (isMobileViewport && !slots[slotIndex] && slots.filter(Boolean).length >= MOBILE_MAX_VIDEOS) {
      setErrorBySlot((prev) => ({ ...prev, [slotIndex]: `No mobile, limite maximo de ${MOBILE_MAX_VIDEOS} videos.` }));
      return;
    }
    setErrorBySlot((prev) => ({ ...prev, [slotIndex]: null }));
    setSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = videoId;
      return next;
    });
    const activeVideosAfterAdd = slots[slotIndex] ? slots.filter(Boolean).length : slots.filter(Boolean).length + 1;
    activeVideosRef.current = activeVideosAfterAdd;
    void sendPresenceUpdate(activeVideosAfterAdd);
    setSlotMuted((prev) => ({ ...prev, [slotIndex]: true }));
    setSlotVolume((prev) => ({ ...prev, [slotIndex]: 100 }));
    setSlotHidden((prev) => ({ ...prev, [slotIndex]: false }));
    setSlotAudioEffectEnabled((prev) => ({ ...prev, [slotIndex]: true }));
    setSuspendedWindows((prev) => prev.filter((item) => item.slot !== slotIndex));
    setSlotInputs((prev) => {
      const next = [...prev];
      next[slotIndex] = "";
      return next;
    });
  }

  function findBestSlotForInsert() {
    if (
      selectedSlot !== null &&
      selectedSlot < renderedSlotCount &&
      !renderedSlots[selectedSlot]
    ) {
      return selectedSlot;
    }
    const emptyIndex = renderedSlots.findIndex((videoId) => !videoId);
    if (emptyIndex >= 0) {
      return emptyIndex;
    }
    if (selectedSlot !== null && selectedSlot < renderedSlotCount) {
      return selectedSlot;
    }
    return 0;
  }

  function applyLinkToSlot(event: FormEvent, slotIndex: number) {
    event.preventDefault();
    const id = extractYouTubeVideoId(slotInputs[slotIndex] ?? "");
    if (!id) {
      setErrorBySlot((prev) => ({ ...prev, [slotIndex]: "Link invalido." }));
      return;
    }
    addVideoToSlot(slotIndex, id);
  }

  function removeVideo(slotIndex: number) {
    const nextBeforeCompact = [...slots];
    nextBeforeCompact[slotIndex] = null;

    const compactedVideos = nextBeforeCompact.filter(Boolean) as string[];
    const nextSlots = Array.from({ length: nextBeforeCompact.length }, (_, index) => compactedVideos[index] ?? null);

    const indexMap = new Map<number, number>();
    let nextFilledIndex = 0;
    for (let oldIndex = 0; oldIndex < nextBeforeCompact.length; oldIndex += 1) {
      if (nextBeforeCompact[oldIndex]) {
        indexMap.set(oldIndex, nextFilledIndex);
        nextFilledIndex += 1;
      }
    }

    setSlots(nextSlots);
    const activeVideosAfterRemove = nextSlots.filter(Boolean).length;
    activeVideosRef.current = activeVideosAfterRemove;
    void sendPresenceUpdate(activeVideosAfterRemove);
    setSlotInputs(Array.from({ length: nextSlots.length }, () => ""));
    setErrorBySlot({});

    setSlotMuted((prev) => {
      const next: Record<number, boolean> = {};
      for (const [oldIndex, newIndex] of indexMap.entries()) {
        next[newIndex] = prev[oldIndex] ?? true;
      }
      return next;
    });

    setSlotVolume((prev) => {
      const next: Record<number, number> = {};
      for (const [oldIndex, newIndex] of indexMap.entries()) {
        next[newIndex] = prev[oldIndex] ?? 100;
      }
      return next;
    });

    setSlotHidden((prev) => {
      const next: Record<number, boolean> = {};
      for (const [oldIndex, newIndex] of indexMap.entries()) {
        next[newIndex] = prev[oldIndex] ?? false;
      }
      return next;
    });
    setSlotAudioEffectEnabled((prev) => {
      const next: Record<number, boolean> = {};
      for (const [oldIndex, newIndex] of indexMap.entries()) {
        next[newIndex] = prev[oldIndex] ?? true;
      }
      return next;
    });

    setChatWindows((prev) =>
      prev
        .filter((item) => item.slot !== slotIndex)
        .map((item) => {
          const mapped = indexMap.get(item.slot);
          return mapped === undefined ? null : { ...item, slot: mapped };
        })
        .filter(Boolean) as ChatWindowState[]
    );

    setSelectedSlot((current) => {
      if (current === null) {
        return null;
      }
      const mapped = indexMap.get(current);
      return mapped === undefined ? null : mapped;
    });

    setExpandedSlot((current) => {
      if (current === null) {
        return null;
      }
      const mapped = indexMap.get(current);
      return mapped === undefined ? null : mapped;
    });

    setVolumePanelSlot((current) => {
      if (current === null) {
        return null;
      }
      const mapped = indexMap.get(current);
      return mapped === undefined ? null : mapped;
    });

    setSuspendedWindows((prev) => prev.filter((item) => item.slot !== slotIndex));
  }

  const applyLayoutChange = useCallback(
    (nextLayout: LayoutPreset, sourceSlots: Array<string | null>) => {
      const compactedVideos = sourceSlots.filter(Boolean) as string[];
      const cappedMaxSlots = isMobileViewport ? Math.min(nextLayout.maxSlots, MOBILE_MAX_VIDEOS) : nextLayout.maxSlots;
      const nextSlots = Array.from({ length: cappedMaxSlots }, (_, index) => compactedVideos[index] ?? null);

      if (layoutId === nextLayout.id) {
        setLayoutId(null);
        setSlots([]);
        setSlotInputs([]);
        setSelectedSlot(null);
        setErrorBySlot({});
        setChatWindows([]);
        setExpandedSlot(null);
        setVolumePanelSlot(null);
        setSlotMuted({});
        setSlotVolume({});
        setSlotHidden({});
        setSlotAudioEffectEnabled({});
        setPendingLayout(null);
        setSlotsToClose([]);
        return;
      }

      setLayoutId(nextLayout.id);
      setSlots(nextSlots);
      setSlotInputs(Array.from({ length: cappedMaxSlots }, () => ""));
      setErrorBySlot({});
      setExpandedSlot(null);
      setVolumePanelSlot(null);
      setSlotMuted(
        nextSlots.reduce<Record<number, boolean>>((acc, videoId, index) => {
          if (videoId) {
            acc[index] = true;
          }
          return acc;
        }, {})
      );
      setSlotVolume(
        nextSlots.reduce<Record<number, number>>((acc, videoId, index) => {
          if (videoId) {
            acc[index] = 100;
          }
          return acc;
        }, {})
      );
      setSlotHidden({});
      setSlotAudioEffectEnabled(
        nextSlots.reduce<Record<number, boolean>>((acc, videoId, index) => {
          if (videoId) {
            acc[index] = true;
          }
          return acc;
        }, {})
      );
      setSelectedSlot((current) => {
        if (current === null) {
          return null;
        }
        return Math.min(current, cappedMaxSlots - 1);
      });
      setChatWindows([]);
      setPendingLayout(null);
      setSlotsToClose([]);
    },
    [layoutId, isMobileViewport]
  );

  useEffect(() => {
    const activeVideos = slots.filter(Boolean).length + suspendedWindows.length;
    const previousActiveVideos = previousActiveVideosRef.current;
    previousActiveVideosRef.current = activeVideos;

    if (autoLayoutTimerRef.current) {
      clearTimeout(autoLayoutTimerRef.current);
      autoLayoutTimerRef.current = null;
    }

    setAutoLayoutInfo(null);

    if (!layoutId || activeVideos < 1) {
      return;
    }

    if (suspendedWindows.length > 0) {
      return;
    }

    const currentLayout = LAYOUTS.find((item) => item.id === layoutId);
    if (!currentLayout) {
      return;
    }

    const target = LAYOUTS.find((item) => item.maxSlots >= activeVideos) ?? currentLayout;
    const shouldShrink = target.maxSlots < currentLayout.maxSlots;
    const videoCountDropped = activeVideos < previousActiveVideos;

    if (!videoCountDropped || !shouldShrink) {
      return;
    }

    setAutoLayoutInfo(`Ajustando para ${target.label}...`);
    autoLayoutTimerRef.current = setTimeout(() => {
      applyLayoutChange(target, slots);
      setAutoLayoutInfo(null);
      autoLayoutTimerRef.current = null;
    }, AUTO_LAYOUT_DELAY_MS);

    return () => {
      if (autoLayoutTimerRef.current) {
        clearTimeout(autoLayoutTimerRef.current);
        autoLayoutTimerRef.current = null;
      }
    };
  }, [slots, suspendedWindows, layoutId, applyLayoutChange]);

  function onLayoutSelect(nextLayout: LayoutPreset) {
    setLayoutsMenuOpen(false);

    const isMobileViewport = typeof window !== "undefined" && window.matchMedia("(max-width: 960px)").matches;
    const largeLayoutIds = new Set(["six", "nine", "twelve"]);
    if (isMobileViewport && largeLayoutIds.has(nextLayout.id)) {
      setLayoutMobileNotice("Este layout fica melhor em computador ou telas maiores.");
      if (mobileNoticeTimerRef.current) {
        clearTimeout(mobileNoticeTimerRef.current);
      }
      mobileNoticeTimerRef.current = setTimeout(() => {
        setLayoutMobileNotice(null);
        mobileNoticeTimerRef.current = null;
      }, 3200);
    }

    if (layoutId === nextLayout.id) {
      applyLayoutChange(nextLayout, slots);
      return;
    }

    const currentActiveVideos = slots.filter(Boolean).length;
    if (nextLayout.maxSlots < currentActiveVideos) {
      setPendingLayout(nextLayout);
      setSlotsToClose([]);
      return;
    }

    applyLayoutChange(nextLayout, slots);
  }

  function confirmLayoutWithClosures() {
    if (!pendingLayout) {
      return;
    }
    const requiredClosures = Math.max(0, slots.filter(Boolean).length - pendingLayout.maxSlots);
    if (slotsToClose.length !== requiredClosures) {
      return;
    }

    const nextSource = [...slots];
    for (const slotIndex of slotsToClose) {
      nextSource[slotIndex] = null;
    }
    applyLayoutChange(pendingLayout, nextSource);
  }

  function cancelLayoutChange() {
    setPendingLayout(null);
    setSlotsToClose([]);
  }

  function toggleCloseSlot(slotIndex: number) {
    setSlotsToClose((prev) => (prev.includes(slotIndex) ? prev.filter((item) => item !== slotIndex) : [...prev, slotIndex]));
  }

  function swapSlots(sourceIndex: number, targetIndex: number) {
    setSlots((prev) => {
      const next = [...prev];
      const temp = next[sourceIndex] ?? null;
      next[sourceIndex] = next[targetIndex] ?? null;
      next[targetIndex] = temp;
      return next;
    });
    setSlotInputs((prev) => {
      const next = [...prev];
      const temp = next[sourceIndex] ?? "";
      next[sourceIndex] = next[targetIndex] ?? "";
      next[targetIndex] = temp;
      return next;
    });
    setErrorBySlot((prev) => {
      const next = { ...prev };
      const temp = next[sourceIndex] ?? null;
      next[sourceIndex] = next[targetIndex] ?? null;
      next[targetIndex] = temp;
      return next;
    });
    setSlotMuted((prev) => {
      const next = { ...prev };
      const temp = next[sourceIndex] ?? true;
      next[sourceIndex] = next[targetIndex] ?? true;
      next[targetIndex] = temp;
      return next;
    });
    setSlotVolume((prev) => {
      const next = { ...prev };
      const temp = next[sourceIndex] ?? 100;
      next[sourceIndex] = next[targetIndex] ?? 100;
      next[targetIndex] = temp;
      return next;
    });
    setSlotHidden((prev) => {
      const next = { ...prev };
      const temp = next[sourceIndex] ?? false;
      next[sourceIndex] = next[targetIndex] ?? false;
      next[targetIndex] = temp;
      return next;
    });
    setSlotAudioEffectEnabled((prev) => {
      const next = { ...prev };
      const temp = next[sourceIndex] ?? true;
      next[sourceIndex] = next[targetIndex] ?? true;
      next[targetIndex] = temp;
      return next;
    });
    setSelectedSlot(targetIndex);
    setMovingSlot(null);
  }

  function toggleSlotSelection(index: number) {
    if (movingSlot !== null) {
      if (movingSlot === index) {
        setMovingSlot(null);
        return;
      }
      swapSlots(movingSlot, index);
      return;
    }
    setSelectedSlot((current) => (current === index ? null : index));
  }

  async function submitSearch(event: FormEvent) {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setSearchError("Digite um termo para buscar.");
      setSearchVideos([]);
      setSearchChannels([]);
      setHasSearched(false);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    setHasSearched(true);
    if (layoutId && !layoutSnapshotRef.current) {
      layoutSnapshotRef.current = {
        layoutId,
        slots: [...slots],
        slotInputs: [...slotInputs],
        selectedSlot,
        slotMuted: { ...slotMuted },
        slotVolume: { ...slotVolume },
        slotHidden: { ...slotHidden },
        slotAudioEffectEnabled: { ...slotAudioEffectEnabled }
      };
    }
    if (layoutId) {
      setLayoutId(null);
      setSelectedSlot(null);
      setExpandedSlot(null);
      setVolumePanelSlot(null);
    }

    try {
      const response = await fetch(`/api/youtube/search?query=${encodeURIComponent(query)}`);
      const data = (await response.json()) as {
        source: "api" | "mock";
        videos: SearchVideoResult[];
        channels: SearchChannelResult[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Falha ao buscar no YouTube.");
      }
      setSearchSource(data.source);
      setSearchVideos(data.videos ?? []);
      setSearchChannels(data.channels ?? []);
      if ((data.videos?.length ?? 0) === 0 && (data.channels?.length ?? 0) === 0) {
        setSearchError("Nada encontrado para este termo.");
      }
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Falha ao buscar no YouTube.");
      setSearchVideos([]);
      setSearchChannels([]);
    } finally {
      setSearchLoading(false);
    }
  }

  function addSearchVideo(videoId: string) {
    if (!layoutId && layoutSnapshotRef.current?.layoutId) {
      const snapshot = layoutSnapshotRef.current;
      const nextSlots = [...snapshot.slots];
      const firstEmpty = nextSlots.findIndex((value) => !value);
      const fromSelected =
        snapshot.selectedSlot !== null &&
        snapshot.selectedSlot < nextSlots.length &&
        !nextSlots[snapshot.selectedSlot]
          ? snapshot.selectedSlot
          : null;
      const targetSlot = firstEmpty >= 0 ? firstEmpty : (fromSelected ?? 0);
      nextSlots[targetSlot] = videoId;

      setLayoutId(snapshot.layoutId);
      setSlots(nextSlots);
      setSlotInputs(Array.from({ length: nextSlots.length }, () => ""));
      setSelectedSlot(targetSlot);
      setErrorBySlot({});
      setSlotMuted({ ...snapshot.slotMuted, [targetSlot]: true });
      setSlotVolume({ ...snapshot.slotVolume, [targetSlot]: 100 });
      setSlotHidden({ ...snapshot.slotHidden, [targetSlot]: false });
      setSlotAudioEffectEnabled({ ...snapshot.slotAudioEffectEnabled, [targetSlot]: true });
      setSuspendedWindows((prev) => prev.filter((item) => item.slot !== targetSlot));
      const activeVideos = nextSlots.filter(Boolean).length;
      activeVideosRef.current = activeVideos;
      void sendPresenceUpdate(activeVideos);
      setHasSearched(false);
      setSearchError(null);
      layoutSnapshotRef.current = null;
      return;
    }

    if (!layoutId) {
      const defaultLayout = LAYOUTS[1] ?? LAYOUTS[0];
      const nextSlots = Array.from({ length: defaultLayout.maxSlots }, (_, index) => (index === 0 ? videoId : null));
      setLayoutId(defaultLayout.id);
      setSlots(nextSlots);
      setSlotInputs(Array.from({ length: defaultLayout.maxSlots }, () => ""));
      setSelectedSlot(0);
      setErrorBySlot({});
      setSlotMuted({ 0: true });
      setSlotVolume({ 0: 100 });
      setSlotHidden({ 0: false });
      setSlotAudioEffectEnabled({ 0: true });
      setVolumePanelSlot(null);
      setExpandedSlot(null);
      activeVideosRef.current = 1;
      void sendPresenceUpdate(1);
      setHasSearched(false);
      setSearchError(null);
      return;
    }

    const targetSlot = findBestSlotForInsert();
    addVideoToSlot(targetSlot, videoId);
    setSelectedSlot(targetSlot);
    setHasSearched(false);
    setSearchError(null);
  }

  function clearSearch() {
    setSearchQuery("");
    setSearchError(null);
    setSearchVideos([]);
    setSearchChannels([]);
    setHasSearched(false);
    if (layoutSnapshotRef.current) {
      const snapshot = layoutSnapshotRef.current;
      setLayoutId(snapshot.layoutId);
      setSlots(snapshot.slots);
      setSlotInputs(snapshot.slotInputs);
      setSelectedSlot(snapshot.selectedSlot);
      setSlotMuted(snapshot.slotMuted);
      setSlotVolume(snapshot.slotVolume);
      setSlotHidden(snapshot.slotHidden);
      setSlotAudioEffectEnabled(snapshot.slotAudioEffectEnabled);
      layoutSnapshotRef.current = null;
    }
  }

  const showSearchPanel = hasSearched;

  function clampWithinScreenArea(x: number, y: number, width = CHAT_WIDTH, height = CHAT_HEIGHT) {
    const area = screenAreaRef.current;
    if (!area) {
      return { x, y };
    }
    const maxX = Math.max(6, area.clientWidth - width - 6);
    const maxY = Math.max(6, area.clientHeight - height - 6);
    return {
      x: Math.max(6, Math.min(x, maxX)),
      y: Math.max(6, Math.min(y, maxY))
    };
  }

  function clampWithinViewport(x: number, y: number, width = SUSPENDED_WIDTH, height = SUSPENDED_HEIGHT) {
    if (typeof window === "undefined") {
      return { x, y };
    }
    const maxX = Math.max(6, window.innerWidth - width - 6);
    const maxY = Math.max(6, window.innerHeight - height - 6);
    return {
      x: Math.max(6, Math.min(x, maxX)),
      y: Math.max(6, Math.min(y, maxY))
    };
  }

  function suspendSlotVideo(slotIndex: number) {
    const videoId = slots[slotIndex];
    if (!videoId) {
      return;
    }

    const area = screenAreaRef.current;
    const nextZ = zCounter + 1;
    setZCounter(nextZ);

    setSuspendedWindows((prev) => {
      const existing = prev.find((item) => item.slot === slotIndex);
      if (existing) {
        return prev.map((item) => (item.id === existing.id ? { ...item, z: nextZ } : item));
      }

      const x = typeof window !== "undefined" ? (window.innerWidth - SUSPENDED_WIDTH) / 2 : 12;
      const y = typeof window !== "undefined" ? (window.innerHeight - SUSPENDED_HEIGHT) / 2 : 12;
      const clamped = clampWithinViewport(x, y, SUSPENDED_WIDTH, SUSPENDED_HEIGHT);

      return [
        ...prev,
        {
          id: `suspended-${slotIndex}`,
          slot: slotIndex,
          videoId,
          pinMode: "free",
          x: clamped.x,
          y: clamped.y,
          z: nextZ
        }
      ];
    });

    setSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = null;
      return next;
    });
    setChatWindows((prev) => prev.filter((item) => item.slot !== slotIndex));
    if (selectedSlot === slotIndex) {
      setSelectedSlot(null);
    }
    if (expandedSlot === slotIndex) {
      setExpandedSlot(null);
    }
  }

  function restoreSuspendedVideo(slotIndex: number) {
    const suspended = suspendedWindows.find((item) => item.slot === slotIndex);
    if (!suspended) {
      return;
    }

    const preferredSlot = slotIndex >= 0 && slotIndex < slots.length ? slotIndex : 0;
    const targetSlot = slots[preferredSlot] ? slots.findIndex((videoId) => !videoId) : preferredSlot;
    if (targetSlot === -1) {
      setErrorBySlot((prev) => ({ ...prev, [slotIndex]: "Sem espaco para retornar video suspenso." }));
      return;
    }

    setSlots((prev) => {
      const next = [...prev];
      next[targetSlot] = suspended.videoId;
      return next;
    });
    setSlotMuted((prev) => ({ ...prev, [targetSlot]: true }));
    setSlotVolume((prev) => ({ ...prev, [targetSlot]: 100 }));
    setSlotHidden((prev) => ({ ...prev, [targetSlot]: false }));
    setErrorBySlot((prev) => ({ ...prev, [slotIndex]: null, [targetSlot]: null }));
    if (suspended?.id) {
      closeSuspendedExternal(suspended.id);
    }
    setSuspendedWindows((prev) => prev.filter((item) => item.slot !== slotIndex));
  }

  function closeSuspendedExternal(windowId: string) {
    const popup = suspendedPopoutRefs.current[windowId];
    if (popup && !popup.closed) {
      popup.close();
    }
    suspendedPopoutRefs.current[windowId] = null;

    const checkTimer = suspendedPopoutCheckRefs.current[windowId];
    if (checkTimer) {
      clearInterval(checkTimer);
      suspendedPopoutCheckRefs.current[windowId] = null;
    }
  }

  function openSuspendedPopout(windowItem: SuspendedWindowState): boolean {
    if (typeof window === "undefined") {
      return false;
    }

    const existing = suspendedPopoutRefs.current[windowItem.id];
    if (existing && !existing.closed) {
      existing.focus();
      return true;
    }

    const width = 480;
    const height = 292;
    const left = Math.max(0, Math.floor((window.screen.availWidth - width) / 2));
    const top = Math.max(0, Math.floor((window.screen.availHeight - height) / 2));
    const popup = window.open(
      "",
      `livestation-suspended-${windowItem.id}`,
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no`
    );
    if (!popup) {
      return false;
    }

    const muted = slotMuted[windowItem.slot] ?? true;
    const volume = slotVolume[windowItem.slot] ?? 100;
    const autoplayMuted = muted || volume <= 0 ? 1 : 0;
    const src = `https://www.youtube.com/embed/${windowItem.videoId}?autoplay=1&mute=${autoplayMuted}&playsinline=1&rel=0`;
    const assetBase = window.location.origin;

    popup.document.open();
    popup.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>LiveStation - Tela suspensa</title>
  <style>
    html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden;font-family:Segoe UI,sans-serif}
    .bar{height:38px;display:flex;align-items:center;gap:6px;padding:0 8px;background:#0f1421;border-bottom:1px solid rgba(255,255,255,.12)}
    .bar strong{font-size:12px;color:#a6b2cc;margin-right:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .badge{height:20px;padding:0 8px 0 7px;border-radius:999px;font-size:11px;line-height:1;display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(239,68,68,.5);background:rgba(239,68,68,.16);color:#ffc1c1}
    .badge::before{content:"";width:6px;height:6px;border-radius:999px;background:#ef4444;box-shadow:0 0 7px rgba(239,68,68,.95)}
    .badge.active{border:1px solid rgba(34,197,94,.45);background:rgba(34,197,94,.16);color:#baf7cf}
    .badge.active::before{background:#22c55e;box-shadow:0 0 7px rgba(34,197,94,.95)}
    .iconBtn{width:28px;height:28px;display:inline-grid;place-items:center;padding:0;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);border-radius:8px;cursor:pointer}
    .iconBtn:hover{background:rgba(255,193,69,.2);border-color:rgba(255,193,69,.55)}
    .iconBtn img{width:14px;height:14px;filter:brightness(0) invert(1);opacity:.92}
    .iconBtn img.on{filter:brightness(0) saturate(100%) invert(62%) sepia(72%) saturate(470%) hue-rotate(88deg) brightness(98%) contrast(88%);opacity:1}
    .iconBtn img.muted{filter:brightness(0) saturate(100%) invert(42%) sepia(97%) saturate(1375%) hue-rotate(333deg) brightness(101%) contrast(98%);opacity:1}
    .stage{height:calc(100vh - 36px)}
    iframe{border:0;width:100%;height:100%;display:block}
  </style>
</head>
<body>
  <div class="bar">
    <strong>Slot ${windowItem.slot + 1}</strong>
    <button id="audioBadge" class="badge" title="Audio">Audio mutado</button>
    <button id="volDown" class="iconBtn" title="Volume -"><img src="${assetBase}/sound_min_light.svg" alt=""></button>
    <button id="muteBtn" class="iconBtn" title="Mutar/Desmutar"><img id="muteIcon" src="${assetBase}/sound_mute_light.svg" alt=""></button>
    <button id="volUp" class="iconBtn" title="Volume +"><img src="${assetBase}/sound_max_light.svg" alt=""></button>
    <button id="fullBtn" class="iconBtn" title="Tela cheia"><img src="${assetBase}/Full_Screen_Corner_Light.svg" alt=""></button>
    <button id="closeBtn" class="iconBtn" title="Voltar ao slot"><img src="${assetBase}/External.svg" alt=""></button>
  </div>
  <div class="stage">
    <iframe id="player" src="${src}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
  </div>
  <script>
    const frame = document.getElementById("player");
    const badge = document.getElementById("audioBadge");
    const muteIcon = document.getElementById("muteIcon");
    let muted = ${autoplayMuted === 1 ? "true" : "false"};
    let volume = ${Math.max(0, Math.min(100, volume))};
    function cmd(func, args = []) {
      if (!frame || !frame.contentWindow) return;
      frame.contentWindow.postMessage(JSON.stringify({ event: "command", func, args }), "*");
    }
    function refreshUi() {
      const isMuted = muted || volume <= 0;
      if (badge) {
        badge.classList.toggle("active", !isMuted);
        badge.textContent = isMuted ? "Audio mutado" : "Audio ativo";
      }
      if (muteIcon) {
        muteIcon.classList.toggle("muted", isMuted);
        muteIcon.classList.toggle("on", !isMuted);
        muteIcon.setAttribute("src", isMuted ? "${assetBase}/sound_mute_light.svg" : "${assetBase}/sound_max_light.svg");
      }
    }
    function sync() {
      cmd("setVolume", [volume]);
      cmd(muted ? "mute" : "unMute");
      refreshUi();
    }
    document.getElementById("muteBtn")?.addEventListener("click", () => {
      muted = !muted;
      sync();
    });
    document.getElementById("audioBadge")?.addEventListener("click", () => {
      muted = !muted;
      sync();
    });
    document.getElementById("volDown")?.addEventListener("click", () => {
      volume = Math.max(0, volume - 10);
      if (volume === 0) muted = true;
      sync();
    });
    document.getElementById("volUp")?.addEventListener("click", () => {
      volume = Math.min(100, volume + 10);
      if (volume > 0) muted = false;
      sync();
    });
    document.getElementById("fullBtn")?.addEventListener("click", () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    });
    document.getElementById("closeBtn")?.addEventListener("click", () => window.close());
    frame?.addEventListener("load", () => setTimeout(sync, 220));
    refreshUi();
  </script>
</body>
</html>`);
    popup.document.close();
    suspendedPopoutRefs.current[windowItem.id] = popup;

    if (suspendedPopoutCheckRefs.current[windowItem.id]) {
      clearInterval(suspendedPopoutCheckRefs.current[windowItem.id] as ReturnType<typeof setInterval>);
    }
    suspendedPopoutCheckRefs.current[windowItem.id] = setInterval(() => {
      const current = suspendedPopoutRefs.current[windowItem.id];
      if (current && !current.closed) {
        return;
      }
      const checkTimer = suspendedPopoutCheckRefs.current[windowItem.id];
      if (checkTimer) {
        clearInterval(checkTimer);
        suspendedPopoutCheckRefs.current[windowItem.id] = null;
      }
      suspendedPopoutRefs.current[windowItem.id] = null;
      setSuspendedWindows((prev) =>
        prev.map((item) => (item.id === windowItem.id && item.pinMode === "global" ? { ...item, pinMode: "free" } : item))
      );
    }, 800);

    return true;
  }

  function openChatAtSlot(slotIndex: number) {
    const area = screenAreaRef.current;
    const slotEl = slotRefs.current[slotIndex];
    const nextZ = zCounter + 1;
    setZCounter(nextZ);

    setChatWindows((prev) => {
      const existing = prev.find((item) => item.slot === slotIndex);
      if (existing) {
        return prev.map((item) => (item.id === existing.id ? { ...item, z: nextZ } : item));
      }

      if (!area || !slotEl) {
        return [...prev, { id: `slot-${slotIndex}`, slot: slotIndex, x: 12, y: 12, z: nextZ }];
      }

      const areaRect = area.getBoundingClientRect();
      const slotRect = slotEl.getBoundingClientRect();
      const desiredX = slotRect.left - areaRect.left + 12;
      const desiredY = slotRect.top - areaRect.top + 12;
      const clamped = clampWithinScreenArea(desiredX, desiredY, CHAT_WIDTH, CHAT_HEIGHT);
      return [...prev, { id: `slot-${slotIndex}`, slot: slotIndex, x: clamped.x, y: clamped.y, z: nextZ }];
    });
  }

  function startChatDrag(event: ReactMouseEvent, chatId: string) {
    const targetWindow = chatWindows.find((item) => item.id === chatId);
    if (!targetWindow) {
      return;
    }

    const nextZ = zCounter + 1;
    setZCounter(nextZ);
    setChatWindows((prev) => prev.map((item) => (item.id === chatId ? { ...item, z: nextZ } : item)));

    const area = screenAreaRef.current;
    const areaRect = area?.getBoundingClientRect();
    dragStateRef.current = {
      active: true,
      targetType: "chat",
      targetId: chatId,
      offsetX: event.clientX - (areaRect?.left ?? 0) - targetWindow.x,
      offsetY: event.clientY - (areaRect?.top ?? 0) - targetWindow.y
    };
  }

  function startSuspendedDrag(event: ReactMouseEvent, suspendedId: string) {
    const targetWindow = suspendedWindows.find((item) => item.id === suspendedId);
    if (!targetWindow) {
      return;
    }
    if (targetWindow.pinMode !== "free") {
      return;
    }

    const nextZ = zCounter + 1;
    setZCounter(nextZ);
    setSuspendedWindows((prev) => prev.map((item) => (item.id === suspendedId ? { ...item, z: nextZ } : item)));

    dragStateRef.current = {
      active: true,
      targetType: "suspended",
      targetId: suspendedId,
      offsetX: event.clientX - targetWindow.x,
      offsetY: event.clientY - targetWindow.y
    };
  }

  function toggleSuspendedFullscreen(windowId: string) {
    const target = suspendedWindowRefs.current[windowId];
    if (!target) {
      return;
    }
    if (document.fullscreenElement === target) {
      void document.exitFullscreen();
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen().then(() => {
        void target.requestFullscreen();
      });
      return;
    }
    void target.requestFullscreen();
  }

  function toggleSuspendedPin(windowId: string) {
    const target = suspendedWindows.find((item) => item.id === windowId);
    if (!target) {
      return;
    }

    if (target.pinMode === "free") {
      setSuspendedWindows((prev) => prev.map((item) => (item.id === windowId ? { ...item, pinMode: "locked" } : item)));
      return;
    }

    if (target.pinMode === "locked") {
      const opened = openSuspendedPopout(target);
      if (!opened) {
        setErrorBySlot((prev) => ({
          ...prev,
          [target.slot]: "Nao foi possivel abrir popup. Permita popup para usar pin global."
        }));
        return;
      }
      setSuspendedWindows((prev) => prev.map((item) => (item.id === windowId ? { ...item, pinMode: "global" } : item)));
      return;
    }

    closeSuspendedExternal(windowId);
    setSuspendedWindows((prev) => prev.map((item) => (item.id === windowId ? { ...item, pinMode: "free" } : item)));
  }

  useEffect(() => {
    const validIds = new Set(suspendedWindows.map((item) => item.id));
    for (const [id, popup] of Object.entries(suspendedPopoutRefs.current)) {
      if (validIds.has(id)) {
        continue;
      }
      if (popup && !popup.closed) {
        popup.close();
      }
      closeSuspendedExternal(id);
    }
  }, [suspendedWindows]);

  useEffect(() => {
    const popoutRefs = suspendedPopoutRefs.current;
    const popoutCheckRefs = suspendedPopoutCheckRefs.current;
    return () => {
      for (const popup of Object.values(popoutRefs)) {
        if (popup && !popup.closed) {
          popup.close();
        }
      }
      for (const checkTimer of Object.values(popoutCheckRefs)) {
        if (checkTimer) {
          clearInterval(checkTimer);
        }
      }
    };
  }, []);

  useEffect(() => {
    function onMouseMove(event: MouseEvent) {
      if (!dragStateRef.current.active || !dragStateRef.current.targetId || !dragStateRef.current.targetType) {
        return;
      }
      const area = screenAreaRef.current;
      const areaRect = area?.getBoundingClientRect();
      const nextX = event.clientX - (areaRect?.left ?? 0) - dragStateRef.current.offsetX;
      const nextY = event.clientY - (areaRect?.top ?? 0) - dragStateRef.current.offsetY;

      if (dragStateRef.current.targetType === "chat") {
        setChatWindows((prev) =>
          prev.map((item) => {
            if (item.id !== dragStateRef.current.targetId) {
              return item;
            }
            const next = clampWithinScreenArea(nextX, nextY, CHAT_WIDTH, CHAT_HEIGHT);
            return { ...item, x: next.x, y: next.y };
          })
        );
      }

      if (dragStateRef.current.targetType === "suspended") {
        setSuspendedWindows((prev) =>
          prev.map((item) => {
            if (item.id !== dragStateRef.current.targetId) {
              return item;
            }
            const next = clampWithinViewport(
              event.clientX - dragStateRef.current.offsetX,
              event.clientY - dragStateRef.current.offsetY,
              SUSPENDED_WIDTH,
              SUSPENDED_HEIGHT
            );
            return { ...item, x: next.x, y: next.y };
          })
        );
      }
    }

    function onMouseUp() {
      dragStateRef.current = { active: false, offsetX: 0, offsetY: 0, targetId: null, targetType: null };
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  async function persistProfile(next: { avatarDataUrl?: string | null }): Promise<boolean> {
    setProfileError(null);
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avatarDataUrl: next.avatarDataUrl === undefined ? profileAvatar : next.avatarDataUrl
        })
      });
      const data = (await response.json()) as {
        error?: string;
        avatarDataUrl?: string | null;
        watchSeconds?: number;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Erro ao salvar perfil.");
      }
      if (data.avatarDataUrl !== undefined) {
        setProfileAvatar(data.avatarDataUrl);
      }
      if (typeof data.watchSeconds === "number" && Number.isFinite(data.watchSeconds)) {
        const nextSeconds = Math.max(0, Math.floor(data.watchSeconds));
        setProfileWatchSeconds((prev) => Math.max(prev, nextSeconds));
      }
      setProfileError(null);
      return true;
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Erro inesperado.");
      return false;
    }
  }

  async function onAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setProfileError("Arquivo invalido. Envie uma imagem.");
      event.target.value = "";
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setProfileError("Imagem muito grande. Use ate 8MB.");
      event.target.value = "";
      return;
    }
    setProfileError(null);
    const previousAvatar = profileAvatar;

    try {
      const optimizedDataUrl = await fileToOptimizedAvatarDataUrl(file);
      setProfileAvatar(optimizedDataUrl);
      const saved = await persistProfile({ avatarDataUrl: optimizedDataUrl });
      if (!saved) {
        setProfileAvatar(previousAvatar);
      }
    } catch (error) {
      setProfileAvatar(previousAvatar);
      setProfileError(error instanceof Error ? error.message : "Erro ao processar imagem.");
    } finally {
      if (event.target) {
        event.target.value = "";
      }
    }
  }

  function openProfilePopover(event?: ReactMouseEvent<HTMLButtonElement>) {
    event?.stopPropagation();
    setProfileError(null);
    if (profileOpen) {
      setProfileOpen(false);
      setPasswordPopupOpen(false);
      return;
    }
    const trigger = profileTriggerRef.current;
    if (!trigger) {
      setProfileOpen(true);
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const isCompactViewport = window.matchMedia("(max-width: 960px)").matches;
    const width = isCompactViewport ? Math.min(380, window.innerWidth - 16) : 360;
    const margin = 12;
    const anchoredLeft = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
    const centeredLeft = Math.max(margin, Math.floor((window.innerWidth - width) / 2) - 8);
    const left = isCompactViewport ? centeredLeft : anchoredLeft;
    const top = Math.max(8, rect.bottom + 10);
    setProfilePopoverPos({ top, left });
    setProfileOpen(true);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function onChangePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setPasswordStatus(null);

    const current = passwordCurrent.trim();
    const next = passwordNext.trim();
    const confirm = passwordConfirm.trim();
    if (!current || !next || !confirm) {
      setPasswordStatus("Preencha os tres campos de senha.");
      return;
    }
    if (next !== confirm) {
      setPasswordStatus("A confirmacao da nova senha nao confere.");
      return;
    }

    setPasswordLoading(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setPasswordStatus(data.error ?? "Falha ao alterar senha.");
        return;
      }
      setPasswordCurrent("");
      setPasswordNext("");
      setPasswordConfirm("");
      setPasswordStatus("Senha alterada com sucesso.");
      setTimeout(() => {
        setPasswordPopupOpen(false);
      }, 600);
    } catch {
      setPasswordStatus("Falha ao alterar senha.");
    } finally {
      setPasswordLoading(false);
    }
  }

  async function sendSiteMessage(event: FormEvent) {
    event.preventDefault();
    const text = siteMessageText.trim();
    if (!text) {
      return;
    }

    setSiteChatSending(true);
    try {
      const response = await fetch("/api/site/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (!response.ok) {
        return;
      }
      setSiteMessageText("");
      const messagesResponse = await fetch("/api/site/chat");
      if (messagesResponse.ok) {
        const data = (await messagesResponse.json()) as { messages: SiteMessage[] };
        setSiteMessages(data.messages);
      }
    } finally {
      setSiteChatSending(false);
    }
  }

  async function loadUpdates() {
    setUpdatesLoading(true);
    setUpdatesError(null);
    try {
      const response = await fetch("/api/site/updates");
      const data = (await response.json()) as { versions?: ChangelogEntry[]; error?: string };
      if (!response.ok) {
        setUpdatesError(data.error ?? "Falha ao carregar atualizacoes.");
        return;
      }
      setUpdatesList(data.versions ?? []);
    } catch {
      setUpdatesError("Falha ao carregar atualizacoes.");
    } finally {
      setUpdatesLoading(false);
    }
  }

  async function loadBugReports() {
    setBugLoading(true);
    setBugError(null);
    try {
      const response = await fetch("/api/site/bugs");
      const data = (await response.json()) as {
        reports?: BugReportItem[];
        isAdmin?: boolean;
        error?: string;
      };
      if (!response.ok) {
        setBugError(data.error ?? "Falha ao carregar relatos.");
        return;
      }
      setBugReports(data.reports ?? []);
      setBugIsAdmin(Boolean(data.isAdmin));
    } catch {
      setBugError("Falha ao carregar relatos.");
    } finally {
      setBugLoading(false);
    }
  }

  async function onBugImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setBugImageLoading(true);
    setBugError(null);
    try {
      const dataUrl = await fileToOptimizedAvatarDataUrl(file);
      setBugImageDataUrl(dataUrl);
    } catch {
      setBugError("Falha ao processar imagem do bug.");
    } finally {
      setBugImageLoading(false);
      event.target.value = "";
    }
  }

  async function onEditBugImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setBugImageLoading(true);
    setBugError(null);
    try {
      const dataUrl = await fileToOptimizedAvatarDataUrl(file);
      setEditingBugImageDataUrl(dataUrl);
    } catch {
      setBugError("Falha ao processar imagem do bug.");
    } finally {
      setBugImageLoading(false);
      event.target.value = "";
    }
  }

  async function submitBugReport(event: FormEvent) {
    event.preventDefault();
    const text = bugText.trim();
    if (!text) {
      setBugError("Descreva o problema.");
      return;
    }
    setBugSubmitting(true);
    setBugError(null);
    try {
      const response = await fetch("/api/site/bugs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bugType,
          text,
          imageDataUrl: bugImageDataUrl
        })
      });
      const data = (await response.json()) as { report?: BugReportItem; error?: string };
      if (!response.ok || !data.report) {
        setBugError(data.error ?? "Falha ao publicar relato.");
        return;
      }
      setBugReports((prev) => [data.report as BugReportItem, ...prev]);
      setBugText("");
      setBugImageDataUrl(null);
      setBugType("ui");
    } catch {
      setBugError("Falha ao publicar relato.");
    } finally {
      setBugSubmitting(false);
    }
  }

  function startEditBug(report: BugReportItem) {
    setEditingBugId(report.id);
    setEditingBugText(report.text);
    setEditingBugType(report.bugType);
    setEditingBugImageDataUrl(report.imageDataUrl);
    setReplyingBugId(null);
  }

  async function saveEditBug(reportId: string) {
    const text = editingBugText.trim();
    if (!text) {
      setBugError("Descricao do bug nao pode ficar vazia.");
      return;
    }
    setBugSubmitting(true);
    setBugError(null);
    try {
      const response = await fetch(`/api/site/bugs/${encodeURIComponent(reportId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bugType: editingBugType,
          text,
          imageDataUrl: editingBugImageDataUrl
        })
      });
      const data = (await response.json()) as { report?: BugReportItem; error?: string };
      if (!response.ok || !data.report) {
        setBugError(data.error ?? "Falha ao atualizar relato.");
        return;
      }
      setBugReports((prev) => prev.map((item) => (item.id === reportId ? data.report! : item)));
      setEditingBugId(null);
      setEditingBugText("");
      setEditingBugImageDataUrl(null);
      setEditingBugType("ui");
    } catch {
      setBugError("Falha ao atualizar relato.");
    } finally {
      setBugSubmitting(false);
    }
  }

  async function deleteBug(reportId: string) {
    setBugSubmitting(true);
    setBugError(null);
    try {
      const response = await fetch(`/api/site/bugs/${encodeURIComponent(reportId)}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setBugError(data.error ?? "Falha ao apagar relato.");
        return;
      }
      setBugReports((prev) => prev.filter((item) => item.id !== reportId));
      if (editingBugId === reportId) {
        setEditingBugId(null);
      }
      if (replyingBugId === reportId) {
        setReplyingBugId(null);
      }
    } catch {
      setBugError("Falha ao apagar relato.");
    } finally {
      setBugSubmitting(false);
    }
  }

  async function saveAdminReply(reportId: string) {
    setBugSubmitting(true);
    setBugError(null);
    try {
      const response = await fetch(`/api/site/bugs/${encodeURIComponent(reportId)}/reply`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: replyText.trim() || null })
      });
      const data = (await response.json()) as { report?: BugReportItem; error?: string };
      if (!response.ok || !data.report) {
        setBugError(data.error ?? "Falha ao responder relato.");
        return;
      }
      setBugReports((prev) => prev.map((item) => (item.id === reportId ? data.report! : item)));
      setReplyingBugId(null);
      setReplyText("");
    } catch {
      setBugError("Falha ao responder relato.");
    } finally {
      setBugSubmitting(false);
    }
  }

  return (
    <main className="watchPage">
      <header className="watchHeader">
        <div className="headerBrand">
          <h1>LiveStation</h1>
          <span className="headerBadge headerBadgeInline">RIZZER</span>
        </div>
        <div className="headerCenterSearch">
          <form className="headerSearchForm" onSubmit={submitSearch}>
            <div className="headerSearchInputWrap">
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar videos e canais do YouTube"
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="headerSearchClear"
                  onClick={clearSearch}
                  aria-label="Limpar busca"
                  title="Limpar busca"
                >
                  ×
                </button>
              ) : null}
            </div>
            <button type="submit" disabled={searchLoading}>
              {searchLoading ? "..." : "Buscar"}
            </button>
          </form>
        </div>
        <div className="headerActions">
          <button
            type="button"
            className={`headerProfileButton ${profileOpen ? "active" : ""}`}
            onClick={(event) => openProfilePopover(event)}
            ref={profileTriggerRef}
          >
            <span className="headerAvatar headerAvatarLarge">
              {profileAvatar ? (
                <Image src={profileAvatar} alt="Foto do usuario" fill sizes="56px" className="headerAvatarImg" />
              ) : (
                <span className="headerAvatarFallback">{initials}</span>
              )}
            </span>
            <span className="headerProfileText">
              <span className="headerUserName">{profileName}</span>
              <span className="headerUserSub">Perfil</span>
            </span>
          </button>
        </div>
      </header>

      <section className="watchBody">
        <aside className="sidebar">
          <div className="layoutPickerDesktop">
            <h2>Layouts</h2>
            <ul>
              {LAYOUTS.map((preset) => (
                <li key={preset.id}>
                  <button
                    type="button"
                    className={layoutId === preset.id ? "active" : ""}
                    onClick={() => onLayoutSelect(preset)}
                  >
                    <strong>{preset.label}</strong>
                    <span>
                      {preset.columns} colunas | {preset.maxSlots} telas
                    </span>
                    <LayoutPreview columns={preset.columns} maxSlots={preset.maxSlots} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <button type="button" className="mobileLayoutOpenButton" onClick={() => setLayoutsMenuOpen(true)}>
            Layouts
          </button>
          {autoLayoutInfo ? <p className="statusHint">{autoLayoutInfo}</p> : null}

          {isMobileViewport ? (
            <div className="mobileTopActions">
              <button type="button" className="mobileStatsButton" onClick={() => setMobileStatsOpen(true)}>
                Estatisticas
              </button>
              <button type="button" className="openSiteChatButton" onClick={() => setSiteChatOpen((prev) => !prev)}>
                {siteChatOpen ? "Fechar chat" : "Chat LiveStation"}
              </button>
            </div>
          ) : (
            <div className="siteToolsCard">
              <div className="siteToolsDivider" />
              <div className="siteStatsBox">
                <h3>Estatisticas do site</h3>
                <p>
                  <span>Usuarios cadastrados</span>
                  <strong>{siteStats.totalUsers}</strong>
                </p>
                <p>
                  <span>Usuarios online</span>
                  <strong>{siteStats.onlineUsers}</strong>
                </p>
                <p>
                  <span>Usuarios offline</span>
                  <strong>{siteStats.offlineUsers}</strong>
                </p>
                <p>
                  <span>Videos em reproducao</span>
                  <strong>{siteStats.totalActiveVideos}</strong>
                </p>
                <p>
                  <span>Perfis com foto</span>
                  <strong>{siteStats.profilesWithAvatar}</strong>
                </p>
                <p>
                  <span>Tempo total assistido</span>
                  <strong>{formatWatchDuration(siteStats.totalWatchSeconds)}</strong>
                </p>
                <p>
                  <span>Top espectador</span>
                  <strong>{siteStats.topWatcherName}</strong>
                </p>
              </div>
              <button type="button" className="openSiteChatButton" onClick={() => setSiteChatOpen((prev) => !prev)}>
                {siteChatOpen ? "Fechar o chat" : "Chat LiveStation"}
              </button>
            </div>
          )}
        </aside>

        <div className="screenArea" ref={screenAreaRef}>
          {layout ? (
            <div
              className="videoGrid"
              style={{
                gridTemplateColumns: expandedSlot === null ? `repeat(${effectiveColumns}, minmax(0, 1fr))` : "1fr",
                gridTemplateRows:
                  expandedSlot === null
                    ? useAutoRowsOnMobile
                      ? `repeat(${rowCount}, minmax(220px, auto))`
                      : `repeat(${rowCount}, minmax(0, 1fr))`
                    : "1fr"
              }}
            >
              {renderedSlots.map((videoId, index) => {
                if (expandedSlot !== null && expandedSlot !== index) {
                  return null;
                }
                const suspendedForSlot = suspendedWindows.find((item) => item.slot === index);
                const muted = slotMuted[index] ?? true;
                const volume = slotVolume[index] ?? 100;
                const hidden = slotHidden[index] ?? false;
                const audioActive = Boolean(videoId) && !muted && volume > 0;
                const audioMuted = Boolean(videoId) && (muted || volume <= 0);
                const audioEffectEnabled = slotAudioEffectEnabled[index] ?? true;

                return (
                  <article
                    key={`slot-${index}`}
                    className={`videoSlot ${selectedSlot === index ? "selected" : ""} ${
                      audioActive && audioEffectEnabled ? "audioActiveSlot" : ""
                    } ${audioMuted && audioEffectEnabled ? "audioMutedSlot" : ""} ${
                      hidden ? "blurActiveSlot" : ""
                    }`}
                    onClick={() => toggleSlotSelection(index)}
                    ref={(element) => {
                      slotRefs.current[index] = element;
                    }}
                  >
                    <div className="slotHeader">
                      <button
                        className="moveSlotInlineButton"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (movingSlot !== null && movingSlot !== index) {
                            swapSlots(movingSlot, index);
                            return;
                          }
                          setMovingSlot((current) => (current === index ? null : index));
                        }}
                        aria-label={movingSlot === index ? "Cancelar mover slot" : "Mover slot"}
                        title={movingSlot === index ? "Clique no destino para trocar" : "Mover slot"}
                      >
                        <span className={`moveIconGlyph ${movingSlot === index ? "isActive" : ""}`} aria-hidden="true">
                          ⋮⋮
                        </span>
                      </button>
                      <span>Slot {index + 1}</span>
                      {videoId ? (
                        <div className="slotActions slotActionsTight">
                          {audioActive || audioMuted ? (
                            <button
                              type="button"
                              className={`audioActiveBadge ${audioMuted ? "muted" : "active"}`}
                              aria-label={audioMuted ? "Audio mutado" : "Audio ativo"}
                              title={
                                audioEffectEnabled
                                  ? "Clique para desativar o efeito visual"
                                  : "Clique para ativar o efeito visual"
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleSlotAudioEffect(index);
                              }}
                            >
                              {audioMuted ? "Audio mutado" : "Audio ativo"}
                            </button>
                          ) : null}
                          <button
                            className={`slotIconButton ${hidden ? "isActiveBlue" : ""}`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleSlotHidden(index);
                            }}
                            aria-label={hidden ? "Mostrar video" : "Ocultar video"}
                            title={hidden ? "Mostrar video" : "Ocultar video"}
                          >
                            <Image
                              src={hidden ? "/View_light.svg" : "/View_hide_light.svg"}
                              alt=""
                              width={ICON_SIZE}
                              height={ICON_SIZE}
                              aria-hidden="true"
                            />
                          </button>
                          <button
                            className="slotIconButton"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setVolumePanelSlot((current) => (current === index ? null : index));
                            }}
                            aria-label="Controle de volume"
                            title="Controle de volume"
                          >
                            <Image
                              src={
                                muted
                                  ? "/sound_mute_light.svg"
                                  : volume <= 40
                                    ? "/sound_min_light.svg"
                                    : "/sound_max_light.svg"
                              }
                              alt=""
                              width={ICON_SIZE}
                              height={ICON_SIZE}
                              className={`slotAudioIcon ${muted ? "isMuted" : "isOn"}`}
                              aria-hidden="true"
                            />
                          </button>
                          <button
                            className="slotIconButton"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpandedSlot((current) => (current === index ? null : index));
                            }}
                            aria-label={expandedSlot === index ? "Voltar tamanho" : "Expandir slot"}
                            title={expandedSlot === index ? "Voltar tamanho" : "Expandir slot"}
                          >
                            <Image
                              src={expandedSlot === index ? "/Reduce_light.svg" : "/Full_Screen_Corner_Light.svg"}
                              alt=""
                              width={ICON_SIZE}
                              height={ICON_SIZE}
                              aria-hidden="true"
                            />
                          </button>
                          <button
                            className="slotIconButton"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              suspendSlotVideo(index);
                            }}
                            aria-label="Tela suspensa"
                            title="Tela suspensa"
                          >
                            <Image
                              src="/External.svg"
                              alt=""
                              width={ICON_SIZE}
                              height={ICON_SIZE}
                              aria-hidden="true"
                            />
                          </button>
                          <button
                            className="slotIconButton"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openChatAtSlot(index);
                            }}
                            aria-label="Abrir chat"
                            title="Abrir chat"
                          >
                            <Image
                              src="/chat_light.svg"
                              alt=""
                              width={ICON_SIZE}
                              height={ICON_SIZE}
                              aria-hidden="true"
                            />
                          </button>
                          <button
                            className="slotIconButton"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeVideo(index);
                            }}
                            aria-label="Remover video"
                            title="Remover video"
                          >
                            <Image
                              src="/Close_round_light.svg"
                              alt=""
                              width={ICON_SIZE}
                              height={ICON_SIZE}
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {videoId ? (
                      <div className="slotVideoWrap">
                        <iframe
                          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(
                            embedOrigin
                          )}`}
                          title={`YouTube ${videoId}`}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          referrerPolicy="strict-origin-when-cross-origin"
                          allowFullScreen
                          className={hidden ? "slotIframeHidden" : ""}
                          ref={(element) => {
                            iframeRefs.current[index] = element;
                          }}
                          onLoad={() => onPlayerReady(index)}
                        />
                        {hidden ? (
                          <div className="slotOverlayMessage">
                            <p>Video oculto</p>
                          </div>
                        ) : null}
                        {volumePanelSlot === index ? (
                          <div
                            className="slotVolumePanel"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button type="button" onClick={() => toggleSlotMute(index)}>
                              {muted ? "Ativar som" : "Mutar"}
                            </button>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={volume}
                              onChange={(event) => setSlotVolumeLevel(index, Number(event.target.value))}
                            />
                            <span>{volume}%</span>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="emptyState">
                        {suspendedForSlot ? (
                          <>
                            <p>Video em tela suspensa</p>
                            <button
                              type="button"
                              className="restoreSuspendedButton"
                              onClick={(event) => {
                                event.stopPropagation();
                                restoreSuspendedVideo(index);
                              }}
                            >
                              Retornar para este slot
                            </button>
                          </>
                        ) : (
                          <p>Slot vazio</p>
                        )}
                      </div>
                    )}

                    {selectedSlot === index ? (
                      <form className="slotForm" onSubmit={(event) => applyLinkToSlot(event, index)}>
                        <input
                          type="text"
                          value={slotInputs[index] ?? ""}
                          onChange={(event) =>
                            setSlotInputs((prev) => {
                              const next = [...prev];
                              next[index] = event.target.value;
                              return next;
                            })
                          }
                          placeholder="Cole o link ou ID neste card"
                          onClick={(event) => event.stopPropagation()}
                        />
                        <button type="submit" onClick={(event) => event.stopPropagation()}>
                          {videoId ? "Trocar" : "Adicionar"}
                        </button>
                      </form>
                    ) : (
                      <div className="slotHint">Clique para editar este slot</div>
                    )}
                    {errorBySlot[index] ? <p className="statusError">{errorBySlot[index]}</p> : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <>
              {showSearchPanel ? (
                <div className="searchCenterPanel">
                  <div className="searchCenterHeader">
                    <h2>Resultados da busca</h2>
                    <div>
                      <span>Fonte: {searchSource === "api" ? "YouTube" : "mock"}</span>
                      <button type="button" onClick={clearSearch}>
                        Fechar busca
                      </button>
                    </div>
                  </div>
                  {searchError ? <p className="statusError">{searchError}</p> : null}
                  <div className="searchCenterSections">
                    <section>
                      <h3>Canais</h3>
                      {searchChannels.length > 0 ? (
                        <ul className="searchCardGrid channelGrid">
                          {searchChannels.map((channel) => (
                            <li key={channel.id} className="searchMediaCard channelCard">
                              <div className="searchThumbWrap channelThumbWrap">
                                {channel.thumbnail ? (
                                  <Image
                                    src={channel.thumbnail}
                                    alt={channel.title}
                                    width={66}
                                    height={66}
                                    className="searchThumb channelThumb"
                                    unoptimized
                                  />
                                ) : (
                                  <div className="searchThumbFallback">{channel.title.slice(0, 2).toUpperCase()}</div>
                                )}
                              </div>
                              <div className="searchCardBody">
                                <strong>{channel.title}</strong>
                                <p>{channel.description || "Canal no YouTube."}</p>
                                <a href={`https://www.youtube.com/channel/${channel.id}`} target="_blank" rel="noreferrer">
                                  Abrir canal
                                </a>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="statusHint">Nenhum canal encontrado.</p>
                      )}
                    </section>
                    <section>
                      <h3>Vídeos</h3>
                      {searchVideos.length > 0 ? (
                        <ul className="searchCardGrid videoGridCards">
                          {searchVideos.map((video) => (
                            <li key={video.id} className="searchMediaCard videoCard">
                              <div className="searchThumbWrap">
                                {video.thumbnail ? (
                                  <Image
                                    src={video.thumbnail}
                                    alt={video.title}
                                    fill
                                    sizes="248px"
                                    className="searchThumb"
                                    unoptimized
                                  />
                                ) : (
                                  <div className="searchThumbFallback">YT</div>
                                )}
                              </div>
                              <div className="searchCardBody">
                                <strong>{video.title}</strong>
                                <span>{video.channelTitle}</span>
                                <button type="button" onClick={() => addSearchVideo(video.id)}>
                                  Adicionar no slot
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="statusHint">Nenhum vídeo encontrado.</p>
                      )}
                    </section>
                  </div>
                </div>
              ) : (
                <div className="welcomeScreen">
                  <h2>Bem-vindo ao LiveStation</h2>
                  <span className="welcomeLogoWrap" aria-hidden="true">
                    <Image src={logoSrc} alt="" className="welcomeLogo" fill sizes="220px" />
                  </span>
                </div>
              )}
            </>
          )}

          {!showSearchPanel
            ? chatWindows
            .filter((chat) => Boolean(slots[chat.slot]))
            .map((chat) => (
              <div
                key={chat.id}
                className="chatFloat"
                role="dialog"
                aria-modal="false"
                aria-label={`Chat da posicao ${chat.slot + 1}`}
                style={{
                  left: `${chat.x}px`,
                  top: `${chat.y}px`,
                  width: `${CHAT_WIDTH}px`,
                  height: `${CHAT_HEIGHT}px`,
                  zIndex: 20 + chat.z
                }}
              >
                <header className="chatFloatHeader" onMouseDown={(event) => startChatDrag(event, chat.id)}>
                  <h3>Slot {chat.slot + 1} - Chat ao vivo</h3>
                  <button
                    type="button"
                    onClick={() => setChatWindows((prev) => prev.filter((item) => item.id !== chat.id))}
                  >
                    Fechar
                  </button>
                </header>
                <iframe
                  src={`https://www.youtube.com/live_chat?v=${slots[chat.slot]}&embed_domain=${embedDomain}`}
                  title={`Chat da posicao ${chat.slot + 1}`}
                  className="chatFloatFrame"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            ))
            : null}

          {suspendedWindows
            .filter((windowItem) => windowItem.pinMode !== "global")
            .filter((windowItem) => !showSearchPanel || windowItem.pinMode !== "free")
            .map((windowItem) => (
            <div
              key={windowItem.id}
              className={`chatFloat suspendedFloat ${
                windowItem.pinMode === "locked" ? "isPinned" : windowItem.pinMode === "global" ? "isGlobalPinned" : ""
              }`}
              role="dialog"
              aria-modal="false"
              aria-label={`Tela suspensa da posicao ${windowItem.slot + 1}`}
              style={{
                left: `${windowItem.x}px`,
                top: `${windowItem.y}px`,
                width: `${SUSPENDED_WIDTH}px`,
                height: `${SUSPENDED_HEIGHT}px`,
                zIndex: (windowItem.pinMode !== "free" ? 200 : 20) + windowItem.z
              }}
              ref={(element) => {
                suspendedWindowRefs.current[windowItem.id] = element;
              }}
            >
              <header className="chatFloatHeader suspendedFloatHeader">
                <div
                  className="suspendedDragHandle"
                  onMouseDown={(event) => startSuspendedDrag(event, windowItem.id)}
                  title="Arrastar"
                >
                  <span>Slot {windowItem.slot + 1} - Tela suspensa</span>
                </div>
                <div className="slotActions slotActionsTight suspendedActions">
                  {windowItem.videoId ? (
                    <button
                      type="button"
                      className={`audioActiveBadge ${(slotMuted[windowItem.slot] ?? true) || (slotVolume[windowItem.slot] ?? 100) <= 0 ? "muted" : "active"}`}
                      aria-label={
                        (slotMuted[windowItem.slot] ?? true) || (slotVolume[windowItem.slot] ?? 100) <= 0
                          ? "Audio mutado"
                          : "Audio ativo"
                      }
                      title={
                        slotAudioEffectEnabled[windowItem.slot] ?? true
                          ? "Clique para desativar o efeito visual"
                          : "Clique para ativar o efeito visual"
                      }
                      onClick={() => toggleSlotAudioEffect(windowItem.slot)}
                    >
                      {(slotMuted[windowItem.slot] ?? true) || (slotVolume[windowItem.slot] ?? 100) <= 0
                        ? "Audio mutado"
                        : "Audio ativo"}
                    </button>
                  ) : null}
                  <button
                    className="slotIconButton"
                    type="button"
                    onClick={() =>
                      setSuspendedVolumePanelId((current) => (current === windowItem.id ? null : windowItem.id))
                    }
                    aria-label="Controle de volume"
                    title="Controle de volume"
                  >
                    <Image
                      src={
                        slotMuted[windowItem.slot] ?? true
                          ? "/sound_mute_light.svg"
                          : (slotVolume[windowItem.slot] ?? 100) <= 40
                            ? "/sound_min_light.svg"
                            : "/sound_max_light.svg"
                      }
                      alt=""
                      width={ICON_SIZE}
                      height={ICON_SIZE}
                      className={`slotAudioIcon ${(slotMuted[windowItem.slot] ?? true) ? "isMuted" : "isOn"}`}
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    className={`slotIconButton ${
                      windowItem.pinMode === "locked"
                        ? "isActiveBlue"
                        : windowItem.pinMode === "global"
                          ? "isActivePurple"
                          : ""
                    }`}
                    type="button"
                    onClick={() => {
                      void toggleSuspendedPin(windowItem.id);
                    }}
                    aria-label={
                      windowItem.pinMode === "free"
                        ? "Fixar no site"
                        : windowItem.pinMode === "locked"
                          ? "Fixar global e continuar entre abas"
                          : "Voltar ao modo solto"
                    }
                    title={
                      windowItem.pinMode === "free"
                        ? "Pin azul: fixa no site"
                        : windowItem.pinMode === "locked"
                          ? "Pin roxo: fixa global entre abas"
                          : "Terceiro clique: modo solto"
                    }
                  >
                    <Image src="/pin_light.svg" alt="" width={ICON_SIZE} height={ICON_SIZE} aria-hidden="true" />
                  </button>
                  <button
                    className="slotIconButton"
                    type="button"
                    onClick={() => toggleSuspendedFullscreen(windowItem.id)}
                    aria-label="Expandir tela suspensa"
                    title="Expandir tela suspensa"
                  >
                    <Image
                      src="/Full_Screen_Corner_Light.svg"
                      alt=""
                      width={ICON_SIZE}
                      height={ICON_SIZE}
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    className="slotIconButton"
                    type="button"
                    onClick={() => openChatAtSlot(windowItem.slot)}
                    aria-label="Abrir chat"
                    title="Abrir chat"
                  >
                    <Image src="/chat_light.svg" alt="" width={ICON_SIZE} height={ICON_SIZE} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="restoreSuspendedButton suspendedReturnButton"
                    onClick={() => restoreSuspendedVideo(windowItem.slot)}
                    aria-label="Voltar ao slot"
                    title="Voltar ao slot"
                  >
                    <Image src="/External.svg" alt="" width={ICON_SIZE} height={ICON_SIZE} aria-hidden="true" />
                  </button>
                </div>
              </header>
              {suspendedVolumePanelId === windowItem.id ? (
                <div className="slotVolumePanel suspendedVolumePanel">
                  <button type="button" onClick={() => toggleSlotMute(windowItem.slot)}>
                    {slotMuted[windowItem.slot] ?? true ? "Ativar audio" : "Mutar audio"}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={slotVolume[windowItem.slot] ?? 100}
                    onChange={(event) => setSlotVolumeLevel(windowItem.slot, Number(event.target.value))}
                  />
                  <span>Volume: {slotVolume[windowItem.slot] ?? 100}%</span>
                </div>
              ) : null}
              <iframe
                src={`https://www.youtube.com/embed/${windowItem.videoId}?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(
                  embedOrigin
                )}`}
                title={`Tela suspensa ${windowItem.videoId}`}
                className="chatFloatFrame suspendedFloatFrame"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                ref={(element) => {
                  suspendedIframeRefs.current[windowItem.id] = element;
                }}
                onLoad={() => onSuspendedPlayerReady(windowItem)}
              />
            </div>
          ))}
        </div>
      </section>

      <footer className="watchFooter">
        <div className="footerLeft">
          <span className="footerLogoWrap" aria-hidden="true">
            <Image src={logoSrc} alt="" className="footerLogo" fill sizes="72px" />
          </span>
        </div>
        <div className="footerCenter">
          <small className="footerText">LiveStation | Rizzer - Rizzer™ 2026 {APP_VERSION}</small>
        </div>
        <div className="footerRight">
          <a href="https://www.instagram.com/rizzerstudio" target="_blank" rel="noreferrer">
            Instagram
          </a>
          <a href="https://github.com/Rizzer-Studio" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="https://www.linkedin.com/company/rizzer-studio/" target="_blank" rel="noreferrer">
            LinkedIn
          </a>
          <a href="https://www.rizzer.com.br/" target="_blank" rel="noreferrer">
            Site
          </a>
        </div>
      </footer>

      {profileOpen ? (
        <div
          className="profilePopoverLayer"
          onClick={() => {
            setProfileError(null);
            setProfileOpen(false);
            setPasswordPopupOpen(false);
          }}
        >
          <div
            className="profilePopover"
            style={{ top: `${profilePopoverPos.top}px`, left: `${profilePopoverPos.left}px` }}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="profileHeader">
              <h3>Perfil do usuario</h3>
              <button
                type="button"
                onClick={() => {
                  setProfileError(null);
                  setProfileOpen(false);
                }}
              >
                Fechar
              </button>
            </header>
            <section className="profileTop">
              <div className="profileTopAvatar">
                <div className="profileTopAvatarMedia">
                  {profileAvatar ? (
                    <Image src={profileAvatar} alt="Avatar do perfil" fill sizes="84px" className="headerAvatarImg" />
                  ) : (
                    <span className="headerAvatarFallback">{initials}</span>
                  )}
                  <button
                    type="button"
                    className="profileAvatarEditTrigger"
                    onClick={() => profileFileInputRef.current?.click()}
                  >
                    {avatarCenterLabel}
                  </button>
                </div>
                <button
                  type="button"
                  className="profileAvatarRemove"
                  aria-label="Remover foto"
                  onMouseEnter={() => setAvatarCenterLabel("Excluir")}
                  onMouseLeave={() => setAvatarCenterLabel("Editar")}
                  onFocus={() => setAvatarCenterLabel("Excluir")}
                  onBlur={() => setAvatarCenterLabel("Editar")}
                  onClick={() => {
                    setProfileAvatar(null);
                    setAvatarCenterLabel("Editar");
                    void persistProfile({ avatarDataUrl: null });
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-1 6h2v9H8V9Zm6 0h2v9h-2V9Zm-3 0h2v9h-2V9Z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              </div>
              <div className="profileTopInfo">
                <div className="profileTopNameRow">
                  <strong>{profileName}</strong>
                  <span className="headerOnlineBadge">
                    <span className="statusDot" aria-hidden="true" />
                    Online
                  </span>
                </div>
                <span>{email}</span>
                <div className="profileMiniStat">
                  <span>Tempo assistindo</span>
                  <strong>{formatWatchDuration(profileWatchSeconds)}</strong>
                </div>
              </div>
            </section>
            <div className="profileForm">
              <input
                ref={profileFileInputRef}
                type="file"
                accept="image/*"
                onChange={onAvatarFileChange}
                className="profileFileInput"
              />
              {profileError ? <p className="statusError">{profileError}</p> : null}
              <button
                type="button"
                className="profileHelpButton"
                onClick={() => {
                  setPasswordStatus(null);
                  setPasswordPopupOpen(true);
                }}
              >
                Alterar senha
              </button>
              <button
                type="button"
                className="profileHelpButton"
                onClick={() => {
                  setProfileOpen(false);
                  setUpdatesOpen(true);
                  void loadUpdates();
                }}
              >
                Atualizacoes
              </button>
              <button
                type="button"
                className="profileHelpButton"
                onClick={() => {
                  setProfileOpen(false);
                  setBugPopupOpen(true);
                  setEditingBugId(null);
                  setReplyingBugId(null);
                  setBugError(null);
                  void loadBugReports();
                }}
              >
                Relatar bug
              </button>
              <button type="button" className="profileHelpButton" onClick={() => setHelpOpen(true)}>
                Ajuda
              </button>
              <button type="button" className="logoutButton profileLogoutButton" onClick={logout}>
                Sair
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {passwordPopupOpen ? (
        <div
          className="profilePopoverLayer layoutConfirmLayer"
          onClick={() => {
            setPasswordPopupOpen(false);
            setPasswordStatus(null);
          }}
        >
          <div className="layoutConfirmModal passwordModal" onClick={(event) => event.stopPropagation()}>
            <header className="layoutConfirmHeader">
              <h3>Alterar senha</h3>
              <button
                type="button"
                onClick={() => {
                  setPasswordPopupOpen(false);
                  setPasswordStatus(null);
                }}
              >
                Fechar
              </button>
            </header>
            <div className="layoutConfirmBody">
              <form className="profilePasswordForm" onSubmit={onChangePasswordSubmit}>
                <label>
                  Senha atual
                  <input
                    type="password"
                    value={passwordCurrent}
                    onChange={(event) => setPasswordCurrent(event.target.value)}
                    placeholder="Digite a senha atual"
                    autoComplete="current-password"
                  />
                </label>
                <label>
                  Nova senha
                  <input
                    type="password"
                    value={passwordNext}
                    onChange={(event) => setPasswordNext(event.target.value)}
                    placeholder="8+ caracteres com letras e numeros"
                    autoComplete="new-password"
                  />
                </label>
                <label>
                  Confirmar nova senha
                  <input
                    type="password"
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                    placeholder="Repita a nova senha"
                    autoComplete="new-password"
                  />
                </label>
                <button type="submit" disabled={passwordLoading}>
                  {passwordLoading ? "Salvando..." : "Alterar senha"}
                </button>
                {passwordStatus ? (
                  <p className={passwordStatus.includes("sucesso") ? "statusOk" : "statusError"}>{passwordStatus}</p>
                ) : null}
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {updatesOpen ? (
        <div className="profilePopoverLayer layoutConfirmLayer" onClick={() => setUpdatesOpen(false)}>
          <div className="helpGuideModal updatesModal" onClick={(event) => event.stopPropagation()}>
            <header className="helpGuideHeader">
              <h3>Atualizacoes do LiveStation</h3>
              <button type="button" onClick={() => setUpdatesOpen(false)}>
                Fechar
              </button>
            </header>
            <div className="helpGuideBody bugModalBody">
              {updatesLoading ? <p className="statusHint">Carregando atualizacoes...</p> : null}
              {updatesError ? <p className="statusError">{updatesError}</p> : null}
              {!updatesLoading && !updatesError && updatesList.length === 0 ? (
                <p className="statusHint">Sem atualizacoes registradas.</p>
              ) : null}
              {updatesList.map((entry) => (
                <section key={entry.version} className="updateSection">
                  <h4>{entry.version}</h4>
                  <p className="updateDate">{entry.date}</p>
                  <div className="updateColumns">
                    <div>
                      <strong>Melhorias</strong>
                      <ul>
                        {entry.improvements.map((item) => (
                          <li key={`${entry.version}-improvement-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <strong>Correções</strong>
                      <ul>
                        {entry.fixes.map((item) => (
                          <li key={`${entry.version}-fix-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {bugPopupOpen ? (
        <div className="profilePopoverLayer layoutConfirmLayer" onClick={() => setBugPopupOpen(false)}>
          <div className="helpGuideModal bugModal" onClick={(event) => event.stopPropagation()}>
            <header className="helpGuideHeader">
              <h3>Relatar bug</h3>
              <button type="button" onClick={() => setBugPopupOpen(false)}>
                Fechar
              </button>
            </header>
            <div className="helpGuideBody">
              <section className="bugComposer">
                <h4>Novo relato</h4>
                <form onSubmit={submitBugReport} className="bugForm">
                  <label>
                    Tipo de bug
                    <select value={bugType} onChange={(event) => setBugType(event.target.value as BugType)}>
                      {BUG_TYPES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Descricao
                    <textarea
                      value={bugText}
                      onChange={(event) => setBugText(event.target.value)}
                      placeholder="Explique o que aconteceu, onde ocorreu e como reproduzir."
                      maxLength={2000}
                    />
                  </label>
                  <div className="bugImageRow">
                    <label className="bugImageInput">
                      <input type="file" accept="image/*" onChange={onBugImageChange} />
                      {bugImageLoading ? "Processando imagem..." : "Adicionar imagem"}
                    </label>
                    {bugImageDataUrl ? (
                      <button type="button" onClick={() => setBugImageDataUrl(null)}>
                        Remover imagem
                      </button>
                    ) : null}
                  </div>
                  {bugImageDataUrl ? (
                    <div className="bugPreviewFrame">
                      <Image
                        src={bugImageDataUrl}
                        alt="Preview do bug"
                        fill
                        sizes="(max-width: 960px) 90vw, 360px"
                        className="bugPreviewImage"
                        unoptimized
                      />
                    </div>
                  ) : null}
                  <button type="submit" disabled={bugSubmitting}>
                    {bugSubmitting ? "Publicando..." : "Publicar relato"}
                  </button>
                </form>
                {bugError ? <p className="statusError">{bugError}</p> : null}
              </section>

              <section className="bugListSection">
                <h4>Relatos publicados</h4>
                {bugLoading ? <p className="statusHint">Carregando relatos...</p> : null}
                {!bugLoading && bugReports.length === 0 ? <p className="statusHint">Nenhum bug publicado ainda.</p> : null}
                <div className="bugList">
                  {bugReports.map((report) => {
                    const isOwner = report.userEmail.toLowerCase() === email.toLowerCase();
                    const isEditing = editingBugId === report.id;
                    const isReplying = replyingBugId === report.id;
                    return (
                      <article key={report.id} className="bugItem">
                        <header className="bugItemHeader">
                          <div>
                            <strong>{report.userName}</strong>
                            <span>{formatBugTypeLabel(report.bugType)}</span>
                          </div>
                          <div className="bugItemHeaderRight">
                            <time>{formatMessageDateTime(report.createdAt)}</time>
                            {!isEditing ? (
                              <div className="bugHeaderActions">
                                {(isOwner || bugIsAdmin) ? (
                                  <button
                                    type="button"
                                    className="bugIconAction"
                                    data-label="Editar"
                                    onClick={() => startEditBug(report)}
                                  >
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                      <path
                                        fill="currentColor"
                                        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm2.92 2.33H5v-.92l8.06-8.06.92.92L5.92 19.58ZM20.71 7.04a1 1 0 0 0 0-1.41L18.37 3.3a1 1 0 0 0-1.41 0L15.13 5.13l3.75 3.75 1.83-1.84Z"
                                      />
                                    </svg>
                                  </button>
                                ) : null}
                                {(isOwner || bugIsAdmin) ? (
                                  <button
                                    type="button"
                                    className="bugIconAction danger"
                                    data-label="Excluir"
                                    onClick={() => void deleteBug(report.id)}
                                    disabled={bugSubmitting}
                                  >
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                      <path
                                        fill="currentColor"
                                        d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-1 6h2v9H8V9Zm6 0h2v9h-2V9Zm-3 0h2v9h-2V9Z"
                                      />
                                    </svg>
                                  </button>
                                ) : null}
                                {bugIsAdmin && !isReplying ? (
                                  <button
                                    type="button"
                                    className="bugIconAction"
                                    data-label={report.adminReply ? "Editar resposta" : "Responder"}
                                    onClick={() => {
                                      setReplyingBugId(report.id);
                                      setReplyText(report.adminReply ?? "");
                                    }}
                                  >
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                      <path
                                        fill="currentColor"
                                        d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v9h2v1.17L7.17 15H20V6H4Z"
                                      />
                                    </svg>
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </header>

                        {isEditing ? (
                          <div className="bugEditBox">
                            <label>
                              Tipo
                              <select
                                value={editingBugType}
                                onChange={(event) => setEditingBugType(event.target.value as BugType)}
                              >
                                {BUG_TYPES.map((item) => (
                                  <option key={`${report.id}-${item.value}`} value={item.value}>
                                    {item.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Texto
                              <textarea
                                value={editingBugText}
                                onChange={(event) => setEditingBugText(event.target.value)}
                                maxLength={2000}
                              />
                            </label>
                            <div className="bugImageRow">
                              <label className="bugImageInput">
                                <input type="file" accept="image/*" onChange={onEditBugImageChange} />
                                Alterar imagem
                              </label>
                              {editingBugImageDataUrl ? (
                                <button type="button" onClick={() => setEditingBugImageDataUrl(null)}>
                                  Remover imagem
                                </button>
                              ) : null}
                            </div>
                            {editingBugImageDataUrl ? (
                              <div className="bugPreviewFrame">
                                <Image
                                  src={editingBugImageDataUrl}
                                  alt="Preview da edicao"
                                  fill
                                  sizes="(max-width: 960px) 90vw, 360px"
                                  className="bugPreviewImage"
                                  unoptimized
                                />
                              </div>
                            ) : null}
                            <div className="bugActions">
                              <button type="button" onClick={() => saveEditBug(report.id)} disabled={bugSubmitting}>
                                Salvar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingBugId(null);
                                  setEditingBugText("");
                                  setEditingBugImageDataUrl(null);
                                }}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p>{report.text}</p>
                            {report.imageDataUrl ? (
                              <div className="bugPreviewFrame">
                                <Image
                                  src={report.imageDataUrl}
                                  alt="Imagem do bug"
                                  fill
                                  sizes="(max-width: 960px) 90vw, 360px"
                                  className="bugPreviewImage"
                                  unoptimized
                                />
                              </div>
                            ) : null}
                          </>
                        )}

                        {report.adminReply ? (
                          <div className="bugAdminReply">
                            <strong>Resposta do admin</strong>
                            <p>{report.adminReply}</p>
                          </div>
                        ) : null}

                        {isReplying ? (
                          <div className="bugReplyBox">
                            <textarea
                              value={replyText}
                              onChange={(event) => setReplyText(event.target.value)}
                              placeholder="Digite a resposta do admin..."
                              maxLength={1500}
                            />
                            <div className="bugActions">
                              <button type="button" onClick={() => saveAdminReply(report.id)} disabled={bugSubmitting}>
                                Responder
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setReplyingBugId(null);
                                  setReplyText("");
                                }}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : null}

                        
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {siteChatOpen ? (
        <div className="siteChatPanel">
          <header>
            <h3>Chat LiveStation</h3>
            <button type="button" onClick={() => setSiteChatOpen(false)}>
              Fechar
            </button>
          </header>
          <div className="siteChatMessages">
            {siteMessages.length === 0 ? <p className="siteChatEmpty">Sem mensagens ainda.</p> : null}
            {siteMessages.map((message) => {
              const isMine = message.userEmail.toLowerCase() === email.toLowerCase();
              return (
                <article key={message.id} className={`siteChatMessageRow ${isMine ? "mine" : "other"}`}>
                  <div className={`siteChatMessage ${isMine ? "mine" : "other"}`}>
                    <div className="siteChatMessageMeta">
                      <span className="siteChatMessageName">{message.userName}</span>
                    </div>
                    <p>{message.text}</p>
                    <span className="siteChatMessageTime">{formatMessageDateTime(message.createdAt)}</span>
                  </div>
                  <span className="siteChatMessageViews">
                    {Math.max(1, siteStats.onlineUsers)} visualizacoes
                  </span>
                </article>
              );
            })}
          </div>
          <form className="siteChatForm" onSubmit={sendSiteMessage}>
            <input
              type="text"
              value={siteMessageText}
              onChange={(event) => setSiteMessageText(event.target.value)}
              placeholder="Escreva para os usuarios..."
              maxLength={500}
            />
            <button type="submit" disabled={siteChatSending}>
              {siteChatSending ? "..." : "Enviar"}
            </button>
          </form>
        </div>
      ) : null}

      {pendingLayout ? (
        <div className="profilePopoverLayer layoutConfirmLayer" onClick={cancelLayoutChange}>
          <div className="layoutConfirmModal" onClick={(event) => event.stopPropagation()}>
            <header className="layoutConfirmHeader">
              <h3>Troca de layout</h3>
              <button type="button" onClick={cancelLayoutChange}>
                Fechar
              </button>
            </header>
            <div className="layoutConfirmBody">
              <p>
                Para usar <strong>{pendingLayout.label}</strong>, escolha os slots que deseja fechar.
              </p>
              <p className="layoutConfirmHint">
                Selecione{" "}
                <strong>{Math.max(0, slots.filter(Boolean).length - pendingLayout.maxSlots)}</strong> slot(s) para
                continuar.
              </p>
              <div className="layoutConfirmList">
                {slots.map((videoId, index) => {
                  if (!videoId) {
                    return null;
                  }
                  const checked = slotsToClose.includes(index);
                  return (
                    <button
                      key={`close-slot-${index}`}
                      type="button"
                      className={`layoutCloseSlotButton ${checked ? "selected" : ""}`}
                      onClick={() => toggleCloseSlot(index)}
                    >
                      Slot {index + 1}
                    </button>
                  );
                })}
              </div>
            </div>
            <footer className="layoutConfirmFooter">
              <button type="button" onClick={cancelLayoutChange}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmLayoutWithClosures}
                disabled={slotsToClose.length !== Math.max(0, slots.filter(Boolean).length - pendingLayout.maxSlots)}
              >
                Aplicar layout
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {layoutsMenuOpen ? (
        <div className="profilePopoverLayer layoutConfirmLayer" onClick={() => setLayoutsMenuOpen(false)}>
          <div className="layoutMenuModal" onClick={(event) => event.stopPropagation()}>
            <header className="layoutMenuHeader">
              <h3>Escolha um layout</h3>
              <button type="button" onClick={() => setLayoutsMenuOpen(false)}>
                Fechar
              </button>
            </header>
            <div className="layoutMenuBody">
              <ul>
                {LAYOUTS.map((preset) => (
                  <li key={`mobile-${preset.id}`}>
                    <button
                      type="button"
                      className={layoutId === preset.id ? "active" : ""}
                      onClick={() => onLayoutSelect(preset)}
                    >
                      <strong>{preset.label}</strong>
                      <span>
                        {preset.columns} colunas | {preset.maxSlots} telas
                      </span>
                      <LayoutPreview columns={preset.columns} maxSlots={preset.maxSlots} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {mobileStatsOpen ? (
        <div className="profilePopoverLayer layoutConfirmLayer" onClick={() => setMobileStatsOpen(false)}>
          <div className="layoutMenuModal" onClick={(event) => event.stopPropagation()}>
            <header className="layoutMenuHeader">
              <h3>Estatisticas do site</h3>
              <button type="button" onClick={() => setMobileStatsOpen(false)}>
                Fechar
              </button>
            </header>
            <div className="layoutMenuBody">
              <div className="siteStatsBox">
                <p>
                  <span>Usuarios cadastrados</span>
                  <strong>{siteStats.totalUsers}</strong>
                </p>
                <p>
                  <span>Usuarios online</span>
                  <strong>{siteStats.onlineUsers}</strong>
                </p>
                <p>
                  <span>Usuarios offline</span>
                  <strong>{siteStats.offlineUsers}</strong>
                </p>
                <p>
                  <span>Videos em reproducao</span>
                  <strong>{siteStats.totalActiveVideos}</strong>
                </p>
                <p>
                  <span>Perfis com foto</span>
                  <strong>{siteStats.profilesWithAvatar}</strong>
                </p>
                <p>
                  <span>Tempo total assistido</span>
                  <strong>{formatWatchDuration(siteStats.totalWatchSeconds)}</strong>
                </p>
                <p>
                  <span>Top espectador</span>
                  <strong>{siteStats.topWatcherName}</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {helpOpen ? (
        <div className="profilePopoverLayer layoutConfirmLayer" onClick={() => setHelpOpen(false)}>
          <div className="helpGuideModal" onClick={(event) => event.stopPropagation()}>
            <header className="helpGuideHeader">
              <h3>Ajuda do LiveStation</h3>
              <button type="button" onClick={() => setHelpOpen(false)}>
                Fechar
              </button>
            </header>
            <div className="helpGuideBody">
              <section>
                <h4>1. Comecando</h4>
                <ul>
                  <li>Ao entrar, a tela abre em modo de boas-vindas.</li>
                  <li>Escolha um layout na barra lateral para abrir os slots.</li>
                  <li>Clicar duas vezes no mesmo layout volta para a tela de boas-vindas.</li>
                </ul>
              </section>
              <section>
                <h4>2. Adicionar videos</h4>
                <ul>
                  <li>Clique no slot desejado e cole o link/ID do YouTube.</li>
                  <li>Ao clicar em Adicionar, o video entra com play automatico.</li>
                  <li>Se um video sair, os slots se reorganizam automaticamente sem perder os outros videos.</li>
                </ul>
              </section>
              <section>
                <h4>3. Controles do slot</h4>
                <ul>
                  <li>Olho: aplica/remover blur do video.</li>
                  <li>Som: controle de volume e mute.</li>
                  <li>Expandir: destaca o slot na tela.</li>
                  <li>Tela suspensa: solta o video em janela livre com botao para retornar.</li>
                  <li>Chat: abre chat flutuante do YouTube para o slot.</li>
                  <li>Close: remove o video do slot.</li>
                </ul>
              </section>
              <section>
                <h4>4. Audio e destaque visual</h4>
                <ul>
                  <li>Badge Audio ativo (verde) e Audio mutado (vermelho).</li>
                  <li>O contorno do slot muda conforme o estado de audio.</li>
                  <li>Clique no badge para ligar/desligar o efeito visual do audio.</li>
                </ul>
              </section>
              <section>
                <h4>5. Troca de layout inteligente</h4>
                <ul>
                  <li>Se reduzir layout e nao couberem videos, abre popup para escolher quais slots fechar.</li>
                  <li>Quando a quantidade de videos cai, o sistema pode reduzir para layout menor automaticamente.</li>
                  <li>O ajuste automatico tem atraso para evitar mudanca acidental durante troca de link.</li>
                </ul>
              </section>
              <section>
                <h4>6. Chat do site e perfil</h4>
                <ul>
                  <li>Use o botao Chat LiveStation para conversar com outros usuarios.</li>
                  <li>No perfil, voce pode trocar/remover a foto.</li>
                  <li>O username exibido no chat segue o cadastro do usuario.</li>
                </ul>
              </section>
            </div>
            <footer className="helpGuideFooter">
              <button type="button" onClick={() => setHelpOpen(false)}>
                Entendi
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {layoutMobileNotice ? <div className="layoutMobileNotice">{layoutMobileNotice}</div> : null}
    </main>
  );
}

function LayoutPreview({ columns, maxSlots }: { columns: number; maxSlots: number }) {
  return (
    <div className="layoutPreview" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {Array.from({ length: maxSlots }).map((_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

