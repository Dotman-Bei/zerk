"use client";

import { useEffect, useRef } from "react";

type Props = {
  /** Distance between nodes, in CSS pixels. */
  spacing?: number;
  /** How far the cursor's influence reaches, in CSS pixels. */
  radius?: number;
  /** Length of a fully extended stroke. */
  maxLength?: number;
  className?: string;
};

/**
 * A field of dots that lean into short strokes pointing at the cursor.
 *
 * Resting nodes stay dots — texture, carrying nothing — and only resolve into legible marks where
 * the pointer reaches, which is the same reveal-on-approach idea the Boundary section describes in
 * words. Monochrome by design: colour here would break the five-greys palette.
 *
 * The canvas is pointer-events-none and reads the pointer from window coordinates, so anything
 * layered above it stays fully interactive. It measures itself rather than its parent, so it can be
 * positioned full-bleed inside a width-constrained section.
 */
export function InteractiveDotGrid({
  spacing = 30,
  radius = 200,
  maxLength = 15,
  className = "",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const target = useRef({ x: -9999, y: -9999 });
  const eased = useRef({ x: -9999, y: -9999 });
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;

    // Only the backing store is sized here; CSS owns the display size, which keeps the element
    // free to be laid out full-bleed by its caller.
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const paint = (px: number, py: number) => {
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = "round";
      ctx.lineWidth = 1.1;

      for (let x = spacing / 2; x < width; x += spacing) {
        for (let y = spacing / 2; y < height; y += spacing) {
          const dx = px - x;
          const dy = py - y;
          const pull = Math.max(0, 1 - Math.hypot(dx, dy) / radius);

          if (pull <= 0.002) {
            ctx.fillStyle = "rgba(255,255,255,0.09)";
            ctx.fillRect(x - 0.55, y - 0.55, 1.1, 1.1);
            continue;
          }

          // Squaring the falloff keeps the extended strokes gathered tightly around the cursor
          // instead of smearing across the whole field.
          const t = pull * pull;
          const angle = Math.atan2(dy, dx);
          const hx = (Math.cos(angle) * maxLength * t) / 2;
          const hy = (Math.sin(angle) * maxLength * t) / 2;

          ctx.strokeStyle = `rgba(255,255,255,${0.09 + t * 0.5})`;
          ctx.beginPath();
          ctx.moveTo(x - hx, y - hy);
          ctx.lineTo(x + hx, y + hy);
          ctx.stroke();
        }
      }
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const observer = new ResizeObserver(() => {
      resize();
      if (reduced) paint(-9999, -9999);
    });
    observer.observe(canvas);
    resize();

    // Reduced motion gets the resting field: texture, no chase.
    if (reduced) {
      paint(-9999, -9999);
      return () => observer.disconnect();
    }

    const onMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      target.current.x = event.clientX - rect.left;
      target.current.y = event.clientY - rect.top;
    };

    const loop = () => {
      // Easing toward the pointer makes the strokes settle rather than snap.
      eased.current.x += (target.current.x - eased.current.x) * 0.11;
      eased.current.y += (target.current.y - eased.current.y) * 0.11;
      paint(eased.current.x, eased.current.y);
      frame.current = requestAnimationFrame(loop);
    };

    window.addEventListener("mousemove", onMove);
    frame.current = requestAnimationFrame(loop);

    return () => {
      observer.disconnect();
      window.removeEventListener("mousemove", onMove);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [spacing, radius, maxLength]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 ${className}`}
    />
  );
}
