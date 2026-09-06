import { buildPairLandingUrl } from "../remote/inputBridgeClient.js";

export function InputBridgePanel({
  pairUrl,
  status,
  onClose,
}: {
  pairId?: string;
  pairUrl: string;
  status: string;
  onClose: () => void;
}) {
  const url = pairUrl || buildPairLandingUrl();
  return (
    <aside className="input-bridge-panel" aria-label="手机输入配对">
      <div className="input-bridge-toolbar">
        <strong>手机输入</strong>
        <button type="button" onClick={onClose}>
          关闭
        </button>
      </div>
      <p>用 iPhone Safari 打开这个地址，打开后会自动配对：</p>
      <code className="input-bridge-url">{url}</code>
      <p className="input-bridge-status">{status}</p>
      <p className="input-bridge-hint">无需配对码。手机底栏可切键盘、触控板、应用和快捷。</p>
    </aside>
  );
}
