"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfileNavigation } from "@/hooks/useProfileNavigation";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/context/ToastContext";
import { TEXT } from "@/lib/i18n/translations";
import AccountWorkshopHistory from "@/components/home/AccountWorkshopHistory";

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialMode?: "login" | "signup";
}

type SocialProvider = "google";
type AccountTab = "profile" | "history";

function getKoreanAuthError(message: string) {
    if (!message) return "오류가 발생했습니다.";
    const lower = message.toLowerCase();
    if (lower.includes("invalid login credentials") || lower.includes("invalid credentials")) {
        return "이메일 또는 비밀번호가 올바르지 않습니다.";
    }
    if (lower.includes("user already exists") || lower.includes("already registered")) {
        return "이미 가입된 이메일입니다.";
    }
    if (lower.includes("rate limit")) {
        return "너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해 주세요.";
    }
    if (lower.includes("email address is invalid") || lower.includes("invalid email")) {
        return "올바른 이메일 주소를 입력해 주세요.";
    }
    if (lower.includes("password should be")) {
        return "비밀번호는 최소 6자리 이상이어야 합니다.";
    }
    return message;
}

export default function LoginModal({ isOpen, onClose, initialMode = "login" }: LoginModalProps) {
    const {
        user,
        session,
        profile,
        isProfileComplete,
        signOut,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        updateProfile,
    } = useAuth();
    const { goToCompleteProfile } = useProfileNavigation();
    const { t } = useLanguage();
    const { showToast } = useToast();

    const [loginEmail, setLoginEmail] = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    const [isSignUpMode, setIsSignUpMode] = useState(initialMode === "signup");
    const [loginError, setLoginError] = useState<string | null>(null);
    const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
    const [socialLoginProvider, setSocialLoginProvider] = useState<SocialProvider | null>(null);
    const [profileFullName, setProfileFullName] = useState("");
    const [profileEmail, setProfileEmail] = useState("");
    const [profilePhone, setProfilePhone] = useState("");
    const [profileBio, setProfileBio] = useState("");
    const [profileMessage, setProfileMessage] = useState<string | null>(null);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [isProfileSubmitting, setIsProfileSubmitting] = useState(false);
    const [accountActiveTab, setAccountActiveTab] = useState<AccountTab>("profile");
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = 0;
        }
    }, [accountActiveTab]);

    useEffect(() => {
        if (isOpen) {
            setIsSignUpMode(initialMode === "signup");
        } else {
            setLoginEmail("");
            setLoginPassword("");
            setLoginError(null);
            setIsLoginSubmitting(false);
            setSocialLoginProvider(null);
            setProfileMessage(null);
            setProfileError(null);
            setIsProfileSubmitting(false);
            setAccountActiveTab("profile");
        }
    }, [isOpen, initialMode]);

    useEffect(() => {
        if (!isOpen || !user) return;

        setProfileFullName(profile?.full_name || "");
        setProfileEmail(profile?.email || user.email || "");
        setProfilePhone(profile?.phone || "");
        setProfileBio(profile?.bio || "");
        setProfileMessage(null);
        setProfileError(null);
    }, [isOpen, profile, user]);

    const handleSocialLogin = useCallback(async (provider: SocialProvider) => {
        setLoginError(null);
        setSocialLoginProvider(provider);

        const { error } = await signInWithGoogle();

        if (error) {
            setLoginError(getKoreanAuthError(error.message || TEXT.ko.auth.genericError));
            setSocialLoginProvider(null);
        }
    }, [signInWithGoogle]);

    const handleEmailAuthSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError(null);
        setIsLoginSubmitting(true);

        if (!loginEmail || !loginPassword) {
            setLoginError(TEXT.ko.auth.emailRequired);
            setIsLoginSubmitting(false);
            return;
        }

        if (loginPassword.length < 6) {
            setLoginError(TEXT.ko.auth.passwordMin);
            setIsLoginSubmitting(false);
            return;
        }

        try {
            if (isSignUpMode) {
                const { data, error } = await signUpWithEmail(loginEmail, loginPassword);
                if (error) {
                    setLoginError(getKoreanAuthError(error.message));
                } else {
                    if (data && !(data as any).session) {
                        showToast("success", TEXT.ko.auth.signupEmailSent);
                        onClose();
                    } else {
                        onClose();
                        goToCompleteProfile();
                    }
                }
            } else {
                const { error } = await signInWithEmail(loginEmail, loginPassword);
                if (error) {
                    setLoginError(getKoreanAuthError(error.message));
                } else {
                    onClose();
                }
            }
        } catch (err: any) {
            setLoginError(getKoreanAuthError(err.message || TEXT.ko.auth.genericError));
        } finally {
            setIsLoginSubmitting(false);
        }
    }, [goToCompleteProfile, isSignUpMode, loginEmail, loginPassword, onClose, showToast, signInWithEmail, signUpWithEmail]);

    const handleProfileSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setProfileMessage(null);
        setProfileError(null);

        if (!profileFullName.trim() || !profileEmail.trim() || !profilePhone.trim()) {
            setProfileError("이름, 이메일, 전화번호를 입력해 주세요.");
            return;
        }

        setIsProfileSubmitting(true);
        const { error } = await updateProfile({
            full_name: profileFullName.trim(),
            email: profileEmail.trim(),
            phone: profilePhone.trim(),
            bio: profileBio.trim(),
        });
        setIsProfileSubmitting(false);

        if (error) {
            setProfileError(getKoreanAuthError(error));
            return;
        }

        setProfileMessage("회원정보가 저장되었습니다.");
    }, [profileBio, profileEmail, profileFullName, profilePhone, updateProfile]);

    if (!isOpen) return null;

    return (
        <div className={`login-overlay-wrapper ${isOpen ? 'active' : ''}`}>
            <div className="login-dimmer" onClick={onClose}></div>
            <div className={`login-modal-card ${user && isProfileComplete ? "account-modal-card" : ""}`}>
                <div className="login-modal-frame">
                    <button className="login-close-btn" onClick={onClose} aria-label="닫기">&times;</button>
                    <div className="login-modal-body">
                    {user ? (
                        /* 로그인 상태 */
                        !isProfileComplete ? (
                            <div className="login-intro">
                                <h3>IYOHOUSE</h3>
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
                            </div>
                        ) : (
                            /* 프로필 완성: 일반 로그인 상태 */
                            <div className="account-modal-shell">
                                <nav className="account-tab-rail" aria-label="회원 메뉴">
                                    <button
                                        type="button"
                                        className={`account-tab-button ${accountActiveTab === "profile" ? "is-active" : ""}`}
                                        onClick={() => setAccountActiveTab("profile")}
                                    >
                                        정보 수정
                                    </button>
                                    <button
                                        type="button"
                                        className={`account-tab-button ${accountActiveTab === "history" ? "is-active" : ""}`}
                                        onClick={() => setAccountActiveTab("history")}
                                    >
                                        워크숍 신청 내역
                                    </button>
                                </nav>

                                <div ref={containerRef} className="profile-welcome-container">
                                    {accountActiveTab === "profile" ? (
                                        <>
                                            <div className="account-history-heading">
                                                <h3 id="account-profile-title">iyohouse</h3>
                                                <p className="account-history-greeting">
                                                    <strong>{profile?.full_name || "회원"}님</strong> 안녕하세요 !
                                                </p>
                                                <p className="account-history-copy">
                                                    이 페이지에서는 개인 회원 정보를 수정하실 수 있습니다
                                                </p>
                                            </div>
                                            <div className="account-history-divider" aria-hidden="true" />

                                            <form className="profile-edit-form" onSubmit={handleProfileSubmit}>
                                                <label className="complete-profile-label" htmlFor="profile-edit-name">
                                                    {t.auth.nameLabel}
                                                </label>
                                                <input
                                                    id="profile-edit-name"
                                                    className="login-input"
                                                    type="text"
                                                    value={profileFullName}
                                                    onChange={(event) => setProfileFullName(event.target.value)}
                                                    required
                                                    disabled={isProfileSubmitting}
                                                />

                                                <label className="complete-profile-label" htmlFor="profile-edit-email">
                                                    {t.auth.email}
                                                </label>
                                                <input
                                                    id="profile-edit-email"
                                                    className="login-input"
                                                    type="email"
                                                    value={profileEmail}
                                                    onChange={(event) => setProfileEmail(event.target.value)}
                                                    required
                                                    disabled={isProfileSubmitting}
                                                />

                                                <label className="complete-profile-label" htmlFor="profile-edit-phone">
                                                    {t.auth.phoneLabel}
                                                </label>
                                                <input
                                                    id="profile-edit-phone"
                                                    className="login-input"
                                                    type="tel"
                                                    value={profilePhone}
                                                    onChange={(event) => setProfilePhone(event.target.value)}
                                                    required
                                                    disabled={isProfileSubmitting}
                                                />

                                                <label className="complete-profile-label" htmlFor="profile-edit-bio">
                                                    {t.auth.bioLabel}
                                                </label>
                                                <textarea
                                                    id="profile-edit-bio"
                                                    className="login-input login-textarea"
                                                    value={profileBio}
                                                    onChange={(event) => setProfileBio(event.target.value)}
                                                    placeholder={t.auth.bioPlaceholder}
                                                    rows={4}
                                                    disabled={isProfileSubmitting}
                                                />
                                                <p className="profile-helper-text">{t.auth.bioHelper}</p>

                                                {profileError && (
                                                    <div className="profile-form-status error" role="alert">
                                                        {profileError}
                                                    </div>
                                                )}
                                                {profileMessage && (
                                                    <div className="profile-form-status success" role="status">
                                                        {profileMessage}
                                                    </div>
                                                )}

                                                <button
                                                    className="email-submit-btn"
                                                    type="submit"
                                                    disabled={isProfileSubmitting}
                                                >
                                                    {isProfileSubmitting ? t.auth.submitting : t.auth.saveProfile}
                                                </button>
                                            </form>
                                        </>
                                    ) : (
                                        <AccountWorkshopHistory
                                            isActive={accountActiveTab === "history"}
                                            profileName={profile?.full_name}
                                            accessToken={session?.access_token}
                                        />
                                    )}
                                </div>
                            </div>
                        )
                    ) : (
                        /* 비로그인 상태 */
                        <>
                            <div className="login-intro">
                                <h3>IYOHOUSE</h3>
                            </div>

                            <div className="social-login-group">
                                <button
                                    type="button"
                                    className="social-btn google"
                                    onClick={() => handleSocialLogin("google")}
                                    disabled={Boolean(socialLoginProvider)}
                                >
                                    <span className="btn-icon">
                                        <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                        </svg>
                                    </span>
                                    <span className="btn-text">{socialLoginProvider === "google" ? t.auth.submitting : t.auth.google}</span>
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
        </div>
    );
}
