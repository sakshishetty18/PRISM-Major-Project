import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await dbConnect();
    const userCount = await User.countDocuments();

    return NextResponse.json({
      status: "Connected via Mongoose!",
      userCount,
    });
  } catch (error) {
    console.error("Database health check failed:", error);
    return NextResponse.json(
      { status: "Error", error: "Database connection failed" },
      { status: 500 }
    );
  }
}