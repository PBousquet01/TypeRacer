/* eslint-disable @next/next/no-img-element -- the photo comes from our own API, already resized */
import { cn } from "@/lib/cn";

/**
 * A rider's face: their profile photo (AUTH-04), or a generated avatar from
 * their initials when they have none. The colour is picked from the name, so
 * the same rider always gets the same one.
 */
export default function Avatar({ name, url, size = 40, alt }: { name: string; url?: string | null; size?: number; alt?: string }) {
  const style = { width: size, height: size };
  if (url) return <img src={url} alt={alt ?? ""} width={size} height={size} className="rounded-full object-cover" style={style} />;

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]?.toUpperCase())
    .join("");
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      role="img"
      aria-label={alt ?? name}
      className={cn("grid flex-none place-items-center rounded-full font-display text-ink")}
      style={{ ...style, background: `var(--series-${(hash % 8) + 1})`, fontSize: Math.round(size * 0.36) }}
    >
      {initials || "?"}
    </span>
  );
}
