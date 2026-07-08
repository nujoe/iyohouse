import type { Language, Translation } from "./translations";

export type LocalizedWorkshopTutor = {
    name: string;
    bio: string;
};

export function getLocalizedWorkshopTitle(workshop: any, language: Language, t: Translation) {
    if (!workshop) return "";

    if (language === "en" && workshop.titleEn) {
        return workshop.titleEn;
    }

    return workshop.title || t.workshop.fallbackTitle(workshop.number || workshop.id);
}

export function getLocalizedWorkshopTutor(workshop: any, language: Language) {
    return getLocalizedWorkshopTutorNames(workshop, language).join(", ");
}

export function getLocalizedWorkshopTutorBio(workshop: any, language: Language) {
    return getLocalizedWorkshopTutors(workshop, language)
        .map((tutor) => tutor.bio)
        .filter(Boolean)
        .join("\n\n");
}

export function getLocalizedWorkshopTutorNames(workshop: any, language: Language) {
    return getLocalizedWorkshopTutors(workshop, language)
        .map((tutor) => tutor.name)
        .filter(Boolean);
}

export function getLocalizedWorkshopTutors(workshop: any, language: Language): LocalizedWorkshopTutor[] {
    if (!workshop) return [];

    if (Array.isArray(workshop.tutors) && workshop.tutors.length > 0) {
        return workshop.tutors
            .map((tutor: any): LocalizedWorkshopTutor => {
                const name = readString((language === "en" && tutor?.nameEn) ? tutor.nameEn : tutor?.name);
                const bio = readString((language === "en" && tutor?.bioEn) ? tutor.bioEn : tutor?.bio);

                return { name, bio };
            })
            .filter((tutor: LocalizedWorkshopTutor) => tutor.name || tutor.bio);
    }

    const name = readString((language === "en" && workshop.tutorEn) ? workshop.tutorEn : workshop.tutor);
    const bio = readString((language === "en" && workshop.tutorBioEn) ? workshop.tutorBioEn : workshop.tutorBio);

    return name || bio ? [{ name, bio }] : [];
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

function readString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
