import { flushSync } from "react-dom";

type ViewTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void) => ViewTransition;
};

export function runDivinationViewTransition(update: () => void) {
  if (typeof document === "undefined") {
    update();
    return;
  }

  const viewTransitionDocument = document as ViewTransitionDocument;

  if (!viewTransitionDocument.startViewTransition) {
    update();
    return;
  }

  document.documentElement.dataset.divinationTransition = "active";

  const transition = viewTransitionDocument.startViewTransition(() => {
    flushSync(update);
  });

  transition.finished.finally(() => {
    delete document.documentElement.dataset.divinationTransition;
  });
}
