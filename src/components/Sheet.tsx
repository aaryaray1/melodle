import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Sheet({ open, title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="sheet" onCancel={onClose} onClose={onClose}>
      <div className="sheet-head">
        <h2 className="sheet-title">{title}</h2>
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="sheet-body">{children}</div>
    </dialog>
  );
}
