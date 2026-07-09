// Friday AI — 语言切换按钮
import { useLanguage } from "../context/Language";

export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage();
  const isZh = language === "zh";

  return (
    <button
      onClick={() => setLanguage(isZh ? "en" : "zh")}
      className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-description hover:bg-list-hover hover:text-foreground transition-colors"
      title={isZh ? "Switch to English" : "切换到中文"}
    >
      <span className="text-sm">{isZh ? "🇨🇳" : "🇺🇸"}</span>
      <span className="truncate">{isZh ? "中文" : "English"}</span>
    </button>
  );
}
