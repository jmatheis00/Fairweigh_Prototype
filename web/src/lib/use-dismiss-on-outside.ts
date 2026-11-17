import { useEffect, useRef } from "react";

/**
 * Closes a side panel (Drawer without mask) on a click outside or on Esc.
 *
 * - Clicks inside any drawer and inside Ant Design popups (Select, DatePicker,
 *   Popover, Tooltip, Dropdown, Modal, message, notification) never close it.
 * - Elements that open or switch a panel need no marking: the panel is closed
 *   only if its content (`contentKey`) is still the same after the click was
 *   handled. A trigger that shows other content therefore switches directly.
 * - Esc closes only the topmost open panel, whether or not focus is inside it.
 */
const IGNORED =
  ".ant-drawer, .ant-modal-root, .ant-modal-wrap, .ant-select-dropdown, .ant-picker-dropdown, .ant-popover, .ant-tooltip, " +
  ".ant-dropdown, .ant-message, .ant-notification, .ant-cascader-dropdown, .ant-tree-select-dropdown, .ant-color-picker, .ant-image-preview-root";
const OPEN_POPUP = ".ant-modal-wrap:not([style*='display: none']), .ant-select-open, .ant-picker-focused, .ant-dropdown:not(.ant-dropdown-hidden)";

// Open panels in opening order; the last one is the topmost.
const stack: symbol[] = [];

export function useDismissOnOutside(open: boolean, onClose: () => void, contentKey?: unknown) {
  const closeRef = useRef(onClose);
  const keyRef = useRef(contentKey);
  useEffect(() => {
    closeRef.current = onClose;
    keyRef.current = contentKey;
  });

  useEffect(() => {
    if (!open) return;
    const id = Symbol("side-panel");
    stack.push(id);
    let pending: { key: unknown } | null = null;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element) || target === document.documentElement || target.closest(IGNORED)) {
        pending = null;
        return;
      }
      pending = { key: keyRef.current };
    };
    const onClick = () => {
      const started = pending;
      pending = null;
      if (!started) return;
      // Let the click handlers of a trigger run first, then compare the content.
      setTimeout(() => {
        if (keyRef.current === started.key) closeRef.current();
      }, 0);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || stack[stack.length - 1] !== id) return;
      if (document.querySelector(OPEN_POPUP)) return;
      closeRef.current();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [open]);
}
