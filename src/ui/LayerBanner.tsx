import { useStore } from "../store";

/** DJ feedback: when a layer lands, a full-width editorial banner sweeps across in its colour. */
export function LayerBanner() {
  const banner = useStore((s) => s.banner);
  if (!banner) return null;
  return (
    <div
      key={banner.n}
      className={`banner ${banner.big ? "banner--big" : ""}`}
      style={{ "--c": banner.color } as React.CSSProperties}
      aria-live="polite"
    >
      <div className="banner__flash" />
      <p className="banner__text">{banner.text}</p>
    </div>
  );
}
