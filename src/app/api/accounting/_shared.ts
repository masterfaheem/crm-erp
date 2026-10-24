import { NextResponse } from "next/server";
import { cleanDate } from "@/lib/leadsTable";

export const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
export const ymd = (v: unknown) => cleanDate(v);
export const todayPKT = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
