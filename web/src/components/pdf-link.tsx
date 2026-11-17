"use client";

import { FilePdfOutlined } from "@ant-design/icons";
import { Button } from "antd";
import { api } from "@/lib/api";

/** Opens a PDF of a source system in a new tab, e.g. a scorecard or an order PDF. */
export function PdfLink({ documentId, label }: { documentId: string | null | undefined; label: string }) {
  if (!documentId) return null;
  return (
    <Button size="small" icon={<FilePdfOutlined />} href={api.documentFileUrl(documentId, 1)} target="_blank">
      {label}
    </Button>
  );
}
