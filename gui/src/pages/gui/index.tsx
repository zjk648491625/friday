import { useCallback, useEffect, useRef, useState } from "react";
import { History } from "../../components/History";
import { Chat } from "./Chat";
import { useSettings } from "../../hooks/useSettings";

export default function GUI() {
  useSettings();
  const [sidebarW, setSidebarW] = useState(() => {
    try { return parseInt(localStorage.getItem("friday_sidebar_width") || "") || 384; } catch { return 384; }
  });
  const sidebarRef = useRef(sidebarW);
  sidebarRef.current = sidebarW;
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = sidebarRef.current;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const w = Math.max(240, Math.min(800, startW.current + e.clientX - startX.current));
      setSidebarW(w);
    };
    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try { localStorage.setItem("friday_sidebar_width", String(sidebarRef.current)); } catch {}
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return (
    <div className="flex min-h-0 w-full flex-row overflow-x-hidden">
      <aside
        className="4xl:flex border-vsc-input-border hidden min-h-0 overflow-y-auto border-0 border-r border-solid"
        style={{ width: sidebarW, flexShrink: 0 }}
      >
        <History />
      </aside>
      <div
        className="4xl:flex hidden w-1.5 cursor-col-resize hover:bg-[#3b82f6] active:bg-[#3b82f6] transition-colors flex-shrink-0 rounded-full"
        onMouseDown={onMouseDown}
      />
      <main className="no-scrollbar flex min-h-0 min-w-0 flex-1 flex-col">
        <Chat />
      </main>
    </div>
  );
}
