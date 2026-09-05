import { Clipboard, ClipboardCheck } from "lucide-react";

import type { RemoteControlPageProps } from "../app/remoteControlPageProps.js";

export function RemoteClipboardPanel({
  busy,
  canReadLocalClipboard,
  canSendClipboardText,
  clipboardPreviewLabel,
  clipboardStatusLabel,
  onReadLocalClipboard,
  onSendClipboardText,
}: Pick<
  RemoteControlPageProps,
  | "busy"
  | "canReadLocalClipboard"
  | "canSendClipboardText"
  | "clipboardPreviewLabel"
  | "clipboardStatusLabel"
  | "onReadLocalClipboard"
  | "onSendClipboardText"
>) {
  return (
    <section className="control-insight-panel" aria-label="剪贴板">
      <header>
        <div>
          <Clipboard size={17} />
          <h2>剪贴板</h2>
        </div>
        <span>{clipboardPreviewLabel}</span>
      </header>
      <p>{clipboardStatusLabel}</p>
      <div className="panel-action-row">
        <button onClick={onReadLocalClipboard} disabled={!canReadLocalClipboard || busy !== null}>
          <Clipboard size={16} />
          读取剪贴板
        </button>
        <button onClick={onSendClipboardText} disabled={!canSendClipboardText}>
          <ClipboardCheck size={16} />
          发送到远端
        </button>
      </div>
    </section>
  );
}
