type SiteMarkProps = { name: string; className?: string };

export function SiteMark({ name, className = "" }: SiteMarkProps) {
  return (
    <span className={`site-mark ${className}`}>
      <span className="site-mark__dot" aria-hidden="true" />
      {name}
    </span>
  );
}
