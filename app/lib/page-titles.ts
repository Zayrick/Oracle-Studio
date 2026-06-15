export const SITE_TITLE = "云占";

export const PAGE_TITLES = {
  home: SITE_TITLE,
  liuyao: `${SITE_TITLE}·六爻`,
  bazi: `${SITE_TITLE}·八字`,
  tarot: `${SITE_TITLE}·塔罗牌`,
} as const;

const NAV_TITLE_BY_PATHNAME: Record<string, string> = {
  "/": PAGE_TITLES.home,
  "/liuyao": PAGE_TITLES.liuyao,
  "/bazi": PAGE_TITLES.bazi,
  "/tarot": PAGE_TITLES.tarot,
};

export function getNavTitle(pathname: string) {
  const normalizedPathname =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  return NAV_TITLE_BY_PATHNAME[normalizedPathname] ?? SITE_TITLE;
}
