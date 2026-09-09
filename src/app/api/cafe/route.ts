import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/app/db";
import { cafes } from "@/app/db/schema";
import { normalizeAddress, serializeAddress } from "@/app/lib/site-cafe";
import { cafe as fallbackCafe } from "@/app/data/cafe";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request) {
  try {
    const data = await request.json();

    if (!isNonEmptyString(data?.name)) {
      return NextResponse.json(
        { success: false, message: "Café name is required" },
        { status: 400 },
      );
    }

    const foundedYear =
      typeof data.foundedYear === "number" && Number.isFinite(data.foundedYear)
        ? data.foundedYear
        : null;

    const addressLines = normalizeAddress(data.address, fallbackCafe.address);

    const [cafe] = await db
      .update(cafes)
      .set({
        name: data.name,
        foundedYear,
        tagline: isNonEmptyString(data.tagline) ? data.tagline : null,
        story: isNonEmptyString(data.story) ? data.story : null,
        storySecondary: isNonEmptyString(data.storySecondary)
          ? data.storySecondary
          : null,
        whatsapp: isNonEmptyString(data.whatsapp) ? data.whatsapp : null,
        phone: isNonEmptyString(data.phone) ? data.phone : null,
        instagram: isNonEmptyString(data.instagram) ? data.instagram : null,
        mapsUrl: isNonEmptyString(data.mapsUrl) ? data.mapsUrl : null,
        address: serializeAddress(addressLines),
      })
      .where(eq(cafes.id, 1))
      .returning();

    if (!cafe) {
      return NextResponse.json(
        {
          success: false,
          message: "Café not found",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: cafe,
    });
  } catch (error) {
    console.error("Failed to save café:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to save café information",
      },
      { status: 500 },
    );
  }
}
export async function GET() {
  try {
    const [cafe] = await db.select().from(cafes).limit(1);

    if (!cafe) {
      return NextResponse.json(
        {
          success: false,
          message: "Café not found",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: cafe,
    });
  } catch (error) {
    console.error("Failed to fetch café:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch café information",
      },
      { status: 500 },
    );
  }
}