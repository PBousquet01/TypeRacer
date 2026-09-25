export const SITE_NAME = "CHOCOBO RACE";

export default function Wordmark({ size = 13 }: { size?: number }) {
  const [first, ...rest] = SITE_NAME.split(" ");
  return (
    <span className="inline-flex items-center gap-2.5 font-display leading-[1.4] text-strong" style={{ fontSize: size }}>
      <span className="size-[1.1em] border-2 border-edge bg-accent" aria-hidden="true" />
      <span>
        {first}
        {rest.length > 0 && <span className="text-accent"> {rest.join(" ")}</span>}
      </span>
    </span>
  );
}
