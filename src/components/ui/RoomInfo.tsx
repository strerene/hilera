import { createSignal } from "solid-js";

/**
 * Room id tucked behind an info button. Players share the invite link, so the
 * raw id is only useful for debugging or a manual join — it doesn't need to
 * take up header space (and a UUID is too wide to sit next to the controls).
 */
export default function RoomInfo(props: { roomId: string }) {
  let dialog: HTMLDialogElement | undefined;
  const [copied, setCopied] = createSignal(false);

  const copy = async () => {
    await navigator.clipboard.writeText(props.roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <button
        type="button"
        class="btn btn-quiet btn-sm"
        title="Show room id"
        aria-label="Show room id"
        onClick={() => dialog?.showModal()}
      >
        Info
      </button>
      <dialog ref={dialog} class="modal">
        <div class="modal-box">
          <h3 class="font-display text-xl uppercase">Room id</h3>
          <p class="mt-2 text-sm opacity-70">
            Share the invite link instead — the id is only needed for a manual
            join or debugging.
          </p>
          <p class="mt-4 break-all rounded-md border-2 border-ink bg-base-200 p-3 font-mono text-sm">
            {props.roomId}
          </p>
          <div class="modal-action">
            <form method="dialog">
              <button class="btn btn-ghost" type="submit">
                Close
              </button>
            </form>
            <button class="btn btn-primary" type="button" onClick={copy}>
              {copied() ? "Copied!" : "Copy id"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
