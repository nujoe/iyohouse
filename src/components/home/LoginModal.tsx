"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/lib/i18n";

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const {
        user,
        profile,
        isProfileComplete,
        signOut,
        signInWithGoogle,
        signInWithKakao,
        signInWithEmail,
        signUpWithEmail
    } = useAuth();
    const { t } = useLanguage();

    const [loginEmail, setLoginEmail] = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    const [isSignUpMode, setIsSignUpMode] = useState(false);
    const [loginError, setLoginError] = useState<string | null>(null);
    const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setLoginEmail("");
            setLoginPassword("");
            setIsSignUpMode(false);
            setLoginError(null);
            setIsLoginSubmitting(false);
        }
    }, [isOpen]);

    const getCurrentNextPath = useCallback(() => {
        const query = searchParams.toString();
        return `${pathname}${query ? `?${query}` : ''}`;
    }, [pathname, searchParams]);

    const goToCompleteProfile = useCallback(() => {
        const currentPath = getCurrentNextPath();
        const nextPath = currentPath.startsWith('/complete-profile') ? '/' : currentPath;
        router.push(`/complete-profile?next=${encodeURIComponent(nextPath)}`);
    }, [getCurrentNextPath, router]);

    const handleEmailAuthSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError(null);
        setIsLoginSubmitting(true);

        if (!loginEmail || !loginPassword) {
            setLoginError(t.auth.emailRequired);
            setIsLoginSubmitting(false);
            return;
        }

        if (loginPassword.length < 6) {
            setLoginError(t.auth.passwordMin);
            setIsLoginSubmitting(false);
            return;
        }

        try {
            if (isSignUpMode) {
                const { error } = await signUpWithEmail(loginEmail, loginPassword);
                if (error) {
                    setLoginError(error.message);
                } else {
                    alert(t.auth.signupDone);
                    onClose();
                }
            } else {
                const { error } = await signInWithEmail(loginEmail, loginPassword);
                if (error) {
                    setLoginError(error.message);
                } else {
                    onClose();
                }
            }
        } catch (err: any) {
            setLoginError(err.message || t.auth.genericError);
        } finally {
            setIsLoginSubmitting(false);
        }
    }, [isSignUpMode, loginEmail, loginPassword, signInWithEmail, signUpWithEmail, t, onClose]);

    if (!isOpen) return null;

    return (
        <div className={`login-overlay-wrapper ${isOpen ? 'active' : ''}`}>
            <div className="login-dimmer" onClick={onClose}></div>
            <div className="login-modal-card">
                <div className="login-modal-header">
                    <button className="login-close-btn" onClick={onClose}>&times;</button>
                </div>
                <div className="login-modal-body">
                    {user ? (
                        /* 로그인 상태 */
                        <div className="login-intro">
                            <h3>IYOHOUSE</h3>

                            {!isProfileComplete ? (
                                /* 프로필 미완성: 전용 가입 완료 페이지로 이동 */
                                <div className="profile-setup-container" style={{ marginTop: '24px', textAlign: 'left' }}>
                                    <p style={{ fontSize: '13px', marginBottom: '20px', opacity: 0.7 }}>
                                        {t.auth.completePrompt}
                                    </p>
                                    <button
                                        type="button"
                                        className="email-submit-btn"
                                        style={{ width: '100%' }}
                                        onClick={() => { onClose(); goToCompleteProfile(); }}
                                    >
                                        {t.auth.completeAction}
                                    </button>
                                    <button
                                        type="button"
                                        className="social-btn"
                                        style={{ marginTop: '10px', width: '100%', justifyContent: 'center', background: 'transparent', border: '1px solid #ddd', color: '#666' }}
                                        onClick={() => signOut()}
                                    >
                                        {t.auth.logout}
                                    </button>
                                </div>
                            ) : (
                                /* 프로필 완성: 일반 로그인 상태 */
                                <div className="profile-welcome-container" style={{ marginTop: '24px' }}>
                                    <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{t.auth.welcome(profile?.full_name)}</div>
                                    <div style={{ marginTop: '8px', fontSize: '14px', opacity: 0.6 }}>{user.email}</div>

                                    <div className="profile-info-display" style={{ marginTop: '20px', textAlign: 'left', background: '#f9f9f9', padding: '15px', borderRadius: '8px' }}>
                                        <div style={{ fontSize: '12px', opacity: 0.5 }}>{t.auth.bioLabel}</div>
                                        <div style={{ marginTop: '5px', fontSize: '14px', lineHeight: '1.5' }}>{profile?.bio || t.auth.noBio}</div>
                                    </div>

                                    <button
                                        className="email-submit-btn"
                                        style={{ marginTop: '30px' }}
                                        onClick={async () => { await signOut(); onClose(); }}
                                    >
                                        {t.auth.logout}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* 비로그인 상태 */
                        <>
                            <div className="login-intro">
                                <h3>IYOHOUSE</h3>
                            </div>

                            <div className="social-login-group">
                                <button className="social-btn kakao" onClick={signInWithKakao}>
                                    <span className="btn-icon">K</span>
                                    <span className="btn-text">{t.auth.kakao}</span>
                                </button>
                                <button className="social-btn google" onClick={signInWithGoogle}>
                                    <span className="btn-icon">G</span>
                                    <span className="btn-text">{t.auth.google}</span>
                                </button>
                            </div>

                            <div className="login-divider">
                                <span>OR</span>
                            </div>

                            <form className="email-login-form" onSubmit={handleEmailAuthSubmit}>
                                <input
                                    type="email"
                                    placeholder={t.auth.emailPlaceholder}
                                    className="login-input"
                                    value={loginEmail}
                                    onChange={(e) => setLoginEmail(e.target.value)}
                                    required
                                    disabled={isLoginSubmitting}
                                />
                                <input
                                    type="password"
                                    placeholder={t.auth.passwordPlaceholder}
                                    className="login-input"
                                    value={loginPassword}
                                    onChange={(e) => setLoginPassword(e.target.value)}
                                    required
                                    disabled={isLoginSubmitting}
                                />
                                {loginError && (
                                    <div style={{ color: '#c80000', fontSize: '12px', marginTop: '4px', textAlign: 'center' }}>
                                        {loginError}
                                    </div>
                                )}
                                <button
                                    type="submit"
                                    className="email-submit-btn"
                                    disabled={isLoginSubmitting}
                                >
                                    {isLoginSubmitting ? t.auth.submitting : (isSignUpMode ? t.auth.emailSignup : t.auth.emailLogin)}
                                </button>
                            </form>

                            <div style={{ textAlign: 'center', marginTop: '10px', marginBottom: '20px', fontSize: '13px' }}>
                                <span style={{ color: '#666' }}>
                                    {isSignUpMode ? t.auth.hasAccount : t.auth.noAccount}
                                </span>{" "}
                                <button
                                    type="button"
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#000',
                                        fontWeight: 'bold',
                                        textDecoration: 'underline',
                                        cursor: 'pointer',
                                        padding: 0,
                                        fontSize: 'inherit'
                                    }}
                                    onClick={() => {
                                        setIsSignUpMode(!isSignUpMode);
                                        setLoginError(null);
                                    }}
                                    disabled={isLoginSubmitting}
                                >
                                    {isSignUpMode ? t.auth.switchToLogin : t.auth.switchToSignup}
                                </button>
                            </div>

                            <div className="login-notice">
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
