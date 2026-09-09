import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export async function POST(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");

    const token = cookieHeader
      ?.split(";")
      .find((cookie) => cookie.trim().startsWith("session_token="))
      ?.split("=")[1];

    if (token) {
      const db = await getDb();

      await db.collection("sessions").deleteOne({
        token,
      });
    }

    const response = NextResponse.json({
      message: "Logged out successfully",
    });

    response.cookies.set("session_token", "", {
      httpOnly: true,
      expires: new Date(0),
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Logout error:", error);

    return NextResponse.json(
      { error: "Unable to logout" },
      { status: 500 }
    );
  }
}