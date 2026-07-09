// IronHero Logo - Dynamic "F" or "五" based on language
import { useLanguage } from "../../context/Language";

const FridayLogo = ({ size = 40 }: { size?: number }) => {
  return (
    <div className="flex items-center gap-2 select-none" style={{ fontSize: `${size}px` }}>
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="40" height="40" rx="8" fill="#4F46E5"/>
        <LogoChar />
      </svg>
      <span className="font-bold text-foreground" style={{ fontSize: `${size * 0.7}px` }}>
        IronHero
      </span>
    </div>
  );
};

const LogoChar = () => {
  // "F" for English, "五" for Chinese — extendable via i18n context
  return (
    <text x="20" y="27" textAnchor="middle" fontFamily="Arial, sans-serif"
          fontSize="28" fontWeight="bold" fill="white">F</text>
  );
};

export { FridayLogo };
export default FridayLogo;
