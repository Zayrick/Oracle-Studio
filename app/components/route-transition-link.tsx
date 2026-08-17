import type { MouseEvent } from "react";
import { Link, type LinkProps, useNavigate } from "react-router";

type TransitionLinkProps = Omit<LinkProps, "viewTransition">;

export function TransitionLink(props: TransitionLinkProps) {
  return <Link {...props} viewTransition />;
}

export function TransitionBackLink({
  onClick,
  ...props
}: TransitionLinkProps) {
  const navigate = useNavigate();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);

    if (!isPlainLeftClick(event) || getRouterHistoryIndex() <= 0) {
      return;
    }

    event.preventDefault();
    void navigate(-1);
  };

  return <Link {...props} replace viewTransition onClick={handleClick} />;
}

function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function getRouterHistoryIndex() {
  const index = window.history.state?.idx;
  return typeof index === "number" ? index : 0;
}
