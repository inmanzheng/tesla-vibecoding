import { ClipboardCheck, LoaderCircle } from "lucide-react";

export function LoginImportPanel({
  authJson,
  busy,
  onAuthJsonChange,
  onImport,
}: {
  authJson: string;
  busy: string | null;
  onAuthJsonChange: (value: string) => void;
  onImport: () => void;
}) {
  return (
    <details className="identity-section auth-card login-import" aria-label="导入已有账号凭证">
      <summary>导入账号凭证</summary>
      <p className="login-import-hint">
        已在其他设备登录过 UU？可粘贴此前从「账号管理 · 导出账号凭证」得到的 JSON，直接恢复登录，无需重新收验证码。
      </p>
      <label className="field-label" htmlFor="auth-json">
        账号凭证 JSON
      </label>
      <textarea
        id="auth-json"
        name="auth-json"
        value={authJson}
        onChange={(event) => onAuthJsonChange(event.target.value)}
        spellCheck={false}
        placeholder='粘贴形如 {"token":"...","userId":"...","deviceId":"..."} 的账号凭证 JSON'
      />
      <div className="button-row account-actions">
        <button className="primary-action-button wide-button" onClick={onImport} disabled={!authJson.trim() || busy !== null}>
          {busy === "import" ? <LoaderCircle className="spin" size={17} /> : <ClipboardCheck size={17} />}
          导入账号凭证 JSON
        </button>
      </div>
    </details>
  );
}
