import { flushSync } from "react-dom";

type ViewTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void) => ViewTransition;
};

let activeDivinationTransition: ViewTransition | undefined;

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
  activeDivinationTransition = transition;

  transition.finished
    .finally(() => {
      if (activeDivinationTransition === transition) {
        activeDivinationTransition = undefined;
        delete document.documentElement.dataset.divinationTransition;
      }
    })
    .catch(() => undefined);
}
