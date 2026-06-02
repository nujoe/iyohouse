import Link from "next/link";

export default function AuthCodeErrorPage() {
    return (
        <main style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "32px",
            background: "#f7f7f3",
            color: "#111",
            fontFamily: "var(--font-geist-sans), sans-serif",
        }}>
            <section style={{
                width: "min(100%, 420px)",
                border: "1px solid rgba(0, 0, 0, 0.12)",
                background: "#fff",
                padding: "28px",
            }}>
                <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700 }}>
                    로그인을 완료하지 못했습니다.
                </h1>
                <p style={{ margin: "14px 0 24px", color: "#555", lineHeight: 1.6 }}>
                    로그인 요청이 취소되었거나 인증 정보가 만료되었습니다. 다시 시도해 주세요.
                </p>
                <Link
                    href="/"
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: "42px",
                        padding: "0 16px",
                        background: "#111",
                        color: "#fff",
                        textDecoration: "none",
                        fontSize: "14px",
                        fontWeight: 700,
                    }}
                >
                    홈으로 돌아가기
                </Link>
            </section>
        </main>
    );
}
