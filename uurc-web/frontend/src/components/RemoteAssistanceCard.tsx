import { Handshake, KeyRound, LoaderCircle } from "lucide-react";

export function RemoteAssistanceCard({
  busy,
  connectCode,
  connectId,
  notice,
  platform,
  onConnectCodeChange,
  onConnectIdChange,
  onPlatformChange,
  onStart,
}: {
  busy: string | null;
  connectCode: string;
  connectId: string;
  notice: string;
  platform: number;
  onConnectCodeChange: (value: string) => void;
  onConnectIdChange: (value: string) => void;
  onPlatformChange: (value: number) => void;
  onStart: () => void;
}) {
  const submitting = busy === "assistance";
  const disabled = busy !== null || connectId.trim().length === 0;

  return (
    <section className="remote-assistance-card" aria-labelledby="remote-assistance-title">
      <div className="remote-assistance-heading">
        <span className="remote-assistance-icon" aria-hidden="true">
          <Handshake size={18} />
        </span>
        <div>
          <h3 id="remote-assistance-title">远控伙伴设备</h3>
          <p>通过伙伴的设备 ID 和设备验证码发起远程协助。</p>
        </div>
      </div>

      <form
        className="remote-assistance-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled) onStart();
        }}
      >
        <label>
          <span>伙伴的设备 ID</span>
          <input
            autoComplete="off"
            inputMode="numeric"
            maxLength={12}
            onChange={(event) => onConnectIdChange(event.target.value.replace(/\D/g, ""))}
            placeholder="6-12 位数字"
            value={connectId}
          />
        </label>

        <label>
          <span>伙伴的设备验证码</span>
          <input
            autoCapitalize="characters"
            autoComplete="one-time-code"
            onChange={(event) => onConnectCodeChange(event.target.value.trim())}
            placeholder="可留空，由对方确认"
            spellCheck={false}
            value={connectCode}
          />
        </label>

        <label>
          <span>伙伴设备系统</span>
          <select
            onChange={(event) => onPlatformChange(Number(event.target.value))}
            value={platform}
          >
            <option value={1}>Windows</option>
            <option value={4}>macOS</option>
            <option value={2}>Android</option>
          </select>
        </label>

        <button className="primary-action-button remote-assistance-submit" disabled={disabled} type="submit">
          {submitting ? <LoaderCircle className="spin" size={17} /> : <KeyRound size={17} />}
          连接
        </button>
      </form>

      <p className="remote-assistance-note">
        {notice || "验证码可留空：留空时对方需在其设备上点「确认」；若对方设置了验证码，则需向对方索取后填入。"}
      </p>
    </section>
  );
}
