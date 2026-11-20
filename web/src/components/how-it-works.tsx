"use client";

import { Tag, Typography } from "antd";

/** Who does each step: the AI only collects, code checks and ranks, the buyer decides. */
type Actor = "You" | "AI agent" | "Code";

const STEPS: { title: string; actor: Actor; text: string }[] = [
  { title: "Request", actor: "You", text: "Choose product, quantity and needed-by date." },
  { title: "Collect evidence", actor: "AI agent", text: "Gathers price, quality, CO₂ and delivery for every offer from ERP, ratings, CO₂ data and documents." },
  { title: "Check sources", actor: "Code", text: "Checks every value against its source. A missing or unverified value counts as 0 points; a supplier that never delivered gets a range and ranks after real data." },
  { title: "Apply knock-outs", actor: "Code", text: "Excludes offers with a proven violation, LkSG risk High without a social audit, or child or forced labour." },
  { title: "Score and rank", actor: "Code", text: "Each value in % better or worse than today, the average of our last three purchases, weighted by your weights. Same input, same ranking." },
  { title: "Decide", actor: "You", text: "Pick an offer and record the reason. Every decision goes into the decision log." },
];

/** The process from request to decision as a numbered list, so first-time users see what the cockpit does. */
export function HowItWorks({ title = true }: { title?: boolean }) {
  return (
    <div>
      {title && (
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          How it works
        </Typography.Title>
      )}
      <ol className="how-steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <span className="how-num" aria-hidden>
              {i + 1}
            </span>
            <div>
              <div>
                <strong>{s.title}</strong> <Tag style={{ marginInlineStart: 4 }}>{s.actor}</Tag>
              </div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {s.text}
              </Typography.Text>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
