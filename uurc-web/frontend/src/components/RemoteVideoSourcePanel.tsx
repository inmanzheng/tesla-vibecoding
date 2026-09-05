import { Monitor } from "lucide-react";

import type { RemoteControlPageProps } from "../app/remoteControlPageProps.js";

export function RemoteVideoSourcePanel({
  onRemoteVideoSourceChange,
  primaryRemoteVideoId,
  remoteVideoSources,
}: Pick<RemoteControlPageProps, "onRemoteVideoSourceChange" | "primaryRemoteVideoId" | "remoteVideoSources">) {
  const hasSources = remoteVideoSources.length > 0;

  return (
    <section className="control-insight-panel" aria-label="画面源">
      <header>
        <div>
          <Monitor size={17} />
          <h2>画面源</h2>
        </div>
        <span>{hasSources ? `${remoteVideoSources.length} 路` : "等待画面"}</span>
      </header>
      <p>{hasSources ? "选择要显示的画面" : "连接后显示可用画面"}</p>
      <div className="video-source-list">
        {hasSources ? (
          remoteVideoSources.map((source) => (
            <button
              type="button"
              key={source.id}
              className={source.hasSignal ? undefined : "video-source-empty"}
              aria-pressed={source.id === primaryRemoteVideoId}
              onClick={() => onRemoteVideoSourceChange(source.id)}
            >
              <span>画面 {source.index + 1}</span>
              <small>{source.hasSignal ? source.resolution || "画面中" : "无信号"}</small>
            </button>
          ))
        ) : (
          <span>暂无画面源</span>
        )}
      </div>
    </section>
  );
}
