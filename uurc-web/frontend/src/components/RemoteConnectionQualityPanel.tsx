import { Activity, RotateCcw } from "lucide-react";

import type { RemoteControlPageProps } from "../app/remoteControlPageProps.js";

// 普通用户一眼能看懂的核心指标常驻显示；其余专业/诊断指标收进“更多指标”，减少信息过载。
const PRIMARY_METRIC_LABELS = new Set(["路径", "画面", "输入", "延迟", "帧率", "分辨率"]);

export function RemoteConnectionQualityPanel({
  autoReconnectEnabled,
  autoReconnectLabel,
  connectionQuality,
  onAutoReconnectEnabledChange,
}: Pick<
  RemoteControlPageProps,
  | "autoReconnectEnabled"
  | "autoReconnectLabel"
  | "connectionQuality"
  | "onAutoReconnectEnabledChange"
>) {
  const primaryMetrics = connectionQuality.metrics.filter((metric) => PRIMARY_METRIC_LABELS.has(metric.label));
  const advancedMetrics = connectionQuality.metrics.filter((metric) => !PRIMARY_METRIC_LABELS.has(metric.label));

  return (
    <section className={`control-insight-panel quality-${connectionQuality.state}`} aria-label="连接质量">
      <header>
        <div>
          <Activity size={17} />
          <h2>连接质量</h2>
        </div>
        <span>{connectionQuality.title}</span>
      </header>
      {connectionQuality.detail ? <p>{connectionQuality.detail}</p> : null}
      <div className="quality-metrics" aria-label="连接质量指标">
        {primaryMetrics.map((metric) => (
          <span className="quality-metric" key={metric.label}>
            <small>{metric.label}</small>
            <strong>{metric.value}</strong>
          </span>
        ))}
      </div>
      {advancedMetrics.length > 0 ? (
        <details className="quality-more">
          <summary>更多指标</summary>
          <div className="quality-metrics" aria-label="更多连接质量指标">
            {advancedMetrics.map((metric) => (
              <span className="quality-metric" key={metric.label}>
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
              </span>
            ))}
          </div>
        </details>
      ) : null}
      <label className="auto-reconnect-toggle">
        <input
          type="checkbox"
          checked={autoReconnectEnabled}
          onChange={(event) => onAutoReconnectEnabledChange(event.target.checked)}
        />
        <span>
          <RotateCcw size={15} />
          自动重连
        </span>
      </label>
      <small>{autoReconnectLabel}</small>
    </section>
  );
}
