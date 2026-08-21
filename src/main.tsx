import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorHandlers } from "@/lib/reportError";

// Before render, so a crash during the first paint is still recorded.
installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(<App />);
