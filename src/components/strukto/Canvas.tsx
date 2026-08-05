import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const MIN = 0.3;
const MAX = 2.5;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function useCanvasView() {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);
  const zoomBy = useCallback((factor: number) => setZoom((z) => clamp(z * factor, MIN, MAX)), []);
  return { zoom, setZoom, offset, setOffset, reset, zoomBy };
}

export type CanvasView = ReturnType<typeof useCanvasView>;

export function Canvas({ view, children }: { view: CanvasView; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const state = useRef(view);
  state.current = view;
  const pan = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { zoom, offset, setZoom, setOffset } = state.current;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
        const next = clamp(zoom * Math.exp(-dy * 0.002), MIN, MAX);
        const rect = el.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const k = next / zoom;
        setOffset({ x: px - (px - offset.x) * k, y: py - (py - offset.y) * k });
        setZoom(next);
      } else if (e.shiftKey) {
        e.preventDefault();
        setOffset({ x: offset.x - e.deltaY, y: offset.y });
      } else {
        e.preventDefault();
        setOffset({ x: offset.x - e.deltaX, y: offset.y - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={ref}
      className="bg-canvas relative flex-1 overflow-hidden"
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        if (e.button !== 1 && !(e.button === 0 && e.target === e.currentTarget)) return;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        pan.current = { x: e.clientX, y: e.clientY, ox: view.offset.x, oy: view.offset.y };
      }}
      onPointerMove={(e) => {
        if (!pan.current) return;
        view.setOffset({
          x: pan.current.ox + (e.clientX - pan.current.x),
          y: pan.current.oy + (e.clientY - pan.current.y),
        });
      }}
      onPointerUp={() => (pan.current = null)}
      onPointerLeave={() => (pan.current = null)}
    >
      <div
        className="absolute top-0 left-0 origin-top-left p-8"
        style={{ transform: `translate(${view.offset.x}px, ${view.offset.y}px) scale(${view.zoom})` }}
      >
        {children}
      </div>
    </div>
  );
}
