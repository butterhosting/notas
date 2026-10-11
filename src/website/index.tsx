import { createRoot } from "react-dom/client";
import { Website } from "./Website";
import "./index.css";

function start() {
  const root = createRoot(document.getElementById("root")!);
  root.render(<Website />);
}

// against clickjacking: Bun serves the html bundle with no way to add `frame-ancestors`, so framed, the app refuses to
// render; a frame that forbids scripts leaves it blank anyway
if (window.top !== window.self) {
  document.body.textContent = "Notas can't be shown inside another page.";
} else if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
