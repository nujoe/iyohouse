export const SITE_NAME = "이요하우스 IYOHOUSE";

export const SITE_DESCRIPTION =
  "이요하우스는 창작자를 위한 자유실험공간입니다. 2025년 ‘공공공원’이라는 이름으로 시작해, 워크숍과 동아리, 각종 이벤트가 열리는 공간으로 운영되고 있습니다.";

export const SITE_URL = normalizeSiteUrl(
  process.env.NEXT_PUBLIC_SITE_URL || "https://iyohouse.com",
);

export const SITE_OG_IMAGE = "/opengraph/iyohouse%20opengraph.png";
export const SITE_LOGO = "/logo.png";
export const SITE_EMAIL = "goyangiyoram@gmail.com";

function normalizeSiteUrl(url: string) {
  return url.replace(/\/+$/, "");
}
