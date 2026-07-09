// IronHero Signet - Pure icon symbol without text
const FridaySignet = ({ size = 40 }: { size?: number }) => {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="8" fill="#4F46E5"/>
      <text x="20" y="27" textAnchor="middle" fontFamily="Arial, sans-serif"
            fontSize="28" fontWeight="bold" fill="white">F</text>
    </svg>
  );
};

export { FridaySignet };
export default FridaySignet;
