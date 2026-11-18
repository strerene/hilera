import { Title } from "@solidjs/meta";
import { useSearchParams } from "@solidjs/router";
import { createSignal, onSettled, Show } from "solid-js";
import ClientRoom from "~/components/ClientRoom";
import HostRoom from "~/components/HostRoom";
import { createRoom, getRoom, isHostSession, type RoomHandle } from "~/lib/p2p";
import { appPath } from "~/lib/paths";

export default function RoomRoute() {
  const [searchParams] = useSearchParams<{ id?: string }>();
  const roomId = () => searchParams.id ?? "";
  // `undefined` = session not read yet. The room lives in a browser session
  // (module singleton + sessionStorage), so it cannot be known while the app
  // renders on the server: the prerendered /room HTML — and the first client
  // render that hydrates it — show the unresolved branch, and the real one
  // mounts from onSettled. Keeping this branch free of `roomId` is what makes
  // one prerendered file correct for every `?id=`.
  const [room, setRoom] = createSignal<RoomHandle | null | undefined>(undefined);
  const [restoring, setRestoring] = createSignal(false);
  const [failed, setFailed] = createSignal(false);

  onSettled(() => {
    const existing = getRoom();
    setRoom(existing);
    // Reloaded host tab: the in-memory room is gone, but it can be
    // reclaimed under the same peer id so clients reconnect seamlessly.
    if (roomId() && !existing && isHostSession(roomId())) {
      setRestoring(true);
      createRoom(roomId())
        .then((r) => {
          if (r.roomId === roomId()) setRoom(r);
          else setFailed(true);
        })
        .catch(() => setFailed(true))
        .finally(() => setRestoring(false));
    }
  });

  return (
    <main class="flex min-h-dvh items-center justify-center p-4">
      <Title>Hilera</Title>
      <Show
        when={room() !== undefined}
        fallback={
          <p class="flex items-center gap-2">
            <span class="loading loading-spinner" /> Loading room…
          </p>
        }
      >
        <Show
          when={!failed()}
          fallback={
            <div class="alert alert-error">
              <span>
                This room is no longer available.{" "}
                <a class="link" href={appPath("/")}>Create a new room</a>.
              </span>
            </div>
          }
        >
          <Show
            when={room() && room()!.roomId === roomId()}
            fallback={
              <Show
                when={restoring()}
                fallback={<ClientRoom roomId={roomId()} />}
              >
                <p class="flex items-center gap-2">
                  <span class="loading loading-spinner" /> Restoring room…
                </p>
              </Show>
            }
          >
            <HostRoom roomId={roomId()} peer={room()!.peer} />
          </Show>
        </Show>
      </Show>
    </main>
  );
}
