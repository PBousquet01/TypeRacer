import Image from "next/image";

export const SITE_NAME = "CHOCOBO RACE";

export default function Wordmark({ size = 13 }: { size?: number }) {
  const [first, ...rest] = SITE_NAME.split(" ");
  const logo = Math.round(size * 2.2);
  return (
    <span className="inline-flex items-center gap-2.5 font-display leading-[1.4] text-strong" style={{ fontSize: size }}>
      <Image src="/logo.png" alt="" width={logo} height={logo} className="shrink-0" priority aria-hidden="true" />
      <span>
        {first}
        {rest.length > 0 && <span className="text-accent"> {rest.join(" ")}</span>}
      </span>
    </span>
  );
}
