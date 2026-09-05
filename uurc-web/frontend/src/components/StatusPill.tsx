interface StatusPillProps {
  state: "ready" | "warn" | "idle";
  children: React.ReactNode;
}

export function StatusPill({ state, children }: StatusPillProps) {
  return (
    <span className={`status-pill status-pill-${state}`}>
      <span className="status-pill-dot" aria-hidden />
      <span>{children}</span>
    </span>
  );
}
