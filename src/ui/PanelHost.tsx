import { useEffect, useRef, type ReactNode } from "react";
import styles from "./PanelHost.module.css";

export function PanelHost({ title, onClose, action, children }: { title: string; onClose?: (() => void) | undefined; action?: ReactNode; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current!;
    element.showModal();
    return () => {
      element.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="panel-title" onCancel={(event) => { event.preventDefault(); onClose?.(); }}>
    <header className={styles.header}><h2 id="panel-title">{title}</h2>{action}</header>{children}
  </dialog>;
}
