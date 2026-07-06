import { NextResponse } from "next/server";
import { createClient as createSanityClient } from "next-sanity";
import { apiVersion, dataset, projectId } from "@/sanity/env";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getWorkshopPosterUrl,
  getWorkshopSeoTitle,
  normalizeWhitespace,
  portableTextToPlainText,
  type WorkshopSeoDocument,
} from "@/lib/workshopSeo";

export const dynamic = "force-dynamic";

const sanityServerClient = createSanityClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
});

type RegistrationRow = {
  id: string;
  workshop_id: string | null;
  created_at: string | null;
  snapshot_workshop_title?: string | null;
};

type AccountWorkshopDocument = WorkshopSeoDocument & {
  supabase_workshop_id?: string | null;
};

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ success: false, items: [] }, { status: 401 });
  }

  const { data: registrations, error: registrationError } = await supabase
    .from("workshop_registrations_v2")
    .select("id, workshop_id, created_at, snapshot_workshop_title")
    .eq("user_id", user.id)
    .eq("status", "confirmed")
    .order("created_at", { ascending: false });

  if (registrationError) {
    console.error("Account workshop history registration fetch failed:", registrationError);
    return NextResponse.json(
      { success: false, items: [], error: "Unable to load workshop history" },
      { status: 500 },
    );
  }

  const rows = (registrations ?? []) as RegistrationRow[];
  const workshopIds = Array.from(
    new Set(rows.map((row) => row.workshop_id).filter((id): id is string => Boolean(id))),
  );

  const workshops = workshopIds.length
    ? await sanityServerClient.fetch<AccountWorkshopDocument[]>(
        `*[
          _type == "workshop" &&
          !(_id in path("drafts.**")) &&
          supabase_workshop_id in $workshopIds
        ] {
          _id,
          title,
          tutor,
          description,
          poster,
          posterAlt,
          supabase_workshop_id,
          "posterMeta": poster.asset->metadata.dimensions
        }`,
        { workshopIds },
      )
    : [];

  const workshopsBySupabaseId = new Map(
    workshops
      .filter((workshop) => workshop.supabase_workshop_id)
      .map((workshop) => [workshop.supabase_workshop_id as string, workshop]),
  );

  const items = rows.map((registration) => {
    const workshop = registration.workshop_id
      ? workshopsBySupabaseId.get(registration.workshop_id)
      : null;
    const posterUrl = workshop ? getWorkshopPosterUrl(workshop) : "";

    return {
      id: registration.id,
      title: workshop ? getWorkshopSeoTitle(workshop) : registration.snapshot_workshop_title || "워크숍",
      tutor: normalizeWhitespace(workshop?.tutor),
      description: normalizeWhitespace(portableTextToPlainText(workshop?.description)),
      posterUrl,
      posterAlt: workshop?.posterAlt || `${workshop?.title || registration.snapshot_workshop_title || "워크숍"} 포스터`,
      posterWidth: workshop?.posterMeta?.width || 1080,
      posterHeight: workshop?.posterMeta?.height || 1350,
    };
  });

  return NextResponse.json({ success: true, items });
}
