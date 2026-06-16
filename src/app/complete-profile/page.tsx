"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

function getSafeNextPath(next: string | null) {
    if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";

    try {
        const parsed = new URL(next, "https://iyohouse.local");
        if (parsed.origin !== "https://iyohouse.local") return "/";
        if (
            parsed.pathname === "/auth" ||
            parsed.pathname.startsWith("/auth/") ||
            parsed.pathname === "/complete-profile" ||
            parsed.pathname.startsWith("/complete-profile/")
        ) return "/";

        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return "/";
    }
}

function CompleteProfileContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, profile, isLoading, isProfileComplete, updateProfile, signOut } = useAuth();
    const nextPath = useMemo(() => getSafeNextPath(searchParams.get("next")), [searchParams]);
    const [email, setEmail] = useState("");
    const [fullName, setFullName] = useState("");
    const [phone, setPhone] = useState("");
    const [bio, setBio] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        if (!isLoading && !user) {
            router.replace("/");
        }
    }, [isLoading, router, user]);

    useEffect(() => {
        if (!isLoading && user && isProfileComplete) {
            router.replace(nextPath);
        }
    }, [isLoading, isProfileComplete, nextPath, router, user]);

    useEffect(() => {
        setEmail(profile?.email || user?.email || "");
        setFullName(profile?.full_name || "");
        setPhone(profile?.phone || "");
        setBio(profile?.bio || "");
    }, [profile, user]);

    const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setErrorMessage("");

        if (!email.trim() || !fullName.trim() || !phone.trim()) {
            setErrorMessage("이메일, 이름, 전화번호를 입력해 주세요.");
            return;
        }

        setSubmitting(true);
        const { error } = await updateProfile({
            email: email.trim(),
            full_name: fullName.trim(),
            phone: phone.trim(),
            bio: bio.trim(),
        });
        setSubmitting(false);

        if (error) {
            setErrorMessage(error);
            return;
        }

        router.replace(nextPath);
    }, [bio, email, fullName, nextPath, phone, router, updateProfile]);

    const handleSignOut = useCallback(async () => {
        await signOut();
        router.replace("/");
    }, [router, signOut]);

    if (isLoading) {
        return (
            <main className="complete-profile-page">
                <div className="complete-profile-loading">LOADING</div>
            </main>
        );
    }

    return (
        <main className="complete-profile-page">
            <section className="login-modal-card complete-profile-card" aria-labelledby="complete-profile-title">
                <div className="login-modal-body">
                    <div className="login-intro">
                        <h3 id="complete-profile-title">IYOHOUSE</h3>
                        <p>회원가입 완료를 위해 필수 정보를 입력해 주세요.</p>
                    </div>

                    <form className="email-login-form" onSubmit={handleSubmit}>
                        <div className="form-row">
                            <label className="complete-profile-label" htmlFor="complete-profile-email">
                                이메일
                            </label>
                            <input
                                id="complete-profile-email"
                                className="login-input"
                                type="email"
                                placeholder="이메일 주소"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                required
                            />
                        </div>

                        <div className="form-row">
                            <label className="complete-profile-label" htmlFor="complete-profile-name">
                                이름
                            </label>
                            <input
                                id="complete-profile-name"
                                className="login-input"
                                type="text"
                                placeholder="실명을 입력하세요"
                                value={fullName}
                                onChange={(event) => setFullName(event.target.value)}
                                required
                            />
                        </div>

                        <div className="form-row">
                            <label className="complete-profile-label" htmlFor="complete-profile-phone">
                                전화번호
                            </label>
                            <input
                                id="complete-profile-phone"
                                className="login-input"
                                type="tel"
                                placeholder="010-0000-0000"
                                value={phone}
                                onChange={(event) => setPhone(event.target.value)}
                                required
                            />
                        </div>

                        <div className="form-row">
                            <label className="complete-profile-label" htmlFor="complete-profile-bio">
                                자기소개
                            </label>
                            <textarea
                                id="complete-profile-bio"
                                className="login-input login-textarea"
                                placeholder="간단한 자기소개를 입력해 주세요"
                                value={bio}
                                onChange={(event) => setBio(event.target.value)}
                                rows={4}
                            />
                            <p className="profile-helper-text">
                                워크숍 신청시 입력되는 간단한 자기소개문구입니다.
                            </p>
                        </div>

                        {errorMessage && (
                            <p className="complete-profile-error" role="alert">
                                {errorMessage}
                            </p>
                        )}

                        <button className="email-submit-btn" type="submit" disabled={submitting}>
                            {submitting ? "저장 중" : "회원가입 완료"}
                        </button>

                        <button className="social-btn complete-profile-logout" type="button" onClick={handleSignOut}>
                            로그아웃
                        </button>
                    </form>
                </div>
            </section>
        </main>
    );
}

export default function CompleteProfilePage() {
    return (
        <Suspense
            fallback={(
                <main className="complete-profile-page">
                    <div className="complete-profile-loading">LOADING</div>
                </main>
            )}
        >
            <CompleteProfileContent />
        </Suspense>
    );
}
