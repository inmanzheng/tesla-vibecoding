import { useCallback, useEffect, useState } from "react";

import { CUA_KNOWN_APPS } from "../remote/cuaIntent.js";
import {
  ACTIVE_BRIDGE_ID,
  peekInputBridge,
  pushInputBridgeEvents,
  pushInputBridgeText,
  type CuaAppInfo,
} from "../remote/inputBridgeClient.js";
import { PHONE_SHORTCUT_GROUPS, type InputBridgeEvent } from "../remote/inputBridgeEvents.js";
import { PhoneTrackpad } from "./PhoneTrackpad.js";

type PairMode = "keyboard" | "trackpad" | "apps" | "macros";

export function PhonePairLandingPage() {
  return <PhoneInputBridgePage />;
}

export function PhoneInputBridgePage() {
  const [mode, setMode] = useState<PairMode>("keyboard");
  const [text, setText] = useState("");
  const [status, setStatus] = useState("正在等待车机进入控制…");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [apps, setApps] = useState<CuaAppInfo[]>([]);
  const [frontmost, setFrontmost] = useState("");
  const [agentOnline, setAgentOnline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const connect = async () => {
      while (!cancelled) {
        try {
          const peek = await peekInputBridge(ACTIVE_BRIDGE_ID);
          if (cancelled) return;
          setReady(true);
          setApps(peek.apps);
          setFrontmost(peek.frontmost);
          setAgentOnline(peek.agentOnline);
          setStatus("已自动配对。可以打字、听写或用触控板。");
          return;
        } catch {
          if (cancelled) return;
          setReady(false);
          setApps([]);
          setFrontmost("");
          setAgentOnline(false);
          setStatus("等待车机进入控制…");
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    };
    void connect();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const peek = await peekInputBridge(ACTIVE_BRIDGE_ID);
        if (cancelled) return;
        setApps(peek.apps);
        setFrontmost(peek.frontmost);
        setAgentOnline(peek.agentOnline);
      } catch {
        if (cancelled) return;
        setReady(false);
        setStatus("等待车机重新进入控制…");
      }
    };
    const timer = window.setInterval(() => {
      void tick();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [ready]);

  async function send(): Promise<void> {
    const payload = text.trim();
    if (!payload || busy || !ready) return;
    setBusy(true);
    try {
      await pushInputBridgeText(ACTIVE_BRIDGE_ID, payload);
      setText("");
      setStatus("已发送到车机，继续说或再打一句即可。");
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "发送失败");
    } finally {
      setBusy(false);
    }
  }

  const sendPadEvents = useCallback((events: InputBridgeEvent[]) => {
    if (!ready || events.length === 0) return;
    void pushInputBridgeEvents(ACTIVE_BRIDGE_ID, events).catch((caught: unknown) => {
      setStatus(caught instanceof Error ? caught.message : "触控发送失败");
    });
  }, [ready]);

  function sendApp(event: Extract<InputBridgeEvent, { type: "activate" | "launch" }>): void {
    sendPadEvents([event]);
    setStatus(event.type === "activate" ? `正在切换到 ${event.name ?? "应用"}` : `正在打开 ${event.name ?? "应用"}`);
  }

  const runningApps = apps.filter((app) => app.running);
  const connectionLabel = ready ? "已连接" : "等待车机";
  const frontLabel = frontmost || (agentOnline ? "Mac 助手在线" : "等待 Mac 助手");

  return (
    <main className="pair-shell" aria-label="手机输入">
      <header className="pair-topbar">
        <div>
          <h1>发给远端 Mac</h1>
          <p className="pair-code">已自动配对</p>
        </div>
        <div className={`pair-link ${ready ? "is-online" : "is-wait"}`} aria-live="polite">
          <span className="pair-dot" />
          <strong>{connectionLabel}</strong>
          <small>{frontLabel}</small>
        </div>
      </header>
      <p className="pair-status-line">{status}</p>
      <section className="pair-body">
        {mode === "keyboard" ? (
          <>
            <textarea
              className="pair-composer"
              value={text}
              disabled={!ready}
              autoFocus
              enterKeyHint="send"
              lang="zh-CN"
              placeholder="点这里弹出系统键盘。听写请用键盘上的麦克风。"
              onChange={(event) => setText(event.target.value)}
            />
            <div className="pair-keyboard-actions">
              <button
                className="pair-send"
                type="button"
                disabled={!ready || busy || !text.trim()}
                onClick={() => void send()}
              >
                {busy ? "发送中…" : "发送到远端"}
              </button>
              <button
                className="pair-cancel"
                type="button"
                disabled={!ready}
                onClick={() => sendPadEvents([{ type: "shortcut", id: "escape" }])}
              >
                取消
              </button>
            </div>
            <p className="pair-hint">本页不申请麦克风。语音请用 iOS 键盘自带的听写。</p>
          </>
        ) : null}
        {mode === "trackpad" ? (
          <>
            <PhoneTrackpad disabled={!ready} onEvents={sendPadEvents} />
            <p className="pair-hint">车机需保持「控制中」。先在画面上点一下，再滑动手机。</p>
          </>
        ) : null}
        {mode === "apps" ? (
          <PhoneAppPanel
            ready={ready}
            agentOnline={agentOnline}
            runningApps={runningApps}
            onActivate={(app) => sendApp({ type: "activate", name: app.name, bundleId: app.bundleId, pid: app.pid })}
            onLaunch={(app) => sendApp({ type: "launch", name: app.name, bundleId: app.bundleId })}
          />
        ) : null}
        {mode === "macros" ? (
          <div className="pair-macro-stack" aria-label="快捷面板">
            {PHONE_SHORTCUT_GROUPS.map((group) => (
              <section key={group.id} className="pair-macro-group">
                <h2>{group.title}</h2>
                <div className="pair-shortcuts">
                  {group.items.map((shortcut) => (
                    <button
                      key={shortcut.id}
                      type="button"
                      disabled={!ready}
                      onClick={() => sendPadEvents([{ type: "shortcut", id: shortcut.id }])}
                    >
                      {shortcut.label}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </section>
      <nav className="pair-dock" aria-label="控制模式">
        <button type="button" className={mode === "keyboard" ? "is-active" : ""} onClick={() => setMode("keyboard")}>
          键盘
        </button>
        <button type="button" className={mode === "trackpad" ? "is-active" : ""} onClick={() => setMode("trackpad")}>
          触控板
        </button>
        <button type="button" className={mode === "apps" ? "is-active" : ""} onClick={() => setMode("apps")}>
          应用
        </button>
        <button type="button" className={mode === "macros" ? "is-active" : ""} onClick={() => setMode("macros")}>
          快捷
        </button>
      </nav>
    </main>
  );
}

function PhoneAppPanel({
  ready,
  agentOnline,
  runningApps,
  onActivate,
  onLaunch,
}: {
  ready: boolean;
  agentOnline: boolean;
  runningApps: CuaAppInfo[];
  onActivate: (app: CuaAppInfo) => void;
  onLaunch: (app: { name: string; bundleId: string }) => void;
}) {
  return (
    <div className="pair-app-panel">
      <section>
        <h2>常用</h2>
        <div className="pair-shortcuts">
          {CUA_KNOWN_APPS.map((app) => (
            <button key={app.bundleId} type="button" disabled={!ready} onClick={() => onLaunch(app)}>
              {app.name}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>运行中</h2>
        {!agentOnline ? (
          <p className="pair-empty">等待 Mac 助手（Cua）上线后，这里会列出正在开的窗口。</p>
        ) : runningApps.length === 0 ? (
          <p className="pair-empty">助手在线，但还没有看到运行中的应用。</p>
        ) : (
          <div className="pair-app-list">
            {runningApps.map((app) => (
              <button
                key={`${app.bundleId ?? app.name}-${app.pid ?? 0}`}
                type="button"
                className={app.active ? "is-active" : ""}
                onClick={() => onActivate(app)}
              >
                <strong>{app.name}</strong>
                <small>{app.active ? "前台" : "运行中"}</small>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
