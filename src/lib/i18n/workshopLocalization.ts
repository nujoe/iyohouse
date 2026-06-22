import type { Language, Translation } from "./translations";

export function getLocalizedWorkshopTitle(workshop: any, language: Language, t: Translation) {
    if (!workshop) return "";

    if (language === "en" && workshop.titleEn) {
        return workshop.titleEn;
    }

    return workshop.title || t.workshop.fallbackTitle(workshop.number || workshop.id);
}

export function getLocalizedWorkshopTutor(workshop: any, language: Language) {
    if (!workshop) return "";

    return (language === "en" && workshop.tutorEn) ? workshop.tutorEn : workshop.tutor;
}

export function getLocalizedWorkshopTutorBio(workshop: any, language: Language) {
    if (!workshop) return "";
    return (language === "en" && workshop.tutorBioEn) ? workshop.tutorBioEn : workshop.tutorBio;
}

export function getLocalizedWorkshopDescription(workshop: any, language: Language) {
    if (!workshop) return [];
    const description = (language === "en" && hasPortableText(workshop.descriptionEn))
        ? workshop.descriptionEn
        : workshop.description;

    return Array.isArray(description) ? description : [];
}

export function getLocalizedCurriculumItem(week: any, language: Language) {
    return {
        weekLabel: (language === "en" && week?.weekLabelEn) ? week.weekLabelEn : week?.weekLabel,
        content: (language === "en" && week?.contentEn) ? week.contentEn : week?.content,
    };
}

export function getLocalizedScheduleSession(session: any, language: Language) {
    return {
        date: (language === "en" && session?.dateEn) ? session.dateEn : session?.date,
        time: (language === "en" && session?.timeEn) ? session.timeEn : session?.time,
    };
}

export function getScheduleSessionLabel(session: any, language: Language) {
    const localized = getLocalizedScheduleSession(session, language);
    return `${localized.date || ""} ${localized.time || ""}`.trim();
}

export function portableTextBlockToText(block: any) {
    return Array.isArray(block?.children)
        ? block.children.map((child: any) => child?.text || "").join("")
        : "";
}

function hasPortableText(value: unknown) {
    return Array.isArray(value) && value.some((block) => portableTextBlockToText(block).trim());
}
