import type { ReactNode } from "react";

export function Panel({
  title,
  titleAccessory,
  icon,
  action,
  children,
  className = "",
}: {
  title: string;
  titleAccessory?: ReactNode;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">
        <div className="panel-title">
          {icon}
          <h2>{title}</h2>
          {titleAccessory}
        </div>
        {action ? <div className="panel-actions">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-row">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}
