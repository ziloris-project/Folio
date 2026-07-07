"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Lock, Loader2, X } from "lucide-react";
import { useEditor } from "@/lib/store";

/**
 * Shown when an opened PDF is encrypted. Lets the user type the password and
 * retry; wrong attempts keep the dialog open with an inline error.
 */
export function PasswordPrompt() {
  const name = useEditor((s) => s.pendingLoad?.name ?? "this PDF");
  const passwordError = useEditor((s) => s.passwordError);
  const busy = useEditor((s) => s.status === "loading");
  const submitPassword = useEditor((s) => s.submitPassword);
  const cancelPassword = useEditor((s) => s.cancelPassword);
  const [pw, setPw] = useState("");

  return (
    <Dialog.Root open onOpenChange={(open) => !open && cancelPassword()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[400px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-panel p-5 shadow-2xl">
          <div className="mb-1 flex items-center justify-between">
            <Dialog.Title className="flex items-center gap-2 text-base font-medium">
              <Lock className="h-4 w-4 text-accent" /> Password required
            </Dialog.Title>
            <Dialog.Close className="text-muted hover:text-foreground" aria-label="Cancel">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <p className="mb-4 truncate text-sm text-muted">
            Enter the password to open <span className="text-foreground">{name}</span>.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pw && !busy) void submitPassword(pw);
            }}
          >
            <input
              type="password"
              autoFocus
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Password"
              className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            />
            {passwordError && <p className="mt-2 text-sm text-red-400">{passwordError}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelPassword}
                className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!pw || busy}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:brightness-110 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Unlock
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
