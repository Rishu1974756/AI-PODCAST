import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");

    const token = cookieHeader
      ?.split(";")
      .find((cookie) =>
        cookie.trim().startsWith("session_token=")
      )
      ?.split("=")[1];

    if (!token) {
      return NextResponse.json(
        { error: "Please login first" },
        { status: 401 }
      );
    }

    const db = await getDb();

    const session = await db.collection("sessions").findOne({
      token,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session expired. Please login again." },
        { status: 401 }
      );
    }

    const episodes = await db
      .collection("episodes")
      .find({
        userId: session.userId,
      })
      .sort({
        updatedAt: -1,
        createdAt: -1,
      })
      .toArray();

    const formattedEpisodes = episodes.map((episode) => ({
      id: episode._id.toString(),
      topic: episode.topic || "",
      tone: episode.tone || "Professional",
      duration: episode.duration || "30 minutes",
      title:
        episode.title ||
        episode.topic ||
        "Untitled Podcast",
      description: episode.description || "",
      segments: episode.segments || [],
      guestQuestions: episode.guestQuestions || [],
      guest: episode.guest || null,
      messages: episode.messages || [],
      createdAt: episode.createdAt
        ? episode.createdAt.toISOString()
        : null,
      updatedAt: episode.updatedAt
        ? episode.updatedAt.toISOString()
        : null,
    }));

    return NextResponse.json({
      success: true,
      episodes: formattedEpisodes,
    });
  } catch (error) {
    console.error("History error:", error);

    return NextResponse.json(
      {
        error: "Unable to load podcast history",
      },
      { status: 500 }
    );
  }
}
