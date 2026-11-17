/**
 * Entry of the static team preview (no server, no AI). Built with
 * `npm run preview:build -w @scc/web`; the normal app is the Next.js one.
 */
import { createRoot } from "react-dom/client";
import "../src/app/globals.css";
import { CockpitShell } from "../src/components/cockpit-shell";

createRoot(document.getElementById("root")!).render(<CockpitShell />);
