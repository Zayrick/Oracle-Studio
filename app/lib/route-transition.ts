let manualBackTargetIndex: number | null = null;

export function markManualRouteBackTransition(targetIndex: number) {
  manualBackTargetIndex = targetIndex;
}

export function consumeManualRouteBackTransition(currentIndex: number) {
  const shouldAnimate = manualBackTargetIndex === currentIndex;

  manualBackTargetIndex = null;
  return shouldAnimate;
}
