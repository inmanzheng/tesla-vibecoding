import { useState } from "react";
import { Maximize2 } from "lucide-react";

type FullscreenProvider = "qq" | "youtube";

// 车机浏览器默认带顶部地址栏，无法用 Web 标准隐藏。唯一可靠办法是借视频站
// 白名单（YouTube / 腾讯视频）进入真正的影院全屏，再跳回本页。
function buildFullscreenUrl(target: string, provider: FullscreenProvider): string {
  if (provider === "youtube") {
    return `https://www.youtube.com/redirect?q=${encodeURIComponent(target)}`;
  }
  // 腾讯视频白名单容器（国内可用，YouTube 被墙时的替代）：经 1905 二次跳转绕开域名校验。
  const encoded = encodeURIComponent(target);
  return `https://v.qq.com/search_redirect.html?url=https://www.1905.com/api/redirec.html?redirect_url=${encoded}?www.1905.com`;
}

// 优先顶层跳转：很多视频站会把目标页嵌在 iframe 里，需要跳出顶层才能真正触发全屏容器、
// 并让本页的 localStorage / cookie 仍指向本站 origin（登录态得以保留）。
function launch(target: string, provider: FullscreenProvider): void {
  const url = buildFullscreenUrl(target, provider);
  try {
    if (window.top && window.top !== window.self) {
      window.top.location.href = url;
      return;
    }
  } catch {
    // 跨源顶层访问被拦截，退回当前窗口跳转。
  }
  window.location.href = url;
}

export function FullscreenLauncher() {
  const [provider, setProvider] = useState<FullscreenProvider>("qq");

  return (
    <section className="auth-card fullscreen-launch-card" aria-label="全屏启动">
      <h2>全屏启动（隐藏顶部栏）</h2>
      <p className="operation-note">
        车机浏览器默认带顶部地址栏。点下方按钮借视频站白名单进入真正全屏并返回本页；登录态会自动保留，无需重复登录。
      </p>
      <div className="inline-fields">
        <label htmlFor="fs-provider">
          <span>全屏通道</span>
          <select
            id="fs-provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value as FullscreenProvider)}
          >
            <option value="qq">腾讯视频（国内）</option>
            <option value="youtube">YouTube</option>
          </select>
        </label>
      </div>
      <button className="primary-action-button" type="button" onClick={() => launch(window.location.origin, provider)}>
        <Maximize2 size={17} />
        全屏启动
      </button>
    </section>
  );
}
