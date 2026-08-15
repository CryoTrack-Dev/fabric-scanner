export function ValidationBadge({ isValid }: { isValid: boolean }) {
  return (
    <span
      className={
        isValid
          ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400"
          : "rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400"
      }
    >
      {isValid ? "Valid" : "Invalid"}
    </span>
  );
}
