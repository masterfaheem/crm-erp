import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/auth';

export async function GET(request: NextRequest) {
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
      return NextResponse.json({ status: 'disconnected' });
    }

    // Check if connected
    if (settings.status !== 'connected') {
      return NextResponse.json({ status: settings.status });
    }

    // Verify with Facebook/Meta API
    const accessToken = settings.access_token;
    const phoneNumberId = settings.phone_number_id;
    
    if (!accessToken || !phoneNumberId) {
      return NextResponse.json({ status: 'disconnected' });
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${phoneNumberId}?access_token=${accessToken}`,
        { method: 'GET' }
      );

      if (!response.ok) {
        // Token might be expired
        await pool.execute(
          `UPDATE whatsapp_settings SET status = 'expired' WHERE id = ?`,
          [settings.id]
        );
        return NextResponse.json({ status: 'expired' });
      }

      const data = await response.json();
      
      // Update last verified
      await pool.execute(
        `UPDATE whatsapp_settings SET 
          last_verified_at = NOW(),
          meta_data = ?
        WHERE id = ?`,
        [JSON.stringify(data), settings.id]
      );

      return NextResponse.json({ 
        status: 'connected',
        data: {
          display_phone_number: data.display_phone_number,
          quality_rating: data.quality_rating
        }
      });
    } catch (error) {
      console.error('Status check error:', error);
      return NextResponse.json({ status: settings.status });
    }
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { message: 'Status check failed' },
      { status: 500 }
    );
  }
}