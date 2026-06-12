export type CircularProgressProps = {
  percentage: number;
};

export function CircularProgress({ percentage }: CircularProgressProps) {
  const clamped = Math.min(Math.max(percentage, 0), 100);
  const circumference = 100;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <svg viewBox="0 0 36 36" className="h-6 w-6">
      <circle
        cx="18"
        cy="18"
        r="15.9155"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeOpacity={0.1}
      />
      <circle
        cx="18"
        cy="18"
        r="15.9155"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}
