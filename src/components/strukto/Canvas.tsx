import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { readPayload } from "./Diagram";

const MIN = 0.3;
const MAX = 2.5;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function useCanvasView() {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;

  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);
  const zoomBy = useCallback((factor: number) => setZoom((z) => clamp(z * factor, MIN, MAX)), []);

  /** Scale + center the diagram so the whole thing fits the visible canvas. */
  const fit = useCallback(() => {
    const c = containerRef.current;
    const ct = contentRef.current;
    if (!c || !ct) return;
    const cr = c.getBoundingClientRect();
    const br = ct.getBoundingClientRect();
    const w = br.width / zoomRef.current;
    const h = br.height / zoomRef.current;
    if (!w || !h) return;
    const pad = 24;
    const next = clamp(Math.min((cr.width - pad * 2) / w, (cr.height - pad * 2) / h), MIN, MAX);
    setZoom(next);
    setOffset({
      x: Math.max(pad, (cr.width - w * next) / 2),
      y: Math.max(pad, (cr.height - h * next) / 2),
    });
  }, []);

  return { zoom, setZoom, offset, setOffset, reset, zoomBy, fit, containerRef, contentRef };
}

export type CanvasView = ReturnType<typeof useCanvasView>;

export function Canvas({
  view,
  children,
  onDropFunction,
}: {
  view: CanvasView;
  children: ReactNode;
  /** Called when a function from the sidebar is dropped on empty canvas. */
  onDropFunction?: (id: string) => void;
}) {
  const ref = view.containerRef;
  const state = useRef(view);
  state.current = view;
  const pan = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{
    dist: number;
    zoom: number;
    cx: number;
    cy: number;
    ox: number;
    oy: number;
  } | null>(null);

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
  }, [ref]);

  const endPointer = (id: number) => {
    pointers.current.delete(id);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) pan.current = null;
  };

  return (
    <div
      ref={ref}
      className="bg-canvas relative flex-1 overflow-hidden"
      style={{ touchAction: "none" }}
      onDragOver={(e) => {
        if ((e.target as HTMLElement).closest("[data-diagram-function]")) return;
        if (e.dataTransfer.types.includes("application/x-strukto")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        if ((e.target as HTMLElement).closest("[data-diagram-function]")) return;
        const payload = readPayload(e);
        if (payload?.type !== "fnref") return;
        e.preventDefault();
        onDropFunction?.(payload.funcId);
      }}
      onPointerDown={(e) => {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) {
          // two-finger pinch/pan start
          const [a, b] = [...pointers.current.values()];
          const container = ref.current;
          if (!a || !b || !container) return;
          const rect = container.getBoundingClientRect();
          pinch.current = {
            dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
            zoom: view.zoom,
            cx: (a.x + b.x) / 2 - rect.left,
            cy: (a.y + b.y) / 2 - rect.top,
            ox: view.offset.x,
            oy: view.offset.y,
          };
          pan.current = null;
          return;
        }
        const touch = e.pointerType !== "mouse";
        // pan from anywhere that isn't a diagram (the content wrapper fills the gaps between them)
        const background = !(e.target as HTMLElement).closest("[data-diagram-function]");
        if (e.button !== 1 && !((e.button === 0 || touch) && background)) return;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        pan.current = { x: e.clientX, y: e.clientY, ox: view.offset.x, oy: view.offset.y };
      }}
      onPointerMove={(e) => {
        if (pointers.current.has(e.pointerId))
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch.current && pointers.current.size >= 2) {
          const [a, b] = [...pointers.current.values()];
          if (!a || !b) return;
          const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
          const p = pinch.current;
          const next = clamp((p.zoom * dist) / p.dist, MIN, MAX);
          const k = next / p.zoom;
          view.setZoom(next);
          view.setOffset({ x: p.cx - (p.cx - p.ox) * k, y: p.cy - (p.cy - p.oy) * k });
          return;
        }
        if (!pan.current) return;
        view.setOffset({
          x: pan.current.ox + (e.clientX - pan.current.x),
          y: pan.current.oy + (e.clientY - pan.current.y),
        });
      }}
      onPointerUp={(e) => endPointer(e.pointerId)}
      onPointerCancel={(e) => endPointer(e.pointerId)}
      onPointerLeave={(e) => endPointer(e.pointerId)}
    >
      <div
        ref={view.contentRef}
        className="absolute top-0 left-0 w-max origin-top-left p-8"
        style={{
          transform: `translate(${view.offset.x}px, ${view.offset.y}px) scale(${view.zoom})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
