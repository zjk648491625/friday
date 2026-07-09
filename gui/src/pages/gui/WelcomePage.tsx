// Friday AI Welcome Page
import { T } from "../../util/i18n";
import welcomeSvgRaw from "./welcome.svg?raw";

const features = [
  {
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
        <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    key: "Welcome to the world of vibe coding",
  },
  {
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none">
        <path d="M13 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3" />
      </svg>
    ),
    key: "Accelerate coding with AI",
  },
  {
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="3" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 10h6M10 7v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    key: "Prototype in minutes",
  },
  {
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 12l2-4 3 2 3-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="10" cy="10" r="2" fill="currentColor" opacity="0.3" />
      </svg>
    ),
    key: "Understand your codebase with ease",
  },
];

export function WelcomePage() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-6">
      {/* AI Avatar */}
      <div className="mb-8">
        <FridayAvatar />
      </div>

      {/* Title */}
      <h1 className="mb-2 text-center text-2xl font-bold text-foreground tracking-tight">
        {T("Build with Friday")}
      </h1>

      {/* Subtitle */}
      <p className="mb-10 text-center text-sm text-description max-w-md leading-relaxed">
        {T("Requirement breakdown, plan creation, build apps from 0 to 1.")}
      </p>

      {/* Feature Grid */}
      <div className="grid w-full max-w-lg grid-cols-2 gap-3">
        {features.map((feature) => (
          <div
            key={feature.key}
            className="group flex items-start gap-3 rounded-lg border border-list-border bg-vsc-input-background/50 p-4 transition-all duration-200 hover:border-indigo-500/30 hover:bg-indigo-500/[0.04]"
          >
            <span className="mt-0.5 flex-shrink-0 text-indigo-400 group-hover:text-indigo-300 transition-colors">
              {feature.icon}
            </span>
            <span className="text-xs text-description leading-relaxed group-hover:text-foreground/80 transition-colors">
              {T(feature.key)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Iron Man / Friday high-tech animated avatar (embedded inline for JCEF webview) */
function FridayAvatar() {
  return (
    <div
      className="relative flex items-center justify-center drop-shadow-[0_0_24px_rgba(79,70,229,0.3)]"
      style={{ width: 200, height: 200 }}
      dangerouslySetInnerHTML={{ __html: wrapSvg(welcomeSvgRaw, 200) }}
    />
  );
}

/** Wrap raw SVG string with proper sizing attributes */
function wrapSvg(svg: string, size: number): string {
  return svg.replace(
    /<svg/,
    `<svg width="${size}" height="${size}"`,
  );
}
