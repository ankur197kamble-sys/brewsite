import type { ReactNode } from "react";
import { Reveal } from "./reveal";

type SectionIntroProps = {
  eyebrow: string;
  title: ReactNode;
  /** Supporting copy set beside or beneath the heading. */
  lede?: ReactNode;
  className?: string;
  eyebrowClassName?: string;
  titleClassName?: string;
};

/** Shared eyebrow + display heading used to open every section. */
export function SectionIntro({
  eyebrow,
  title,
  lede,
  className = "",
  eyebrowClassName = "text-[#756a60]",
  titleClassName = "display-md",
}: SectionIntroProps) {
  return (
    <Reveal className={className}>
      <p className={`eyebrow mb-6 ${eyebrowClassName}`}>{eyebrow}</p>
      <h2 className={`font-display ${titleClassName}`}>{title}</h2>
      {lede && <div className="lede mt-7 max-w-md">{lede}</div>}
    </Reveal>
  );
}
