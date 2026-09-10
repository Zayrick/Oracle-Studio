import { cn } from "@/lib/utils";

export function TextPopIn({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <span className={cn("whitespace-nowrap", className)}>
      <span className="sr-only">{text}</span>
      <span key={text} aria-hidden="true">
        {Array.from(text).map((character, index) => (
          <span
            key={index}
            className="text-pop-in-character"
            style={{ animationDelay: `${Math.min(index, 2) * 70}ms` }}
          >
            {character}
          </span>
        ))}
      </span>
    </span>
  );
}
