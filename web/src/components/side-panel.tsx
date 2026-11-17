"use client";

import { Drawer, type DrawerProps } from "antd";
import { useDismissOnOutside } from "@/lib/use-dismiss-on-outside";

type Props = Omit<DrawerProps, "mask" | "keyboard"> & {
  /** Identity of the shown content; a click that switches it does not close the panel. */
  contentKey?: unknown;
};

/** Side panel without grey overlay (the page stays visible); closes on outside click and Esc. */
export function SidePanel({ contentKey, open, onClose, ...rest }: Props) {
  useDismissOnOutside(!!open, () => onClose?.({} as never), contentKey);
  return <Drawer {...rest} open={open} onClose={onClose} mask={false} keyboard={false} />;
}
