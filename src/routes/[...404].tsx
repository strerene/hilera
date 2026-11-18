import { Title } from "@solidjs/meta";
import { MemphisBackdrop } from "~/components/ui/Memphis";
import { appPath } from "~/lib/paths";

export default function NotFound() {
  return (
    <main class="page">
      <Title>Not Found — Hilera</Title>
      <MemphisBackdrop />
      <div class="page-inner flex min-h-[70dvh] flex-col items-start justify-center">
        <span class="badge badge-warning badge-lg font-mono">404</span>
        <h1 class="page-title">Lost the board</h1>
        <p class="mt-4 max-w-xl text-lg font-medium leading-relaxed">
          This page doesn't exist. The room may have expired, or the link was
          mistyped.
        </p>
        <a class="btn btn-primary mt-8" href={appPath("/")}>
          Back to the game
        </a>
      </div>
    </main>
  );
}
