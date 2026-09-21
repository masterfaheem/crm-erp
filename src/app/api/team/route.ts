import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
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
    
    // Get all team members
    const [rows] = await pool.execute(`
      SELECT 
        id, 
        first_name, 
        last_name, 
        email, 
        phone, 
        position, 
        department,
        role, 
        status, 
        avatar_url, 
        hire_date, 
        salary, 
        shift,
        address, 
        city, 
        state, 
        zip_code, 
        country,
        emergency_contact, 
        emergency_phone,
        skills, 
        certifications, 
        bio,
        created_at, 
        updated_at
      FROM team 
      ORDER BY created_at DESC
    `);

    // Parse JSON fields with error handling
    const members = (rows as any[]).map(member => ({
      ...member,
      skills: parseJsonField(member.skills),
      certifications: parseJsonField(member.certifications),
    }));

    return NextResponse.json(members);
  } catch (error) {
    console.error('Error fetching team members:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to safely parse JSON fields
function parseJsonField(value: any): any[] {
  if (!value) return [];
  
  // If it's already an array, return it
  if (Array.isArray(value)) return value;
  
  // If it's a string, try to parse it
  if (typeof value === 'string') {
    // Check if it's a JSON array format
    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        return JSON.parse(value);
      } catch {
        // If JSON parsing fails, treat as comma-separated
        return value.split(',').map(item => item.trim()).filter(item => item);
      }
    } else {
      // Treat as comma-separated string
      return value.split(',').map(item => item.trim()).filter(item => item);
    }
  }
  
  return [];
}

export async function POST(request: NextRequest) {
  try {
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
        { message: 'First name, last name, email, and position are required' },
        { status: 400 }
      );
    }

    const pool = getPool();

    // Check if email already exists
    const [existing] = await pool.execute(
      'SELECT id FROM team WHERE email = ?',
      [data.email]
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

    // Insert new team member
    const [result] = await pool.execute(
      `INSERT INTO team (
        first_name, last_name, email, phone, position, department,
        role, status, hire_date, salary, shift,
        address, city, state, zip_code, country,
        emergency_contact, emergency_phone,
        skills, certifications, bio
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        data.bio || null
      ]
    );

    return NextResponse.json(
      { 
        success: true, 
        message: 'Team member created successfully',
        id: (result as any).insertId 
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating team member:', error);
    
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

// Helper function to process array fields
function processArrayField(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    // If it's a JSON string, parse it
    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        // If JSON parsing fails, treat as comma-separated
        return value.split(',').map(item => item.trim()).filter(item => item);
      }
    }
    // Treat as comma-separated string
    return value.split(',').map(item => item.trim()).filter(item => item);
  }
  return [];
}