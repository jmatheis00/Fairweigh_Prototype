"use client";

import { BookOutlined, CheckOutlined, DownOutlined, InfoCircleOutlined, LogoutOutlined, NodeIndexOutlined, QuestionCircleOutlined, SwapOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { Avatar, Button, Dropdown, Flex, Menu, Tag, Typography, type MenuProps } from "antd";
import { useState, type ReactNode } from "react";
import { DEMO_USERS, NAV_BY_ROLE, type DemoUser, type NavPage } from "@/lib/users";
import { Logo } from "./logo";

export type AppPage = Exclude<NavPage, "decisions">;

interface Props {
  page: AppPage;
  onNavigate: (page: AppPage) => void;
  /** Logo and name lead to the user's start page (16 Nov 2026). */
  onHome: () => void;
  /** A purchase process is open; only then the "Purchase process" item is shown. */
  processOpen: boolean;
  decisionCount: number;
  onOpenDecisions: () => void;
  user: DemoUser;
  onSwitchUser: (user: DemoUser) => void;
  onSignOut: () => void;
  /** "How it works" in the help menu. */
  onHelp: () => void;
  onGlossary: () => void;
  onAbout: () => void;
  /** Mode tag on the right (live runs only, since 18 Nov 2026). */
  status: ReactNode;
  /** Mode as text at the top of the help menu, e.g. "Saved run from 18 Nov 2026". */
  modeLabel?: string;
  /** Page actions, e.g. "Record decision". */
  actions?: ReactNode;
}

/** Petrol navigation bar: logo and title, main navigation, status, account menu. */
export function AppHeader({
  page,
  onNavigate,
  onHome,
  processOpen,
  decisionCount,
  onOpenDecisions,
  user,
  onSwitchUser,
  onSignOut,
  onHelp,
  onGlossary,
  onAbout,
  status,
  modeLabel,
  actions,
}: Props) {
  // Navigation per role (expert interviews, 10 Nov 2026): pages a role does not need are hidden, not greyed out.
  const LABEL: Record<NavPage, string> = {
    queue: "Work queue",
    process: "Purchase process",
    dashboard: "Dashboard",
    targets: "CO₂ targets",
    suppliers: "Suppliers",
    sustainability: "CO₂ and risks",
    impact: "Results",
    rules: "Rules",
    decisions: `Decision log (${decisionCount})`,
    glossary: "Glossary",
  };
  const navItems: MenuProps["items"] = NAV_BY_ROLE[user.role]
    .filter((p) => p !== "process" || processOpen)
    .map((p) => ({ key: p, label: LABEL[p] }));

  const accountItems: MenuProps["items"] = [
    {
      key: "who",
      type: "group",
      label: (
        <Flex vertical style={{ lineHeight: 1.4, padding: "4px 0" }}>
          <Typography.Text strong>{user.name}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {user.title}
          </Typography.Text>
          {!user.canDecide && !user.canEditRules && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Read-only access
            </Typography.Text>
          )}
        </Flex>
      ),
    },
    { type: "divider" },
    {
      key: "switch",
      icon: <SwapOutlined />,
      label: "Switch user",
      children: DEMO_USERS.map((u) => ({
        key: `user:${u.id}`,
        icon: u.id === user.id ? <CheckOutlined aria-label="current user" /> : <span style={{ display: "inline-block", width: 14 }} />,
        label: `${u.name} · ${u.title}`,
      })),
    },
    { key: "decisions", icon: <UnorderedListOutlined />, label: "Decision log" },
    { type: "divider" },
    { key: "signout", icon: <LogoutOutlined />, label: "Sign out" },
  ];

  // Controlled menu (review 16 Nov 2026): the submenu opened on hover and the click closed it again, and after a
  // switch the old submenu stayed open with a stale checkmark. Now one click opens "Switch user", any choice closes all.
  const [accountOpen, setAccountOpen] = useState(false);
  const onAccount: MenuProps["onClick"] = ({ key }) => {
    setAccountOpen(false);
    if (key.startsWith("user:")) {
      const next = DEMO_USERS.find((u) => `user:${u.id}` === key);
      if (next) onSwitchUser(next);
    } else if (key === "decisions") onOpenDecisions();
    else if (key === "signout") onSignOut();
  };

  // Help where SaaS users expect it (16 Nov 2026): a "?" in the header instead of explanations on the pages.
  // The mode sits here instead of a header tag for saved runs (18 Nov 2026): visible on request, quiet in a pitch.
  const helpItems: MenuProps["items"] = [
    ...(modeLabel
      ? [
          {
            key: "mode",
            type: "group" as const,
            label: (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Mode: {modeLabel}
              </Typography.Text>
            ),
          },
          { type: "divider" as const },
        ]
      : []),
    { key: "how", icon: <NodeIndexOutlined />, label: "How it works" },
    { key: "glossary", icon: <BookOutlined />, label: "Glossary" },
    { type: "divider" },
    { key: "about", icon: <InfoCircleOutlined />, label: "About Fairweigh" },
  ];

  return (
    <header className="app-header">
      <button type="button" className="app-brand" onClick={onHome} aria-label="Fairweigh, go to the start page">
        <Logo />
        <span className="app-title">Fairweigh</span>
      </button>
      <Menu
        className="app-nav"
        mode="horizontal"
        theme="dark"
        selectedKeys={[page]}
        items={navItems}
        onClick={({ key }) => (key === "decisions" ? onOpenDecisions() : onNavigate(key as AppPage))}
      />
      <Flex align="center" gap={8} className="app-header-right">
        {actions}
        {status}
        <Dropdown
          menu={{ items: helpItems, onClick: ({ key }) => (key === "how" ? onHelp() : key === "glossary" ? onGlossary() : onAbout()) }}
          trigger={["click"]}
          placement="bottomRight"
        >
          <Button type="text" className="app-help" aria-label="Help" icon={<QuestionCircleOutlined />} />
        </Dropdown>
        <Dropdown
          menu={{ items: accountItems, onClick: onAccount, triggerSubMenuAction: "click" }}
          trigger={["click"]}
          placement="bottomRight"
          open={accountOpen}
          onOpenChange={(open) => setAccountOpen(open)}
          destroyOnHidden
        >
          <Button type="text" className="app-account" aria-label={`Account menu: ${user.name}, ${user.title}`}>
            <Avatar size={28} className="app-avatar">
              {user.initials}
            </Avatar>
            <span className="app-account-text">
              <span className="app-account-name">{user.name}</span>
              <span className="app-account-role">{user.shortTitle}</span>
            </span>
            <DownOutlined style={{ fontSize: 10 }} />
          </Button>
        </Dropdown>
      </Flex>
    </header>
  );
}

/** A tag that reads well on the petrol bar; the dot shows the state, the text always says it. */
export function HeaderTag({ children, dot }: { children: ReactNode; dot?: "live" | "saved" }) {
  return (
    <Tag className="app-header-tag">
      {dot && <span className={`app-status-dot app-status-dot-${dot}`} aria-hidden />}
      {children}
    </Tag>
  );
}
