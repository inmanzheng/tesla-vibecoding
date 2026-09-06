import type { CuaIntent } from "./cuaIntent.js";
import type { RemoteShortcut } from "./remoteShortcuts.js";

export type InputBridgeEvent =
  | { type: "text"; text: string }
  | { type: "move"; dx: number; dy: number }
  | { type: "click"; button: "primary" | "secondary" }
  | { type: "scroll"; deltaX: number; deltaY: number }
  | { type: "shortcut"; id: RemoteShortcut }
  | { type: "activate"; name?: string; bundleId?: string; pid?: number }
  | { type: "launch"; name?: string; bundleId?: string }
  | { type: "cua"; text: string; intent: CuaIntent };

export interface PhoneShortcutItem {
  id: RemoteShortcut;
  label: string;
}

export interface PhoneShortcutGroup {
  id: string;
  title: string;
  items: PhoneShortcutItem[];
}

export const PHONE_SHORTCUT_GROUPS: PhoneShortcutGroup[] = [
  {
    id: "system",
    title: "桌面",
    items: [
      { id: "mac-prev-desktop", label: "上一桌面" },
      { id: "mac-next-desktop", label: "下一桌面" },
      { id: "mac-mission-control", label: "调度中心" },
      { id: "mac-show-desktop", label: "显示桌面" },
      { id: "mac-spotlight", label: "聚焦搜索" },
      { id: "mac-launchpad", label: "启动台" },
      { id: "mac-lock-screen", label: "锁屏" },
    ],
  },
  {
    id: "window",
    title: "窗口",
    items: [
      { id: "mac-cmd-tab", label: "切应用" },
      { id: "mac-minimize", label: "最小化" },
      { id: "mac-fullscreen-toggle", label: "全屏" },
    ],
  },
  {
    id: "edit",
    title: "剪贴板",
    items: [
      { id: "enter", label: "发送" },
      { id: "escape", label: "取消" },
      { id: "mac-cmd-c", label: "复制" },
      { id: "mac-cmd-v", label: "粘贴" },
      { id: "mac-cmd-z", label: "撤销" },
    ],
  },
];

export const PHONE_SHORTCUTS: PhoneShortcutItem[] = PHONE_SHORTCUT_GROUPS.flatMap((group) => group.items);

export function isAgentBridgeEvent(
  event: InputBridgeEvent,
): event is Extract<InputBridgeEvent, { type: "activate" | "launch" | "cua" }> {
  return event.type === "activate" || event.type === "launch" || event.type === "cua";
}

export interface TrackpadCursor {
  x: number;
  y: number;
}

export const TRACKPAD_GAIN = 2.2;
export const TRACKPAD_SCROLL_GAIN = 1.2;

export function applyTrackpadMove(
  cursor: TrackpadCursor,
  dx: number,
  dy: number,
  surface: { width: number; height: number },
  gain = TRACKPAD_GAIN,
): TrackpadCursor {
  const width = Math.max(1, surface.width);
  const height = Math.max(1, surface.height);
  return {
    x: clamp(cursor.x + dx * gain, 0, width),
    y: clamp(cursor.y + dy * gain, 0, height),
  };
}

export function createCenteredCursor(surface: { width: number; height: number }): TrackpadCursor {
  return { x: surface.width / 2, y: surface.height / 2 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
