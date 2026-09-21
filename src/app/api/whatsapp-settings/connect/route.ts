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
    
    // Get settings
    const [rows] = await pool.execute(
      'SELECT * FROM whatsapp_settings LIMIT 1'
    );
    
    const settings = (rows as any[])[0];
    if (!settings) {
      return NextResponse.json(
        { message: 'No settings found. Please save settings first.' },
        { status: 400 }
      );
    }

    // Verify with Facebook/Meta API
    const accessToken = settings.access_token;
    const phoneNumberId = settings.phone_number_id;
    
    if (!accessToken || !phoneNumberId) {
      return NextResponse.json(
        { message: 'Missing access token or phone number ID' },
        { status: 400 }
      );
    }

    // Check phone number status
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}?access_token=${accessToken}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Facebook API verification failed');
    }

    const data = await response.json();
    
    // Update status to connected
    await pool.execute(
      `UPDATE whatsapp_settings SET 
        status = 'connected',
        last_verified_at = NOW(),
        meta_data = ?,
        display_phone_number = ?,
        quality_rating = ?
      WHERE id = ?`,
      [
        JSON.stringify(data),
        data.display_phone_number || settings.display_phone_number,
        data.quality_rating || 'unknown',
        settings.id
      ]
    );

    return NextResponse.json({
      success: true,
      message: 'Successfully connected to WhatsApp Business API',
      data
    });
  } catch (error: any) {
    console.error('Connection error:', error);
    return NextResponse.json(
      { message: error.message || 'Connection failed' },
      { status: 500 }
    );
  }
}