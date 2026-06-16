"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfileNavigation } from "@/hooks/useProfileNavigation";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/context/ToastContext";
import { TEXT } from "@/lib/i18n/translations";

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialMode?: "login" | "signup";
}

type SocialProvider = "google";

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
                                    <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{t.auth.editProfile}</div>
                                    <div style={{ marginTop: '8px', fontSize: '13px', opacity: 0.6 }}>
                                        {t.auth.welcome(profile?.full_name)}
                                    </div>

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

                                    <button
                                        className="email-submit-btn"
                                        style={{ marginTop: '12px' }}
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
                                <button
                                    type="button"
                                    className="social-btn google"
                                    onClick={() => handleSocialLogin("google")}
                                    disabled={Boolean(socialLoginProvider)}
                                >
                                    <span className="btn-icon">G</span>
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
    );
}
