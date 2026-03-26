import { useEffect, useMemo, useState, type ReactNode } from "react";

type PrototypePage = "workspace" | "assets" | "export";
type AssetTab = "images" | "videos" | "audio" | "characters";
type ViewMode = "grid" | "list";
type ExportFormat = "MP4" | "MOV" | "WEBM";
type Resolution = "4K" | "1080P";

type FrameOption = {
  id: string;
  title: string;
  src: string;
};

type LibraryAsset = {
  id: string;
  kind: AssetTab;
  label: string;
  title: string;
  subtitle?: string;
  src?: string;
  duration?: string;
};

const frameOptions: FrameOption[] = [
  { id: "main", title: "Primary render", src: "/prototype/scene-main.svg" },
  { id: "alt-1", title: "Alt skyline", src: "/prototype/scene-alt-1.svg" },
  { id: "alt-2", title: "Street pulse", src: "/prototype/scene-alt-2.svg" },
];

const libraryAssets: LibraryAsset[] = [
  {
    id: "char-1",
    kind: "characters",
    label: "CHARACTER",
    title: "KAELEN: THE GLITCH",
    subtitle: "Lead hero profile",
    src: "/prototype/portrait-kaelen.svg",
  },
  {
    id: "img-1",
    kind: "images",
    label: "ENVIRONMENT",
    title: "District 7 / Rain Grid",
    subtitle: "Neon alley environment",
    src: "/prototype/environment-neon.svg",
  },
  {
    id: "img-2",
    kind: "images",
    label: "PROP",
    title: "Ceremonial Mask V2",
    subtitle: "Artifact close-up",
    src: "/prototype/prop-mask.svg",
  },
  {
    id: "video-1",
    kind: "videos",
    label: "SEQUENCE",
    title: "Ch02_Action_04",
    subtitle: "Motion draft sequence",
    src: "/prototype/sequence-action.svg",
  },
];

const audioAssets: LibraryAsset[] = [
  {
    id: "audio-1",
    kind: "audio",
    label: "AUDIO",
    title: "Synthesized Dreams",
    subtitle: "Lo-fi / melancholic / tech noir",
    duration: "03:24",
  },
  {
    id: "audio-2",
    kind: "audio",
    label: "VOICE",
    title: "Narration Pass A",
    subtitle: "Measured, cinematic, low register",
    duration: "01:42",
  },
];

function NavIcon({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`prototype-icon ${active ? "prototype-icon-active" : ""}`}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

function HomeGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M4 11.4 12 5l8 6.4V20H4v-8.6Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9.5 20v-5h5v5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function BoxGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 4v16M4 8.5l8 4.2 8-4.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function SparkGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3 13.9 8.1 19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function WaveGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M3 12c2.1 0 2.1-4 4.2-4s2.1 8 4.3 8 2.1-8 4.2-8 2.1 4 4.3 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ExportGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M12 4v11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m7.5 11.4 4.5 4.6 4.5-4.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 20h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BellGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M6.5 17.5c0-1.3 1.1-2.4 2.4-2.4h6.2c1.3 0 2.4 1.1 2.4 2.4H6.5Zm2-2.5v-3.2a3.5 3.5 0 0 1 7 0V15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SettingsGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M12 8.7a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Zm8.3 3.3-.2-1.2-2- .6a6.6 6.6 0 0 0-.8-1.8l1.2-1.7-.9-.9-1.8 1.2c-.6-.4-1.2-.7-1.9-.8l-.5-2.1h-1.3l-.5 2.1c-.7.1-1.3.4-1.9.8L7.8 6.1l-.9.9 1.2 1.7c-.4.6-.7 1.2-.8 1.8l-2 .6-.2 1.2 2 .6c.1.7.4 1.3.8 1.9l-1.2 1.7.9.9 1.8-1.2c.6.4 1.2.7 1.9.8l.5 2.1h1.3l.5-2.1c.7-.1 1.3-.4 1.9-.8l1.8 1.2.9-.9-1.2-1.7c.4-.6.7-1.2.8-1.9l2-.6Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M8 6v12l10-6-10-6Z" fill="currentColor" />
    </svg>
  );
}

function DuplicateGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M9 9h10v10H9zM5 5h10v10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TagGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M3 10.5V5h5.5L20 16.5 16.5 20 3 10.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="7.5" cy="7.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M5 7h14M9 7V5h6v2m-8 0 1 11h8l1-11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function UploadGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M12 16V6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m7.5 10.5 4.5-4.5 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 19h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function PrototypeApp() {
  const [activePage, setActivePage] = useState<PrototypePage>("workspace");
  const [activeAssetTab, setActiveAssetTab] = useState<AssetTab>("images");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [visualPrompt, setVisualPrompt] = useState("");
  const [selectedFrame, setSelectedFrame] = useState("main");
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(72);
  const [creativity, setCreativity] = useState(0.75);
  const [stylization, setStylization] = useState(0.42);
  const [format, setFormat] = useState<ExportFormat>("MP4");
  const [resolution, setResolution] = useState<Resolution>("4K");
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  useEffect(() => {
    if (!generating) {
      return;
    }
    const timer = window.setInterval(() => {
      setGenerationProgress((value) => {
        if (value >= 96) {
          window.clearInterval(timer);
          setGenerating(false);
          return 96;
        }
        return value + 4;
      });
    }, 220);

    return () => window.clearInterval(timer);
  }, [generating]);

  useEffect(() => {
    if (!exporting) {
      return;
    }
    const timer = window.setInterval(() => {
      setExportProgress((value) => {
        if (value >= 100) {
          window.clearInterval(timer);
          setExporting(false);
          return 100;
        }
        return value + 8;
      });
    }, 180);

    return () => window.clearInterval(timer);
  }, [exporting]);

  const currentFrame = frameOptions.find((item) => item.id === selectedFrame) ?? frameOptions[0];

  const displayAssets = useMemo(() => {
    if (activeAssetTab === "audio") {
      return audioAssets;
    }
    if (activeAssetTab === "characters") {
      return libraryAssets.filter((asset) => asset.kind === "characters");
    }
    return libraryAssets.filter((asset) => asset.kind === activeAssetTab);
  }, [activeAssetTab]);

  const toggleAsset = (assetId: string) => {
    setSelectedAssets((current) =>
      current.includes(assetId)
        ? current.filter((item) => item !== assetId)
        : [...current, assetId]
    );
  };

  const handleGenerate = () => {
    if (!visualPrompt.trim()) {
      return;
    }
    setGenerating(true);
    setGenerationProgress(38);
    const nextFrame = selectedFrame === "main" ? "alt-1" : selectedFrame === "alt-1" ? "alt-2" : "main";
    setSelectedFrame(nextFrame);
  };

  const handleStartExport = () => {
    setExporting(true);
    setExportProgress(6);
  };

  return (
    <div className="prototype-shell">
      <aside className="prototype-sidebar">
        <div className="prototype-brand">
          <div className="prototype-brand-mark">N</div>
          <div>
            <div className="prototype-brand-name">Neon Atelier</div>
            <div className="prototype-brand-subtitle">AI Image Video Generator</div>
          </div>
        </div>

        <nav className="prototype-nav">
          <button
            className={`prototype-nav-item ${activePage === "workspace" ? "prototype-nav-item-active" : ""}`}
            onClick={() => setActivePage("workspace")}
          >
            <NavIcon active={activePage === "workspace"}>
              <HomeGlyph />
            </NavIcon>
            <span>Script</span>
          </button>
          <button
            className={`prototype-nav-item ${activePage === "assets" ? "prototype-nav-item-active prototype-nav-item-cyan" : ""}`}
            onClick={() => setActivePage("assets")}
          >
            <NavIcon active={activePage === "assets"}>
              <BoxGlyph />
            </NavIcon>
            <span>Assets</span>
          </button>
          <button className="prototype-nav-item prototype-nav-item-muted">
            <NavIcon active={false}>
              <SparkGlyph />
            </NavIcon>
            <span>Generate</span>
          </button>
          <button className="prototype-nav-item prototype-nav-item-muted">
            <NavIcon active={false}>
              <SparkGlyph />
            </NavIcon>
            <span>Effects</span>
          </button>
          <button className="prototype-nav-item prototype-nav-item-muted">
            <NavIcon active={false}>
              <WaveGlyph />
            </NavIcon>
            <span>Audio</span>
          </button>
        </nav>

        <div className="prototype-sidebar-footer">
          <button className="prototype-sidebar-icon" aria-label="Notifications">
            <BellGlyph />
          </button>
          <button className="prototype-sidebar-icon" aria-label="Settings">
            <SettingsGlyph />
          </button>
          <div className="prototype-avatar">ZX</div>
        </div>
      </aside>

      <div className="prototype-main">
        <header className="prototype-topbar">
          <div className="prototype-topbar-tabs">
            <button
              className={`prototype-topbar-tab ${activePage === "workspace" ? "prototype-topbar-tab-active" : ""}`}
              onClick={() => setActivePage("workspace")}
            >
              Projects
            </button>
            <button
              className={`prototype-topbar-tab ${activePage === "assets" ? "prototype-topbar-tab-active prototype-topbar-tab-cyan" : ""}`}
              onClick={() => setActivePage("assets")}
            >
              Assets
            </button>
            <button className="prototype-topbar-tab prototype-topbar-tab-muted">Timeline</button>
            <button className="prototype-topbar-tab prototype-topbar-tab-muted">Analytics</button>
          </div>

          <div className="prototype-topbar-actions">
            <button className="prototype-secondary-button">Save Project</button>
            <button className="prototype-primary-button" onClick={() => setActivePage("export")}>
              <span>Export Video</span>
              <ExportGlyph />
            </button>
          </div>
        </header>

        <main className="prototype-page-frame">
          {activePage === "workspace" ? (
            <section className="prototype-workspace">
              <div className="prototype-workspace-column prototype-workspace-script">
                <div className="prototype-panel-header">
                  <div>
                    <div className="prototype-mono-label">Scene 04</div>
                    <h2>Story Script</h2>
                  </div>
                  <span className="prototype-status-chip">Draft locked</span>
                </div>

                <div className="prototype-script-block">
                  <span className="prototype-field-label">Scene Heading</span>
                  <div className="prototype-script-heading">
                    EXT. NEO-TOKYO ROOFTOP - NIGHT
                  </div>
                </div>

                <div className="prototype-card">
                  <span className="prototype-field-label">Character Action</span>
                  <p>
                    Kaito stands at the edge of the skyscraper, his neon-blue scarf
                    whipping through the synthetic wind. Below, the city hums in cyan
                    circuits and violet rainfall.
                  </p>
                </div>

                <label className="prototype-field-label" htmlFor="script-beat">
                  Next Beat
                </label>
                <textarea
                  id="script-beat"
                  className="prototype-textarea"
                  placeholder="Write next script beat here..."
                  defaultValue="The surveillance swarm lifts from the alley below. Kaito reaches for the fractured mask, listening for the hidden frequency in the rain."
                />

                <div className="prototype-tag-row">
                  <span className="prototype-tag prototype-tag-cyan">#NEON</span>
                  <span className="prototype-tag prototype-tag-magenta">#CYBERPUNK</span>
                  <span className="prototype-tag prototype-tag-muted">+TAG</span>
                </div>
              </div>

              <div className="prototype-workspace-column prototype-workspace-preview">
                <article className="prototype-preview-stage">
                  <div className="prototype-preview-media">
                    <img src={currentFrame.src} alt={currentFrame.title} />
                    <div className="prototype-preview-overlay" />
                    <div className="prototype-preview-meta">
                      <div>
                        <div className="prototype-preview-title">Scene 04 · The Descent</div>
                        <div className="prototype-preview-subtitle">
                          {generating
                            ? `Generating frame... ${generationProgress}%`
                            : `Processing AI enhancement... ${generationProgress}%`}
                        </div>
                      </div>
                      <div className="prototype-preview-actions">
                        <button className="prototype-preview-icon" aria-label="Play preview">
                          <PlayGlyph />
                        </button>
                        <button className="prototype-preview-icon" aria-label="Open details">
                          <ExportGlyph />
                        </button>
                      </div>
                    </div>
                    {generating ? (
                      <div className="prototype-live-pill">
                        <span className="prototype-live-dot" />
                        Live rendering
                      </div>
                    ) : null}
                  </div>
                </article>

                <section className="prototype-generator-panel">
                  <div className="prototype-generator-header">
                    <div>
                      <div className="prototype-panel-kicker">Visual Prompt Engineering</div>
                      <div className="prototype-panel-copy">
                        Describe cinematic lighting, lens feel, palette, and texture with precise creative control.
                      </div>
                    </div>
                    <div className="prototype-token-pill">Tokens 420 / 1000</div>
                  </div>

                  <textarea
                    className="prototype-textarea prototype-textarea-lg"
                    placeholder="Describe cinematic visual details..."
                    value={visualPrompt}
                    onChange={(event) => setVisualPrompt(event.target.value)}
                  />

                  <div className="prototype-generator-footer">
                    <div className="prototype-progress-track">
                      <div className="prototype-progress-fill" style={{ width: "35%" }} />
                    </div>
                    <button
                      className="prototype-generate-button"
                      onClick={handleGenerate}
                      disabled={!visualPrompt.trim() || generating}
                    >
                      <span>{generating ? "Generating..." : "Generate Frame"}</span>
                      <SparkGlyph />
                    </button>
                  </div>
                </section>

                <section className="prototype-variation-grid">
                  {frameOptions.map((frame) => (
                    <button
                      key={frame.id}
                      className={`prototype-variation-card ${selectedFrame === frame.id ? "prototype-variation-card-active" : ""}`}
                      onClick={() => setSelectedFrame(frame.id)}
                    >
                      <img src={frame.src} alt={frame.title} />
                    </button>
                  ))}
                  <button className="prototype-variation-add">
                    <span className="prototype-add-plus">+</span>
                    <span>Variations</span>
                  </button>
                </section>
              </div>

              <div className="prototype-workspace-column prototype-workspace-controls">
                <div className="prototype-panel-header">
                  <div>
                    <div className="prototype-panel-kicker">Inspector</div>
                    <h2>Scene Controls</h2>
                  </div>
                </div>

                <div className="prototype-control-block">
                  <span className="prototype-field-label">Art Style</span>
                  <div className="prototype-segment-grid">
                    <button className="prototype-segment prototype-segment-active-cyan">
                      Cyber Manga
                    </button>
                    <button className="prototype-segment">Classic Ink</button>
                  </div>
                </div>

                <div className="prototype-control-block">
                  <span className="prototype-field-label">Canvas Format</span>
                  <div className="prototype-segment-grid prototype-segment-grid-3">
                    <button className="prototype-segment">16:9</button>
                    <button className="prototype-segment prototype-segment-active-cyan">9:16</button>
                    <button className="prototype-segment">1:1</button>
                  </div>
                </div>

                <div className="prototype-control-block">
                  <span className="prototype-field-label">AI Parameters</span>
                  <div className="prototype-slider-group">
                    <label>
                      <span>Creativity / Chaos</span>
                      <strong>{creativity.toFixed(2)}</strong>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={creativity}
                      onChange={(event) => setCreativity(Number(event.target.value))}
                    />
                  </div>
                  <div className="prototype-slider-group">
                    <label>
                      <span>Stylization Strength</span>
                      <strong className="prototype-accent-magenta">{stylization.toFixed(2)}</strong>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={stylization}
                      onChange={(event) => setStylization(Number(event.target.value))}
                    />
                  </div>
                </div>

                <div className="prototype-control-block">
                  <span className="prototype-field-label">Prompt Presets</span>
                  <div className="prototype-preset-grid">
                    <button className="prototype-segment">Dramatic Lighting</button>
                    <button className="prototype-segment">Hyper Realism</button>
                    <button className="prototype-segment">Watercolor Texture</button>
                    <button className="prototype-segment">Ghibli Inspired</button>
                  </div>
                </div>

                <button className="prototype-reset-button">Reset Parameters</button>
              </div>
            </section>
          ) : null}

          {activePage === "assets" ? (
            <section className="prototype-assets-page">
              <header className="prototype-assets-header">
                <div>
                  <div className="prototype-assets-title">Asset Library</div>
                  <p className="prototype-assets-copy">
                    Manage your AI-generated manga components. Drag, inspect, and promote any asset into the next assembly pass.
                  </p>
                </div>

                <div className="prototype-filter-tabs">
                  {(["images", "videos", "audio", "characters"] as AssetTab[]).map((tab) => (
                    <button
                      key={tab}
                      className={`prototype-filter-tab ${activeAssetTab === tab ? "prototype-filter-tab-active" : ""}`}
                      onClick={() => setActiveAssetTab(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </header>

              <div className="prototype-assets-toolbar">
                <label className="prototype-search">
                  <span className="prototype-search-icon">
                    <SearchGlyph />
                  </span>
                  <input type="text" placeholder="Search assets, tags, or prompts..." />
                </label>

                <div className="prototype-toolbar-actions">
                  <span className="prototype-toolbar-copy">Sort by: RECENT</span>
                  <div className="prototype-view-toggle">
                    <button
                      className={viewMode === "grid" ? "prototype-view-toggle-active" : ""}
                      onClick={() => setViewMode("grid")}
                    >
                      Grid
                    </button>
                    <button
                      className={viewMode === "list" ? "prototype-view-toggle-active" : ""}
                      onClick={() => setViewMode("list")}
                    >
                      List
                    </button>
                  </div>
                  <button className="prototype-secondary-button prototype-secondary-button-sm">
                    Advanced
                  </button>
                </div>
              </div>

              {activeAssetTab === "audio" ? (
                <div className="prototype-audio-grid">
                  {audioAssets.map((asset) => (
                    <button
                      key={asset.id}
                      className={`prototype-audio-card ${selectedAssets.includes(asset.id) ? "prototype-audio-card-active" : ""}`}
                      onClick={() => toggleAsset(asset.id)}
                    >
                      <div className="prototype-audio-glyph">
                        <WaveGlyph />
                      </div>
                      <div className="prototype-audio-title">{asset.title}</div>
                      <div className="prototype-audio-copy">{asset.subtitle}</div>
                      <div className="prototype-audio-footer">
                        <span>{asset.duration}</span>
                        <span className="prototype-audio-play">
                          <PlayGlyph />
                        </span>
                      </div>
                      <div className="prototype-progress-track prototype-progress-track-sm">
                        <div className="prototype-progress-fill prototype-progress-fill-cyan" style={{ width: "80%" }} />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className={`prototype-assets-grid ${viewMode === "list" ? "prototype-assets-grid-list" : ""}`}>
                  {displayAssets.map((asset, index) => (
                    <button
                      key={asset.id}
                      className={`prototype-asset-card ${index === 0 ? "prototype-asset-card-featured" : ""} ${selectedAssets.includes(asset.id) ? "prototype-asset-card-active" : ""}`}
                      onClick={() => toggleAsset(asset.id)}
                    >
                      {asset.src ? <img src={asset.src} alt={asset.title} /> : null}
                      <div className="prototype-asset-card-body">
                        <div className="prototype-panel-kicker">{asset.label}</div>
                        <div className="prototype-asset-card-title">{asset.title}</div>
                        {asset.subtitle ? (
                          <div className="prototype-asset-card-copy">{asset.subtitle}</div>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {selectedAssets.length > 0 ? (
                <div className="prototype-selection-bar">
                  <div className="prototype-selection-count">{selectedAssets.length}</div>
                  <div className="prototype-selection-copy">Selection</div>
                  <button className="prototype-selection-action">
                    <DuplicateGlyph />
                    Duplicate
                  </button>
                  <button className="prototype-selection-action">
                    <TagGlyph />
                    Tag
                  </button>
                  <button className="prototype-selection-action prototype-selection-action-primary">
                    <SparkGlyph />
                    Upscale Selection
                  </button>
                  <button
                    className="prototype-selection-action prototype-selection-action-danger"
                    onClick={() => setSelectedAssets([])}
                  >
                    <TrashGlyph />
                    Delete
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

          {activePage === "export" ? (
            <section className="prototype-export-page">
              <div className="prototype-export-preview">
                <div className="prototype-export-stage">
                  <img src="/prototype/scene-main.svg" alt="Rendered masterpiece preview" />
                  <div className="prototype-export-badge">
                    <SparkGlyph />
                    Masterpiece rendered
                  </div>
                </div>

                <div className="prototype-player">
                  <div className="prototype-progress-track">
                    <div className="prototype-progress-fill prototype-progress-fill-cyan" style={{ width: "80%" }} />
                  </div>
                  <div className="prototype-player-row">
                    <div className="prototype-player-actions">
                      <button className="prototype-preview-icon">
                        <PlayGlyph />
                      </button>
                      <button className="prototype-preview-icon">
                        <WaveGlyph />
                      </button>
                      <button className="prototype-preview-icon">
                        <ExportGlyph />
                      </button>
                      <span>02:14 / 03:45</span>
                    </div>
                    <div className="prototype-player-actions">
                      <button className="prototype-preview-icon">
                        <SettingsGlyph />
                      </button>
                      <button className="prototype-preview-icon">
                        <BellGlyph />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="prototype-bottom-tabs">
                  <button className="prototype-bottom-tab prototype-bottom-tab-active">Enhance</button>
                  <button className="prototype-bottom-tab">Notes</button>
                  <button className="prototype-bottom-tab">Versions</button>
                  <button className="prototype-bottom-tab">Favorites</button>
                </div>
              </div>

              <aside className="prototype-export-sidebar">
                <div className="prototype-export-summary">
                  <div className="prototype-export-heading">Project Summary</div>
                  <div className="prototype-export-stats">
                    <div>
                      <span className="prototype-field-label">Duration</span>
                      <strong className="prototype-accent-cyan">03:45</strong>
                    </div>
                    <div>
                      <span className="prototype-field-label">File Size</span>
                      <strong className="prototype-accent-magenta">1.24 GB</strong>
                    </div>
                  </div>
                </div>

                <div className="prototype-control-block">
                  <div className="prototype-export-heading prototype-export-heading-sm">Export Settings</div>

                  <div className="prototype-control-block-inner">
                    <span className="prototype-field-label">Format</span>
                    <div className="prototype-segment-grid prototype-segment-grid-3">
                      {(["MP4", "MOV", "WEBM"] as ExportFormat[]).map((item) => (
                        <button
                          key={item}
                          className={`prototype-segment ${format === item ? "prototype-segment-active-cyan" : ""}`}
                          onClick={() => setFormat(item)}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="prototype-control-block-inner">
                    <span className="prototype-field-label">Resolution</span>
                    <div className="prototype-resolution-list">
                      {(["4K", "1080P"] as Resolution[]).map((item) => (
                        <button
                          key={item}
                          className={`prototype-resolution-card ${resolution === item ? "prototype-resolution-card-active" : ""}`}
                          onClick={() => setResolution(item)}
                        >
                          <div>
                            <div className="prototype-resolution-title">
                              {item === "4K" ? "4K Ultra HD" : "1080p Full HD"}
                            </div>
                            <div className="prototype-resolution-copy">
                              {item === "4K" ? "Studio master export for archival and final release" : "Fast review render for client playback"}
                            </div>
                          </div>
                          <span className="prototype-radio">{resolution === item ? "●" : "○"}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="prototype-control-block-inner">
                    <div className="prototype-slider-group">
                      <label>
                        <span>Quality Preset</span>
                        <strong className="prototype-accent-magenta">Studio Master</strong>
                      </label>
                      <input type="range" min="0" max="100" defaultValue="100" />
                    </div>
                  </div>
                </div>

                <div className="prototype-control-block">
                  <div className="prototype-export-heading prototype-export-heading-sm">Share Masterpiece</div>
                  <div className="prototype-share-list">
                    <button className="prototype-share-button">Upload to YouTube</button>
                    <button className="prototype-share-button">Post to TikTok</button>
                    <button className="prototype-share-button">Sync to Bilibili</button>
                  </div>
                </div>

                <div className="prototype-export-cta">
                  {exporting ? (
                    <div className="prototype-export-progress">
                      <div className="prototype-export-progress-row">
                        <span>Exporting...</span>
                        <strong>{exportProgress}%</strong>
                      </div>
                      <div className="prototype-progress-track">
                        <div className="prototype-progress-fill" style={{ width: `${exportProgress}%` }} />
                      </div>
                    </div>
                  ) : null}
                  <button className="prototype-export-button" onClick={handleStartExport} disabled={exporting}>
                    <span>{exporting ? "Exporting..." : "Start High-Speed Export"}</span>
                    <UploadGlyph />
                  </button>
                  <div className="prototype-export-note">Estimated render time: 2m 45s</div>
                </div>
              </aside>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
