import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { HttpStatusCode } from "@solidjs/start";
import { MemphisBackdrop } from "~/components/ui/Memphis";

export default function NotFound() {
  return (
    <main class="page">
      <Title>Not Found — Sequence</Title>
      <HttpStatusCode code={404} />
      <MemphisBackdrop />
      <div class="page-inner flex min-h-[70dvh] flex-col items-start justify-center">
        <span class="badge badge-warning badge-lg font-mono">404</span>
        <h1 class="page-title">Lost the board</h1>
        <p class="mt-4 max-w-xl text-lg font-medium leading-relaxed">
          This page doesn't exist. The room may have expired, or the link was
          mistyped.
        </p>
        <A class="btn btn-primary mt-8" href="/">
          Back to the game
        </A>
      </div>
    </main>
  );
}
