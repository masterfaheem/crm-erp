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
    const [rows] = await pool.execute(
      'SELECT * FROM whatsapp_settings LIMIT 1'
    );

    const settings = (rows as any[])[0];
    if (!settings) {
      // Return empty settings if none exist
      return NextResponse.json({
        id: null,
        whatsapp_business_account_id: '',
        phone_number_id: '',
        access_token: '',
        business_name: '',
        phone_number: '',
        display_phone_number: '',
        quality_rating: '',
        status: 'disconnected',
        webhook_url: '',
        webhook_verify_token: '',
        is_active: true,
        last_verified_at: null,
        expires_at: null,
        meta_data: null,
      });
    }

    // Parse JSON fields
    if (settings.meta_data && typeof settings.meta_data === 'string') {
      settings.meta_data = JSON.parse(settings.meta_data);
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error fetching WhatsApp settings:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

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

    const data = await request.json();
    const pool = getPool();

    // Check if settings already exist
    const [existing] = await pool.execute(
      'SELECT id FROM whatsapp_settings LIMIT 1'
    );

    let result;
    if ((existing as any[]).length > 0) {
      // Update existing settings
      const [updateResult] = await pool.execute(
        `UPDATE whatsapp_settings SET
          whatsapp_business_account_id = ?,
          phone_number_id = ?,
          access_token = ?,
          business_name = ?,
          phone_number = ?,
          display_phone_number = ?,
          webhook_url = ?,
          webhook_verify_token = ?,
          is_active = ?,
          updated_at = NOW()
        WHERE id = ?`,
        [
          data.whatsapp_business_account_id || null,
          data.phone_number_id || null,
          data.access_token || null,
          data.business_name || null,
          data.phone_number || null,
          data.display_phone_number || null,
          data.webhook_url || null,
          data.webhook_verify_token || null,
          data.is_active !== undefined ? data.is_active : true,
          (existing as any[])[0].id
        ]
      );
      result = updateResult;
    } else {
      // Insert new settings
      const [insertResult] = await pool.execute(
        `INSERT INTO whatsapp_settings (
          whatsapp_business_account_id,
          phone_number_id,
          access_token,
          business_name,
          phone_number,
          display_phone_number,
          webhook_url,
          webhook_verify_token,
          is_active,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.whatsapp_business_account_id || null,
          data.phone_number_id || null,
          data.access_token || null,
          data.business_name || null,
          data.phone_number || null,
          data.display_phone_number || null,
          data.webhook_url || null,
          data.webhook_verify_token || null,
          data.is_active !== undefined ? data.is_active : true,
          'disconnected'
        ]
      );
      result = insertResult;
    }

    return NextResponse.json({
      success: true,
      message: 'Settings saved successfully',
    });
  } catch (error: any) {
    console.error('Error saving WhatsApp settings:', error);
    return NextResponse.json(
      { message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}