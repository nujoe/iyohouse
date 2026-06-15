"use client";

import { useState, useCallback } from "react";
import { useToast } from "@/context/ToastContext";
import { TEXT } from "@/lib/i18n/translations";

interface ContactSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    t: any;
}

export default function ContactSidebar({ isOpen, onClose, t }: ContactSidebarProps) {
    const { showToast } = useToast();
    const [contactData, setContactData] = useState({ email: '', subject: '', message: '' });
    const [isSending, setIsSending] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    const { email, subject, message } = contactData;

    const handleContactSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !message) {
            setValidationError(TEXT.ko.contact.required);
            return;
        }
        setValidationError(null);
        setIsSending(true);
        try {
            const response = await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, subject, message }),
            });
            const result = await response.json();
            if (result.success) {
                showToast("success", TEXT.ko.contact.success);
                setContactData({ email: '', subject: '', message: '' });
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            console.error('이메일 전송 실패:', error);
            showToast("error", TEXT.ko.contact.error);
        } finally {
            setIsSending(false);
        }
    }, [email, message, subject, showToast]);

    if (!isOpen) return null;

    return (
        <div className="contact-sidebar-content" onClick={(e) => e.stopPropagation()}>
            <form className="contact-form-classic" onSubmit={handleContactSubmit}>
                <div className="contact-sidebar-header">
                    <h2 className="modal-title">{t.contact.title}</h2>
                </div>

                <div className="contact-main-scroll">
                    <div className="form-classic-row">
                        <input
                            type="email"
                            placeholder={t.contact.email}
                            className="form-input-classic"
                            value={contactData.email}
                            onChange={(e) => {
                                setContactData({ ...contactData, email: e.target.value });
                                if (validationError) setValidationError(null);
                            }}
                            required
                        />
                    </div>
                    <div className="form-classic-row">
                        <input
                            type="text"
                            placeholder={t.contact.subject}
                            className="form-input-classic"
                            value={contactData.subject}
                            onChange={(e) => setContactData({ ...contactData, subject: e.target.value })}
                        />
                    </div>
                    <div className="form-classic-row flex-textarea">
                        <textarea
                            placeholder={t.contact.message}
                            className="form-textarea-classic"
                            value={contactData.message}
                            onChange={(e) => {
                                setContactData({ ...contactData, message: e.target.value });
                                if (validationError) setValidationError(null);
                            }}
                            required
                        ></textarea>
                    </div>
                </div>

                {validationError && (
                    <div className="form-validation-error-msg" style={{ padding: "0 20px" }}>
                        {validationError}
                    </div>
                )}

                <div className="form-submit-row">
                    <button type="submit" className="form-submit-btn-classic" disabled={isSending}>
                        {isSending ? t.contact.sending : t.contact.send}
                    </button>
                </div>
            </form>
        </div>
    );
}
