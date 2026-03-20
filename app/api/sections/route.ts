import { NextRequest, NextResponse } from "next/server";
import {
  loadCourses,
  hasTimeConflict,
  hasScheduleConflict,
  BlockedTime,
  CourseSection,
} from "../generate-schedule/route";

export async function POST(req: NextRequest) {
  try {
    const {
      subject,
      number,
      blocked_times = [],
      other_scheduled = [],
    }: {
      subject: string;
      number: string;
      blocked_times: BlockedTime[];
      other_scheduled: CourseSection[];
    } = await req.json();

    const allSections = loadCourses();

    const sections = allSections.filter((s) => {
      if (s.subject !== subject || s.number !== number) return false;
      if (s.type !== "LEC") return false;
      if (!s.startTime || s.startTime === "TBA") return false;
      if (hasTimeConflict(s, blocked_times)) return false;
      if (hasScheduleConflict(s, other_scheduled)) return false;
      return true;
    });

    return NextResponse.json({ sections });
  } catch (err) {
    console.error("sections error:", err);
    return NextResponse.json({ error: "Failed to fetch sections" }, { status: 500 });
  }
}
