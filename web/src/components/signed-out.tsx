"use client";

import { Avatar, Button, Card, Flex, Typography } from "antd";
import { COMPANY, DEMO_USERS, type DemoUser } from "@/lib/users";

/** Simulated sign-out: no real login, the visitor picks a demo user. */
export function SignedOut({ onSignIn }: { onSignIn: (user: DemoUser) => void }) {
  return (
    <Flex justify="center" style={{ paddingTop: 64 }}>
      <Card className="dash-card" style={{ width: "100%", maxWidth: 440 }}>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          Signed out
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          This prototype has no real login. Choose a user of {COMPANY}.
        </Typography.Paragraph>
        <Flex vertical gap={8}>
          {DEMO_USERS.map((u) => (
            <Button key={u.id} onClick={() => onSignIn(u)} style={{ height: "auto", padding: "8px 12px", justifyContent: "flex-start" }}>
              <Flex align="center" gap={10}>
                <Avatar size={28}>{u.initials}</Avatar>
                <Flex vertical align="flex-start" style={{ lineHeight: 1.3 }}>
                  <span>{u.name}</span>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {u.title}
                    {u.canRun ? "" : " · view only"}
                  </Typography.Text>
                </Flex>
              </Flex>
            </Button>
          ))}
        </Flex>
      </Card>
    </Flex>
  );
}
