import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const session = verifySession(token);
    if (!session) {
      return NextResponse.json({ message: 'Invalid session' }, { status: 401 });
    }

    const pool = getPool();
    
    // Update status to disconnected
    await pool.execute(
      `UPDATE whatsapp_settings SET 
        status = 'disconnected',
        last_verified_at = NULL
      WHERE id = (
        SELECT id FROM whatsapp_settings LIMIT 1
      )`
    );

    return NextResponse.json({
      success: true,
      message: 'Successfully disconnected from WhatsApp Business API'
    });
  } catch (error) {
    console.error('Disconnect error:', error);
    return NextResponse.json(
      { message: 'Disconnection failed' },
      { status: 500 }
    );
  }
}