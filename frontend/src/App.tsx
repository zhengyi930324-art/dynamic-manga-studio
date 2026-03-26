import { useState } from "react";

import { ProjectDetailPage } from "@/pages/project-detail-page";
import { PrototypeApp } from "@/prototype/prototype-app";

function App() {
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"prototype" | "project">("prototype");

  return (
    <>
      {viewMode === "prototype" ? (
        <PrototypeApp />
      ) : (
        <ProjectDetailPage onProjectIdChange={setCurrentProjectId} />
      )}

      <div className="fixed right-5 top-5 z-[120] flex items-center gap-2 rounded-full border border-white/10 bg-[rgba(8,11,22,0.82)] p-1.5 text-xs font-semibold text-white shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <button
          className={`rounded-full px-3 py-2 transition-colors ${
            viewMode === "prototype"
              ? "bg-[linear-gradient(135deg,#cc97ff,#9c48ea)] text-[#2f0a51]"
              : "text-white/70 hover:bg-white/5"
          }`}
          onClick={() => setViewMode("prototype")}
        >
          Prototype
        </button>
        <button
          className={`rounded-full px-3 py-2 transition-colors ${
            viewMode === "project"
              ? "bg-[linear-gradient(135deg,#67e8f9,#23d4ff)] text-[#003b49]"
              : "text-white/70 hover:bg-white/5"
          }`}
          onClick={() => setViewMode("project")}
        >
          Project
        </button>
      </div>

      {viewMode === "project" && currentProjectId ? (
        <div className="fixed bottom-5 right-5 z-50 rounded-full border border-cyan-300/20 bg-[rgba(7,14,30,0.88)] px-4 py-2 text-xs font-semibold text-[var(--text-1)] shadow-[0_18px_50px_rgba(3,9,24,0.5)] backdrop-blur">
          当前项目：<span className="cyber-code text-cyan-200">{currentProjectId}</span>
        </div>
      ) : null}
    </>
  );
}

export default App;
