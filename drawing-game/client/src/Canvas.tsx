import React, { useEffect, useRef } from "react";
import type {
  CanvasProps,
  CanvasSnapshot,
  DrawingPoint,
  ReplayData,
  Stroke,
} from "./types";

export function paint(canvas: HTMLCanvasElement, strokes: Stroke[]) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const stroke of strokes) {
    context.strokeStyle = stroke.tool === "eraser" ? "#ffffff" : stroke.color;
    context.fillStyle = context.strokeStyle;
    context.lineWidth = stroke.size * canvas.width;
    context.lineCap = "round";
    context.lineJoin = "round";
    const first = stroke.points[0];
    if (!first) continue;
    context.beginPath();
    context.arc(
      first.x * canvas.width,
      first.y * canvas.height,
      context.lineWidth / 2,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.beginPath();
    context.moveTo(first.x * canvas.width, first.y * canvas.height);
    for (const point of stroke.points.slice(1))
      context.lineTo(point.x * canvas.width, point.y * canvas.height);
    context.stroke();
  }
}

export default function Canvas({
  socket,
  canDraw,
  color,
  size,
  tool,
  controls,
  snapshot,
}: CanvasProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const pointer = useRef<number | null>(null);
  const options = useRef({ canDraw, color, size, tool });
  options.current = { canDraw, color, size, tool };
  const redraw = () => {
    if (canvas.current) paint(canvas.current, strokes.current);
  };

  useEffect(() => {
    strokes.current = snapshot?.strokes || [];
    current.current = null;
    redraw();
  }, [snapshot]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const resize = () => {
      const ratio = Math.min(devicePixelRatio || 1, 2);
      element.width = Math.round(element.clientWidth * ratio);
      element.height = Math.round(element.clientHeight * ratio);
      redraw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    const handlers = {
      draw_start: (data: DrawingPoint) => {
        current.current = { ...data, points: [{ x: data.x, y: data.y }] };
        strokes.current.push(current.current);
        redraw();
      },
      draw_move: (data: DrawingPoint) => {
        if (current.current) {
          current.current.points.push({ x: data.x, y: data.y });
          redraw();
        }
      },
      draw_end: () => {
        current.current = null;
      },
      clear_canvas: () => {
        strokes.current = [];
        current.current = null;
        pointer.current = null;
        redraw();
      },
      undo_drawing: () => {
        strokes.current.pop();
        current.current = null;
        redraw();
      },
      canvas_snapshot: (data: CanvasSnapshot) => {
        strokes.current = data.strokes;
        current.current = null;
        redraw();
      },
    };
    Object.entries(handlers).forEach(([event, handler]) =>
      socket.on(event, handler),
    );
    controls.current = {
      clear: () => {
        handlers.clear_canvas();
        socket.emit("clear_canvas");
      },
      undo: () => {
        handlers.undo_drawing();
        socket.emit("undo_drawing");
      },
    };
    resize();
    return () => {
      observer.disconnect();
      Object.entries(handlers).forEach(([event, handler]) =>
        socket.off(event, handler),
      );
      controls.current = null;
    };
  }, [socket]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  }
  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (
      !options.current.canDraw ||
      event.button > 0 ||
      pointer.current !== null
    )
      return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = event.pointerId;
    const data = {
      ...point(event),
      color: options.current.color,
      size: options.current.size / event.currentTarget.clientWidth,
      tool: options.current.tool,
    };
    current.current = { ...data, points: [{ x: data.x, y: data.y }] };
    strokes.current.push(current.current);
    socket.emit("draw_start", data);
    redraw();
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (
      !options.current.canDraw ||
      pointer.current !== event.pointerId ||
      !current.current
    )
      return;
    const data = point(event);
    if (current.current.points.length >= 5000) return;
    current.current.points.push(data);
    socket.emit("draw_move", {
      ...data,
      color: current.current.color,
      size: current.current.size,
      tool: current.current.tool,
    });
    redraw();
  }
  function end(event: React.PointerEvent<HTMLCanvasElement>) {
    if (pointer.current !== event.pointerId) return;
    if (options.current.canDraw) socket.emit("draw_end", { x: 0, y: 0 });
    pointer.current = null;
    current.current = null;
  }
  return (
    <canvas
      ref={canvas}
      data-testid="drawing-canvas"
      aria-label={canDraw ? "Drawing canvas" : "Live drawing"}
      className={canDraw ? "can-draw" : ""}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    />
  );
}

export function ReplayCanvas({
  replay,
  progress,
}: {
  replay: ReplayData;
  progress: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const redraw = () => {
      element.width = Math.round(
        element.clientWidth * Math.min(devicePixelRatio || 1, 2),
      );
      element.height = Math.round(
        element.clientHeight * Math.min(devicePixelRatio || 1, 2),
      );
      let remaining = Math.ceil(
        (replay.strokes.reduce(
          (count, stroke) => count + stroke.points.length,
          0,
        ) *
          progress) /
          100,
      );
      const visible: Stroke[] = [];
      for (const stroke of replay.strokes) {
        if (remaining <= 0) break;
        visible.push({ ...stroke, points: stroke.points.slice(0, remaining) });
        remaining -= stroke.points.length;
      }
      paint(element, visible);
    };
    const observer = new ResizeObserver(redraw);
    observer.observe(element);
    redraw();
    return () => observer.disconnect();
  }, [replay, progress]);
  return <canvas ref={canvas} aria-label="Last round drawing replay" />;
}
