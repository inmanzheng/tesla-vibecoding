import type { RemoteControlPageProps } from "../app/remoteControlPageProps.js";
import { describeCuaIntent } from "../remote/cuaIntent.js";

export function RemoteCuaDrawer({
  cuaAgentOnline,
  cuaDraft,
  cuaFrontmost,
  cuaPreview,
  cuaResults,
  cuaStatus,
  inputControlActive,
  onCuaDraftChange,
  onSubmitCua,
}: Pick<
  RemoteControlPageProps,
  | "cuaAgentOnline"
  | "cuaDraft"
  | "cuaFrontmost"
  | "cuaPreview"
  | "cuaResults"
  | "cuaStatus"
  | "inputControlActive"
  | "onCuaDraftChange"
  | "onSubmitCua"
>) {
  return (
    <details className="control-drawer" id="remote-cua-drawer">
      <summary>CUA</summary>
      <form
        className="remote-cua-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitCua();
        }}
      >
        <p className="remote-cua-meta">
          {cuaAgentOnline ? `Mac 助手在线${cuaFrontmost ? ` · 前台 ${cuaFrontmost}` : ""}` : "等待 Mac 助手。开 App 会排队，回车/复制仍走画面。"}
        </p>
        <input
          value={cuaDraft}
          disabled={!inputControlActive}
          placeholder="打开微信、关掉前台窗口、复制…"
          onChange={(event) => onCuaDraftChange(event.target.value)}
        />
        {cuaPreview ? <p className="remote-cua-preview">{describeCuaIntent(cuaPreview)}</p> : null}
        <div className="remote-cua-actions">
          <button className="primary-action-button" type="submit" disabled={!inputControlActive || !cuaDraft.trim()}>
            交给 Cua
          </button>
        </div>
        {cuaStatus ? <p className="remote-cua-preview">{cuaStatus}</p> : null}
      </form>
      {cuaResults.length > 0 ? (
        <ol className="remote-cua-log" aria-label="最近 CUA 结果">
          {cuaResults.map((item) => (
            <li key={`${item.id}-${item.at}`}>
              <strong>{item.ok ? "已处理" : "未执行"} · {item.text}</strong>
              <small>{item.detail}</small>
            </li>
          ))}
        </ol>
      ) : null}
    </details>
  );
}
