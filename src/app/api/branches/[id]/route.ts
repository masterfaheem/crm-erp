import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

/* ============================================================
   AUTH HELPER
============================================================ */
async function requireUser(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = verifySession(token);
  if (!payload) return null;

  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, company_id, branch_id, name, email
     FROM users
     WHERE id = ? AND status = 'active'
     LIMIT 1`,
    [payload.userId]
  );
  const arr = rows as any[];
  return arr.length ? arr[0] : null;
}

/* ============================================================
   GET /api/branches/[id]
   Return a single branch scoped to the user's company.
============================================================ */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const authUser = await requireUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT
        id, company_id, name, code, email, phone,
        address, city, state, country,
        is_head_office, status, created_at, updated_at
       FROM branches
       WHERE id = ? AND company_id = ?
       LIMIT 1`,
      [id, authUser.company_id]
    );

    const branch = (rows as any[])[0];
    if (!branch) {
      return NextResponse.json(
        { error: "Branch not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(branch);
  } catch (err) {
    console.error("GET /api/branches/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ============================================================
   PUT /api/branches/[id]
   Update a branch scoped to the user's company.
============================================================ */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const { id } = await params;

    const authUser = await requireUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    /* ---- Fetch existing ---- */
    const [existingRows] = await conn.query(
      `SELECT * FROM branches WHERE id = ? AND company_id = ? LIMIT 1`,
      [id, authUser.company_id]
    );
    const existing = (existingRows as any[])[0];
    if (!existing) {
      return NextResponse.json(
        { error: "Branch not found" },
        { status: 404 }
      );
    }

    /* ---- Merge incoming values with existing ---- */
    const name = String(body.name ?? existing.name).trim();
    const code = String(body.code ?? existing.code).trim().toUpperCase();
    const email =
      body.email !== undefined
        ? body.email
          ? String(body.email).trim()
          : null
        : existing.email;
    const phone =
      body.phone !== undefined
        ? body.phone
          ? String(body.phone).trim()
          : null
        : existing.phone;
    const address =
      body.address !== undefined
        ? body.address
          ? String(body.address).trim()
          : null
        : existing.address;
    const city =
      body.city !== undefined
        ? body.city
          ? String(body.city).trim()
          : null
        : existing.city;
    const state =
      body.state !== undefined
        ? body.state
          ? String(body.state).trim()
          : null
        : existing.state;
    const country =
      body.country !== undefined
        ? body.country
          ? String(body.country).trim()
          : "Pakistan"
        : existing.country;
    const isHeadOffice =
      body.is_head_office !== undefined
        ? Boolean(body.is_head_office)
        : Boolean(existing.is_head_office);
    const status = body.status ?? existing.status;

    /* ---- Validation ---- */
    if (!name || !code) {
      return NextResponse.json(
        { error: "Branch name and code are required" },
        { status: 400 }
      );
    }
    if (!["active", "inactive"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    /* ---- Duplicate code check (excluding self) ---- */
    const [dup] = await conn.query(
      `SELECT id FROM branches
       WHERE company_id = ? AND code = ? AND id <> ? LIMIT 1`,
      [authUser.company_id, code, id]
    );
    if ((dup as any[]).length) {
      return NextResponse.json(
        { error: "Another branch already uses this code" },
        { status: 409 }
      );
    }

    await conn.beginTransaction();

    /* ---- Only one head office per company ---- */
    if (isHeadOffice) {
      await conn.query(
        `UPDATE branches SET is_head_office = FALSE
         WHERE company_id = ? AND id <> ?`,
        [authUser.company_id, id]
      );
    }

    /* ---- Update ---- */
    await conn.query(
      `UPDATE branches SET
        name = ?, code = ?, email = ?, phone = ?, address = ?,
        city = ?, state = ?, country = ?, is_head_office = ?, status = ?
       WHERE id = ? AND company_id = ?`,
      [
        name,
        code,
        email,
        phone,
        address,
        city,
        state,
        country,
        isHeadOffice,
        status,
        id,
        authUser.company_id,
      ]
    );

    /* ---- Audit log (best-effort) ---- */
    try {
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        req.headers.get("x-real-ip") ||
        null;
      const ua = req.headers.get("user-agent") || null;

      await conn.query(
        `INSERT INTO audit_logs
          (company_id, user_id, action, entity_type, entity_id,
           old_values, new_values, ip_address, user_agent)
         VALUES (?, ?, 'update', 'branch', ?, ?, ?, ?, ?)`,
        [
          authUser.company_id,
          authUser.id,
          id,
          JSON.stringify({
            name: existing.name,
            code: existing.code,
            status: existing.status,
          }),
          JSON.stringify({ name, code, status }),
          ip,
          ua ? ua.slice(0, 500) : null,
        ]
      );
    } catch {
      /* ignore */
    }

    await conn.commit();

    return NextResponse.json({ message: "Branch updated successfully" });
  } catch (err) {
    await conn.rollback();
    console.error("PUT /api/branches/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}

/* ============================================================
   DELETE /api/branches/[id]
   Guards:
     - cannot delete the branch you're currently in
     - cannot delete a branch that still has users assigned
============================================================ */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const { id } = await params;

    const authUser = await requireUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const branchId = Number(id);

    /* ---- Exists? ---- */
    const [existingRows] = await conn.query(
      `SELECT id, name FROM branches
       WHERE id = ? AND company_id = ? LIMIT 1`,
      [branchId, authUser.company_id]
    );
    if (!(existingRows as any[]).length) {
      return NextResponse.json(
        { error: "Branch not found" },
        { status: 404 }
      );
    }

    /* ---- Don't allow deleting your own current branch ---- */
    if (branchId === authUser.branch_id) {
      return NextResponse.json(
        {
          error:
            "You cannot delete the branch you are currently assigned to",
        },
        { status: 400 }
      );
    }

    /* ---- Don't allow deleting a branch with users ---- */
    const [userCountRows] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM users WHERE branch_id = ?`,
      [branchId]
    );
    const userCount = (userCountRows as any[])[0].cnt as number;
    if (userCount > 0) {
      return NextResponse.json(
        {
          error: `This branch has ${userCount} user${
            userCount > 1 ? "s" : ""
          } assigned. Reassign them first.`,
        },
        { status: 400 }
      );
    }

    await conn.query(`DELETE FROM branches WHERE id = ? AND company_id = ?`, [
      branchId,
      authUser.company_id,
    ]);

    /* ---- Audit log (best-effort) ---- */
    try {
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        req.headers.get("x-real-ip") ||
        null;
      const ua = req.headers.get("user-agent") || null;

      await conn.query(
        `INSERT INTO audit_logs
          (company_id, user_id, action, entity_type, entity_id, ip_address, user_agent)
         VALUES (?, ?, 'delete', 'branch', ?, ?, ?)`,
        [
          authUser.company_id,
          authUser.id,
          branchId,
          ip,
          ua ? ua.slice(0, 500) : null,
        ]
      );
    } catch {
      /* ignore */
    }

    return NextResponse.json({ message: "Branch deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/branches/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}