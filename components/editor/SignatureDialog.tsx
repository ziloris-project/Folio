"use client";

import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Eraser, X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (dataUrl: string, width: number, height: number) => void;
}

const W = 520;
const H = 200;

export function SignatureDialog({ open, onOpenChange, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  const [color, setColor] = useState("#111827");

  function ctx() {
    return canvasRef.current?.getContext("2d") ?? null;
  }

  function pos(e: React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function down(e: React.PointerEvent) {
    const c = ctx();
    if (!c) return;
    drawing.current = true;
    setEmpty(false);
    const { x, y } = pos(e);
    c.strokeStyle = color;
    c.lineWidth = 2.5;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(x, y);
    canvasRef.current!.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const c = ctx();
    if (!c) return;
    const { x, y } = pos(e);
    c.lineTo(x, y);
    c.stroke();
  }
  function up() {
    drawing.current = false;
  }

  function clear() {
    ctx()?.clearRect(0, 0, W, H);
    setEmpty(true);
  }

  function confirm() {
    const canvas = canvasRef.current;
    if (!canvas || empty) return;
    onConfirm(canvas.toDataURL("image/png"), W, H);
    clear();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-panel p-5 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-base font-medium">Draw your signature</Dialog.Title>
            <Dialog.Close className="text-muted hover:text-foreground"><X className="h-4 w-4" /></Dialog.Close>
          </div>

          <div className="rounded-lg bg-white" style={{ width: W, height: H }}>
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              className="touch-none rounded-lg"
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerLeave={up}
            />
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {["#111827", "#1d4ed8", "#b91c1c"].map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="h-6 w-6 rounded-full ring-1 ring-border"
                  style={{ background: c, outline: color === c ? "2px solid var(--accent)" : "none", outlineOffset: 1 }}
                />
              ))}
              <button onClick={clear} className="ml-2 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
                <Eraser className="h-4 w-4" /> Clear
              </button>
            </div>
            <button
              onClick={confirm}
              disabled={empty}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:brightness-110 disabled:opacity-50"
            >
              Place signature
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
