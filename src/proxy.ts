import { NextRequest, NextResponse } from "next/server";
import { accessFromRequest } from "@/lib/access";
import { allowed, apiNeed, pageNeed } from "@/lib/permissions";

/* ============================================================
   PROXY — permission gate in front of every API call and page.
   API without permission -> 403 JSON.  Page -> redirect.
   Field-level hiding (cost, profit, khata) is done in the
   route handlers with can().
============================================================ */
/* no login needed: sign-in itself + incoming webhooks (e.g. WhatsApp / Meta calls these
   without a cookie — they must check their own verify token / signature) */
const PUBLIC_API = /^\/api\/(auth\/|webhooks?(\/|$)|whatsapp\/webhook)/;

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi) {
    if (PUBLIC_API.test(pathname)) return NextResponse.next();
    let access = null;
    try {
      access = await accessFromRequest(req);
    } catch (e) {
      console.error("[proxy] access check failed", e);
      return NextResponse.json({ error: "Could not verify your access. Try again." }, { status: 503 });
    }
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const need = apiNeed(pathname, req.method);
    if (!allowed(need, access.perms, access.isSuperAdmin)) {
      return NextResponse.json(
        { error: "You don't have permission for this. Ask your admin to give access." },
        { status: 403 }
      );
    }
    return NextResponse.next();
  }

  /* pages */
  const need = pageNeed(pathname);
  if (!need) return NextResponse.next();
  let access = null;
  try {
    access = await accessFromRequest(req);
  } catch (e) {
    console.error("[proxy] page access check failed", e);
    return NextResponse.next(); // page itself still needs API data, which stays protected
  }
  if (!access) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (!allowed(need, access.perms, access.isSuperAdmin)) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = `?denied=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|txt|woff2?)$).*)"],
};
