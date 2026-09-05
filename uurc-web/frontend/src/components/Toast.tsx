export function Toast({
  toast,
  onDismiss,
}: {
  toast: { id: number; message: string } | null;
  onDismiss: () => void;
}) {
  if (!toast) return null;
  return (
    <div className="app-toast" role="status" aria-live="polite" onClick={onDismiss}>
      {toast.message}
    </div>
  );
}
