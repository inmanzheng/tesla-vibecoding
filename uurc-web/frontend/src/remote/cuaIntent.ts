import type { RemoteShortcut } from "./remoteShortcuts.js";

export type CuaIntent =
  | { kind: "launch"; name: string; bundleId?: string }
  | { kind: "activate"; name: string; bundleId?: string }
  | { kind: "shortcut"; id: RemoteShortcut }
  | { kind: "type"; text: string }
  | { kind: "unknown"; text: string };

export interface CuaKnownApp {
  name: string;
  bundleId: string;
  aliases: string[];
}

export const CUA_KNOWN_APPS: CuaKnownApp[] = [
  { name: "微信", bundleId: "com.tencent.xinWeChat", aliases: ["微信", "wechat", "weixin"] },
  { name: "Safari", bundleId: "com.apple.Safari", aliases: ["safari"] },
  { name: "Google Chrome", bundleId: "com.google.Chrome", aliases: ["chrome", "谷歌", "谷歌浏览器"] },
  { name: "Finder", bundleId: "com.apple.finder", aliases: ["finder", "访达"] },
  { name: "Cursor", bundleId: "com.todesktop.230313mzl4w4u92", aliases: ["cursor"] },
  { name: "Terminal", bundleId: "com.apple.Terminal", aliases: ["终端", "terminal", "iterm"] },
];

const SHORTCUT_PHRASES: Array<{ id: RemoteShortcut; phrases: string[] }> = [
  { id: "enter", phrases: ["回车", "发送", "确认", "enter"] },
  { id: "escape", phrases: ["取消", "esc", "escape"] },
  { id: "mac-cmd-c", phrases: ["复制", "拷贝"] },
  { id: "mac-cmd-v", phrases: ["粘贴"] },
  { id: "mac-cmd-w", phrases: ["关掉前台窗口", "关闭前台窗口", "关掉窗口", "关闭窗口", "关窗"] },
];

export function mapCuaIntent(raw: string): CuaIntent {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return { kind: "unknown", text };

  const typed = matchTypedText(text);
  if (typed) return typed;

  const shortcut = matchShortcut(text);
  if (shortcut) return shortcut;

  const app = matchAppCommand(text);
  if (app) return app;

  return { kind: "unknown", text };
}

export function describeCuaIntent(intent: CuaIntent): string {
  if (intent.kind === "launch") return `打开「${intent.name}」`;
  if (intent.kind === "activate") return `切换到「${intent.name}」`;
  if (intent.kind === "shortcut") return `发送快捷键：${shortcutLabel(intent.id)}`;
  if (intent.kind === "type") return `输入文字：${intent.text}`;
  return "还不认识这句，可先用手势或 /pair";
}

function matchTypedText(text: string): CuaIntent | null {
  const matched = text.match(/^(?:输入|打字|键入)[:：\s]+(.+)$/i);
  const body = matched?.[1]?.trim();
  return body ? { kind: "type", text: body } : null;
}

function matchShortcut(text: string): CuaIntent | null {
  const normalized = compact(text);
  for (const item of SHORTCUT_PHRASES) {
    if (item.phrases.some((phrase) => normalized === compact(phrase) || normalized.includes(compact(phrase)))) {
      return { kind: "shortcut", id: item.id };
    }
  }
  return null;
}

function matchAppCommand(text: string): CuaIntent | null {
  const normalized = compact(text);
  const activate = /切换|切到|激活|回到/.test(text);
  const launch = /打开|开启|启动|开一下/.test(text) || activate;
  if (!launch) return null;
  const app = CUA_KNOWN_APPS.find((item) => item.aliases.some((alias) => normalized.includes(compact(alias))));
  if (!app) return null;
  return activate
    ? { kind: "activate", name: app.name, bundleId: app.bundleId }
    : { kind: "launch", name: app.name, bundleId: app.bundleId };
}

function shortcutLabel(id: RemoteShortcut): string {
  if (id === "enter") return "回车";
  if (id === "escape") return "取消";
  if (id === "mac-cmd-c") return "复制";
  if (id === "mac-cmd-v") return "粘贴";
  if (id === "mac-cmd-w") return "关闭窗口";
  return id;
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[\s，。！？、]+/g, "");
}
