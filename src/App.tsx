import { Title } from "@solidjs/meta";
import { Router } from "~/router";
import "./app.css";

/**
 * Application root. It is rendered on the server during the build-time crawl and
 * hydrated in the browser, so it must stay free of browser-only reads.
 *
 * The router's render prop plays the role SolidStart's `root` prop used to: it
 * wraps every route with the shared `<Title>` and the matched page.
 *
 * `MetaProvider` is gone in @solidjs/meta 2: head tags register themselves.
 */
export default function App() {
  return (
    <Router>
      {(props) => (
        <>
          <Title>Hilera</Title>
          {props.children}
        </>
      )}
    </Router>
  );
}
