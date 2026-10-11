import { useEffect, useRef } from "react";
import { fx } from "../store";

/** A ring that trails the pointer, swells over anything clickable, and reads out the filter while dragging. */
export function Cursor() {
  const ring = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (matchMedia("(pointer: coarse)").matches) return;
    document.body.classList.add("custom-cursor");
    let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y, down = false, overUI = false, id = 0;
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      overUI = !!(e.target as HTMLElement).closest("button, a");
    };
    const pd = () => (down = true);
    const pu = () => (down = false);
    const tick = () => {
      rx += (x - rx) * 0.2;
      ry += (y - ry) * 0.2;
      ring.current!.style.transform = `translate(${rx}px, ${ry}px)`;
      dot.current!.style.transform = `translate(${x}px, ${y}px)`;
      const hover = overUI || fx.pointerOnSign;
      ring.current!.classList.toggle("cursor--hover", hover);
      const dragging = down && !hover;
      ring.current!.classList.toggle("cursor--drag", dragging);
      ring.current!.classList.toggle("cursor--label", !!fx.hoverLabel && !dragging);
      if (fx.hoverLabel && !dragging) label.current!.textContent = fx.hoverLabel;
      else if (dragging) {
        const hz = 80 * Math.pow(2, fx.filter * 8);
        label.current!.textContent = `LPF ${hz >= 1000 ? (hz / 1000).toFixed(1) + "k" : Math.round(hz)}`;
      }
      ring.current!.style.setProperty("--pulse", String(1 + fx.kick * 0.25));
      id = requestAnimationFrame(tick);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerdown", pd);
    addEventListener("pointerup", pu);
    tick();
    return () => {
      cancelAnimationFrame(id);
      removeEventListener("pointermove", move);
      removeEventListener("pointerdown", pd);
      removeEventListener("pointerup", pu);
      document.body.classList.remove("custom-cursor");
    };
  }, []);

  return (
    <>
      <div className="cursor" ref={ring} aria-hidden>
        <span className="cursor__ring" />
        <span className="cursor__label" ref={label} />
      </div>
      <div className="cursor-dot" ref={dot} aria-hidden />
    </>
  );
}
