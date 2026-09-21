import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/auth';

// Helper function to safely parse JSON fields
function parseJsonField(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  if (typeof value === 'string') {
    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        return JSON.parse(value);
      } catch {
        return value
          .split(',')
          .map(item => item.trim())
          .filter(item => item);
      }
    }

    return value
      .split(',')
      .map(item => item.trim())
      .filter(item => item);
  }

  return [];
}

// Helper function to process array fields
function processArrayField(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  if (typeof value === 'string') {
    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return value
          .split(',')
          .map(item => item.trim())
          .filter(item => item);
      }
    }

    return value
      .split(',')
      .map(item => item.trim())
      .filter(item => item);
  }

  return [];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify authentication
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const session = verifySession(token);

    if (!session) {
      return NextResponse.json(
        { message: 'Invalid session' },
        { status: 401 }
      );
    }

    const pool = getPool();

    const [rows] = await pool.execute(
      `SELECT * FROM team WHERE id = ?`,
      [id]
    );

    const members = rows as any[];

    if (members.length === 0) {
      return NextResponse.json(
        { message: 'Team member not found' },
        { status: 404 }
      );
    }

    const member = members[0];

    // Parse JSON fields with error handling
    member.skills = parseJsonField(member.skills);
    member.certifications = parseJsonField(member.certifications);

    return NextResponse.json(member);
  } catch (error) {
    console.error('Error fetching team member:', error);

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify authentication
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const session = verifySession(token);

    if (!session) {
      return NextResponse.json(
        { message: 'Invalid session' },
        { status: 401 }
      );
    }

    const data = await request.json();

    // Validate required fields
    if (!data.first_name || !data.last_name || !data.email || !data.position) {
      return NextResponse.json(
        {
          message:
            'First name, last name, email, and position are required'
        },
        { status: 400 }
      );
    }

    const pool = getPool();

    // Check if email exists for another user
    const [existing] = await pool.execute(
      'SELECT id FROM team WHERE email = ? AND id != ?',
      [data.email, id]
    );

    if ((existing as any[]).length > 0) {
      return NextResponse.json(
        { message: 'Email already exists' },
        { status: 409 }
      );
    }

    // Process skills and certifications
    const skills = processArrayField(data.skills);
    const certifications = processArrayField(data.certifications);

    // Update team member
    const [result] = await pool.execute(
      `UPDATE team SET
        first_name = ?,
        last_name = ?,
        email = ?,
        phone = ?,
        position = ?,
        department = ?,
        role = ?,
        status = ?,
        hire_date = ?,
        salary = ?,
        shift = ?,
        address = ?,
        city = ?,
        state = ?,
        zip_code = ?,
        country = ?,
        emergency_contact = ?,
        emergency_phone = ?,
        skills = ?,
        certifications = ?,
        bio = ?
      WHERE id = ?`,
      [
        data.first_name,
        data.last_name,
        data.email,
        data.phone || null,
        data.position,
        data.department || null,
        data.role || 'agent',
        data.status || 'active',
        data.hire_date || null,
        data.salary || null,
        data.shift || 'Day',
        data.address || null,
        data.city || null,
        data.state || null,
        data.zip_code || null,
        data.country || 'Pakistan',
        data.emergency_contact || null,
        data.emergency_phone || null,
        JSON.stringify(skills),
        JSON.stringify(certifications),
        data.bio || null,
        id
      ]
    );

    const affectedRows = (result as any).affectedRows;

    if (affectedRows === 0) {
      return NextResponse.json(
        { message: 'Team member not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Team member updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating team member:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { message: 'Email already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify authentication
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const session = verifySession(token);

    if (!session) {
      return NextResponse.json(
        { message: 'Invalid session' },
        { status: 401 }
      );
    }

    const pool = getPool();

    // Check if member exists
    const [existing] = await pool.execute(
      'SELECT id FROM team WHERE id = ?',
      [id]
    );

    if ((existing as any[]).length === 0) {
      return NextResponse.json(
        { message: 'Team member not found' },
        { status: 404 }
      );
    }

    // Delete team member
    await pool.execute(
      'DELETE FROM team WHERE id = ?',
      [id]
    );

    return NextResponse.json({
      success: true,
      message: 'Team member deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting team member:', error);

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
