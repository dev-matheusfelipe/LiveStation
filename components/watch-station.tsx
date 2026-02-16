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
};

type SiteMessage = {
  id: string;
  userEmail: string;
  userName: string;
  avatarDataUrl: string | null;
  text: string;
  createdAt: string;
};

function formatMessageDateTime(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
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
  const [chatWindows, setChatWindows] = useState<ChatWindowState[]>([]);
  const [zCounter, setZCounter] = useState(1);
  const [embedDomain, setEmbedDomain] = useState("localhost");
  const [embedOrigin, setEmbedOrigin] = useState("http://localhost");
  const [slotMuted, setSlotMuted] = useState<Record<number, boolean>>({});
  const [slotVolume, setSlotVolume] = useState<Record<number, number>>({});
  const [slotHidden, setSlotHidden] = useState<Record<number, boolean>>({});
  const [slotAudioEffectEnabled, setSlotAudioEffectEnabled] = useState<Record<number, boolean>>({});
  const [volumePanelSlot, setVolumePanelSlot] = useState<number | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);
  const [suspendedWindows, setSuspendedWindows] = useState<SuspendedWindowState[]>([]);

  const [profileOpen, setProfileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [profileName, setProfileName] = useState(initialName);
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [avatarCenterLabel, setAvatarCenterLabel] = useState("Editar");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profilePopoverPos, setProfilePopoverPos] = useState({ top: 72, left: 16 });
  const [siteStats, setSiteStats] = useState<SiteStats>({
    totalUsers: 0,
    onlineUsers: 0,
    offlineUsers: 0,
    totalActiveVideos: 0,
    profilesWithAvatar: 0
  });
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
  const previousActiveVideosRef = useRef(0);
  const autoLayoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const effectiveColumns = layout
    ? isMobileViewport && layout.id === "duo"
      ? 1
      : layout.columns
    : 0;
  const rowCount = layout ? Math.ceil(layout.maxSlots / effectiveColumns) : 0;
  const useAutoRowsOnMobile = isMobileViewport && effectiveColumns === 1;
  const logoSrc = isLightMode ? "/rizzer-logo-dark.png" : "/rizzer-logo-light.png";
  const initials = (profileName || initialName).slice(0, 2).toUpperCase();

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setIsLightMode(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 960px)");
    const onChange = () => setIsMobileViewport(mobile.matches);
    onChange();
    mobile.addEventListener("change", onChange);
    return () => mobile.removeEventListener("change", onChange);
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
        };
        setProfileName(data.username || data.displayName || initialName);
        setProfileAvatar(data.avatarDataUrl ?? null);
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
        const data = (await response.json()) as SiteStats;
        setSiteStats(data);
      } catch {
        // ignore polling errors
      }
    }

    pullStats();
    const timer = setInterval(pullStats, 10_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function sendPresence() {
      try {
        const activeVideos = slots.filter(Boolean).length;
        await fetch("/api/site/presence", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activeVideos })
        });
      } catch {
        // ignore presence errors
      }
    }

    sendPresence();
    const timer = setInterval(sendPresence, 15_000);
    return () => clearInterval(timer);
  }, [slots]);

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

  function onPlayerReady(slotIndex: number) {
    syncPlayerState(slotIndex);
    sendPlayerCommand(slotIndex, "playVideo");
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

  function applyLinkToSlot(event: FormEvent, slotIndex: number) {
    event.preventDefault();
    const id = extractYouTubeVideoId(slotInputs[slotIndex] ?? "");
    if (!id) {
      setErrorBySlot((prev) => ({ ...prev, [slotIndex]: "Link invalido." }));
      return;
    }
    setErrorBySlot((prev) => ({ ...prev, [slotIndex]: null }));
    setSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = id;
      return next;
    });
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
      const nextSlots = Array.from({ length: nextLayout.maxSlots }, (_, index) => compactedVideos[index] ?? null);

      if (layoutId === nextLayout.id) {
        setLayoutId(null);
        setSlots([]);
        setSlotInputs([]);
        setSelectedSlot(null);
        setErrorBySlot({});
        setChatWindows([]);
        setSuspendedWindows([]);
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
      setSlotInputs(Array.from({ length: nextLayout.maxSlots }, () => ""));
      setErrorBySlot({});
      setSuspendedWindows([]);
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
        return Math.min(current, nextLayout.maxSlots - 1);
      });
      setChatWindows([]);
      setPendingLayout(null);
      setSlotsToClose([]);
    },
    [layoutId]
  );

  useEffect(() => {
    const activeVideos = slots.filter(Boolean).length;
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
  }, [slots, layoutId, applyLayoutChange]);

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

  function toggleSlotSelection(index: number) {
    setSelectedSlot((current) => (current === index ? null : index));
  }

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

    const targetSlot = slots[slotIndex] ? slots.findIndex((videoId) => !videoId) : slotIndex;
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
    setSuspendedWindows((prev) => prev.filter((item) => item.slot !== slotIndex));
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
      const data = (await response.json()) as { error?: string; avatarDataUrl?: string | null };
      if (!response.ok) {
        throw new Error(data.error ?? "Erro ao salvar perfil.");
      }
      if (data.avatarDataUrl !== undefined) {
        setProfileAvatar(data.avatarDataUrl);
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

  function openProfilePopover() {
    setProfileError(null);
    const trigger = profileTriggerRef.current;
    if (!trigger) {
      setProfileOpen(true);
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const width = 360;
    const margin = 12;
    const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
    const top = rect.bottom + 10;
    setProfilePopoverPos({ top, left });
    setProfileOpen(true);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
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

  return (
    <main className="watchPage">
      <header className="watchHeader">
        <div className="headerBrand">
          <h1>LiveStation</h1>
          <span className="headerBadge headerBadgeInline">RIZZER</span>
        </div>
        <div className="headerActions">
          <button type="button" className="headerProfileButton" onClick={openProfilePopover} ref={profileTriggerRef}>
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
              {slots.map((videoId, index) => {
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
                          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(
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
            <div className="welcomeScreen">
              <h2>Bem-vindo ao LiveStation</h2>
              <span className="welcomeLogoWrap" aria-hidden="true">
                <Image src={logoSrc} alt="" className="welcomeLogo" fill sizes="220px" />
              </span>
            </div>
          )}

          {chatWindows
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
            ))}

          {suspendedWindows.map((windowItem) => (
            <div
              key={windowItem.id}
              className="chatFloat suspendedFloat"
              role="dialog"
              aria-modal="false"
              aria-label={`Tela suspensa da posicao ${windowItem.slot + 1}`}
              style={{
                left: `${windowItem.x}px`,
                top: `${windowItem.y}px`,
                width: `${SUSPENDED_WIDTH}px`,
                height: `${SUSPENDED_HEIGHT}px`,
                zIndex: 20 + windowItem.z
              }}
            >
              <header className="chatFloatHeader" onMouseDown={(event) => startSuspendedDrag(event, windowItem.id)}>
                <h3>Slot {windowItem.slot + 1} - Tela suspensa</h3>
                <button type="button" onClick={() => restoreSuspendedVideo(windowItem.slot)}>
                  Retornar
                </button>
              </header>
              <iframe
                src={`https://www.youtube.com/embed/${windowItem.videoId}?autoplay=0&mute=1&rel=0`}
                title={`Tela suspensa ${windowItem.videoId}`}
                className="chatFloatFrame suspendedFloatFrame"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          ))}
        </div>
      </section>

      <footer className="watchFooter">
        <span className="footerLogoWrap" aria-hidden="true">
          <Image src={logoSrc} alt="" className="footerLogo" fill sizes="58px" />
        </span>
        <small className="footerText">LiveStation</small>
        <small className="footerMeta">v1.0.0</small>
        <small className="footerMeta">(c) 2026 Rizzer</small>
      </footer>

      {profileOpen ? (
        <div
          className="profilePopoverLayer"
          onClick={() => {
            setProfileError(null);
            setProfileOpen(false);
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
