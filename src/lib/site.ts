export const SITE_NAME = "IYOHOUSE";

export const SITE_DESCRIPTION =
  "이요하우스는 창작자를 위한 워크숍, 실험, 모임을 운영하는 서울 기반 크리에이티브 공간입니다.";

export const SITE_URL = normalizeSiteUrl(
  process.env.NEXT_PUBLIC_SITE_URL || "https://iyohouse.com",
);

export const SITE_OG_IMAGE = "/opengraph-image";
export const SITE_LOGO = "/logo.png";
export const SITE_EMAIL = "goyangiyoram@gmail.com";

function normalizeSiteUrl(url: string) {
  return url.replace(/\/+$/, "");
}
