import type { RemoteControlPageProps } from "../app/remoteControlPageProps.js";
import { RemoteClipboardPanel } from "./RemoteClipboardPanel.js";
import { RemoteConnectionQualityPanel } from "./RemoteConnectionQualityPanel.js";
import { RemoteVideoSourcePanel } from "./RemoteVideoSourcePanel.js";

export function RemoteControlInsights(props: RemoteControlPageProps) {
  return (
    <section className="control-insights" aria-label="远控辅助面板">
      <RemoteConnectionQualityPanel {...props} />
      <RemoteClipboardPanel {...props} />
      <RemoteVideoSourcePanel {...props} />
    </section>
  );
}
