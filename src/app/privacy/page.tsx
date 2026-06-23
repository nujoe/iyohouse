import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";

export const metadata: Metadata = {
  title: "개인정보처리방침 | IYOHOUSE",
  description: "IYOHOUSE 웹사이트 및 워크숍 서비스 개인정보처리방침",
};

const updatedAt = "2026. 6. 23.";

export default function PrivacyPage() {
  return (
    <main style={styles.page}>
      <Link href="/?preset=main" style={styles.backButton} aria-label="메인 페이지로 돌아가기">
        ←
      </Link>

      <article style={styles.article}>
        <header style={styles.header}>
          <h1 style={styles.title}>개인정보처리방침</h1>
        </header>

        <section style={styles.section}>
          <p>
            주식회사 이요하우스는 IYOHOUSE 웹사이트, 회원 기능, 워크숍 신청 및
            결제 서비스를 운영하기 위해 필요한 범위에서 개인정보를 처리합니다.
            이 방침은 IYOHOUSE 웹사이트 및 Google 로그인 기능을 포함한 관련
            서비스에 적용됩니다.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>1. 수집하는 개인정보</h2>
          <p>
            Google 계정으로 로그인하는 경우 이메일 주소, 이름, 프로필 이미지 등
            Google 계정에서 제공되는 기본 프로필 정보를 수집할 수 있습니다.
            회원가입, 워크숍 신청, 문의 과정에서는 사용자가 직접 입력한 이름,
            이메일, 전화번호, 자기소개, 신청 일정, 결제 및 신청 상태 정보를
            처리할 수 있습니다.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>2. 개인정보 이용 목적</h2>
          <p>
            수집한 정보는 회원 식별과 로그인, 워크숍 신청 접수, 일정별 정원
            관리, 결제 처리, 신청 내역 확인, 서비스 공지, 문의 응대 및 부정 이용
            방지를 위해 사용됩니다. Google 사용자 데이터는 로그인과 회원 식별
            목적에 한해 사용되며 광고 목적 판매에 사용하지 않습니다.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>3. 제3자 제공 및 처리 위탁</h2>
          <p>
            IYOHOUSE는 법령에 따른 요청이 있거나 사용자가 동의한 경우를 제외하고
            개인정보를 제3자에게 판매하지 않습니다. 서비스 운영을 위해 Supabase,
            Sanity, NicePay 등 인증, 데이터 저장, 콘텐츠 관리, 결제 처리에 필요한
            외부 서비스가 개인정보를 처리할 수 있습니다.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>4. 보관 및 삭제</h2>
          <p>
            개인정보는 서비스 제공에 필요한 기간 동안 보관합니다. 사용자가 삭제를
            요청하거나 처리 목적이 달성된 경우 지체 없이 삭제하며, 관계 법령에
            따라 보관이 필요한 결제 및 거래 기록은 해당 법령에서 정한 기간 동안
            보관할 수 있습니다.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>5. 보안 조치</h2>
          <p>
            IYOHOUSE는 개인정보 보호를 위해 HTTPS 통신, 접근 권한 제한, 인증된
            서비스 인프라 사용 등 합리적인 보안 조치를 적용합니다. 내부적으로
            개인정보 접근 권한은 서비스 운영에 필요한 인원과 목적에 한정합니다.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>6. 이용자의 권리</h2>
          <p>
            이용자는 자신의 개인정보에 대한 열람, 정정, 삭제, 처리 정지를 요청할
            수 있습니다. 요청은 아래 문의 이메일로 접수할 수 있으며, IYOHOUSE는
            본인 확인 후 관련 법령에 따라 처리합니다.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>7. 문의</h2>
          <p>
            개인정보처리방침 또는 개인정보 처리에 관한 문의는{" "}
            <a href="mailto:goyangiyoram@gmail.com" style={styles.link}>
              goyangiyoram@gmail.com
            </a>
            으로 연락해 주세요.
          </p>
        </section>

        <footer style={styles.footer}>
          <p style={styles.eyebrow}>Privacy Policy</p>
          <p style={styles.updated}>시행일 및 최종 업데이트: {updatedAt}</p>
        </footer>
      </article>
    </main>
  );
}

const styles = {
  page: {
    height: "100vh",
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    background: "#ffffff",
    color: "#111111",
    padding: "clamp(28px, 6vw, 72px)",
    fontFamily: "var(--font-noto-serif-kr), serif",
  },
  article: {
    maxWidth: "920px",
    margin: "0 auto",
  },
  backButton: {
    position: "fixed",
    top: "clamp(18px, 3vw, 32px)",
    left: "clamp(18px, 3vw, 32px)",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "42px",
    height: "42px",
    border: "1px solid #111111",
    color: "inherit",
    background: "#ffffff",
    fontFamily: "var(--font-noto-sans), sans-serif",
    fontSize: "1.3rem",
    fontWeight: 800,
    textDecoration: "none",
  },
  header: {
    borderBottom: "2px solid #111111",
    marginBottom: "38px",
    paddingBottom: "18px",
  },
  eyebrow: {
    fontFamily: "var(--font-noto-sans), sans-serif",
    fontSize: "0.86rem",
    fontWeight: 800,
    margin: "0 0 8px",
  },
  title: {
    fontSize: "clamp(2.2rem, 6vw, 4.4rem)",
    lineHeight: 1,
    margin: 0,
  },
  updated: {
    color: "#555555",
    fontFamily: "var(--font-noto-sans), sans-serif",
    fontSize: "0.88rem",
    margin: "6px 0 0",
  },
  section: {
    borderBottom: "1px solid rgba(17, 17, 17, 0.16)",
    padding: "0 0 28px",
    marginBottom: "28px",
    fontSize: "1.02rem",
    lineHeight: 1.85,
  },
  heading: {
    fontFamily: "var(--font-noto-sans), sans-serif",
    fontSize: "1.02rem",
    lineHeight: 1.45,
    margin: "0 0 12px",
  },
  link: {
    color: "inherit",
    fontWeight: 800,
    textDecoration: "underline",
    textUnderlineOffset: "3px",
  },
  footer: {
    padding: "10px 0 0",
    marginTop: "44px",
  },
} satisfies Record<string, CSSProperties>;
