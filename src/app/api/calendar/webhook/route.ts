import { type NextRequest, NextResponse } from 'next/server';
import { db } from '~/server/db';
import { GoogleCalendarService } from '~/server/google-calendar';

export async function POST(request: NextRequest) {
  try {
    const headers = Object.fromEntries(request.headers.entries());
    console.log("🔔 Webhook received:", new Date().toISOString());
    console.log("Headers:", headers);

    const resourceId = headers['x-goog-resource-id'];
    const resourceUri = headers['x-goog-resource-uri'];
    const channelId = headers['x-goog-channel-id'];
    const messageNumber = headers['x-goog-message-number'];

    console.log(`📅 Change detected on resource: ${resourceId} | Channel: ${channelId}`);

    if (!resourceId || !channelId) {
      console.error('❌ Missing required headers:', { resourceId, channelId });
      return NextResponse.json({ error: 'Missing headers' }, { status: 400 });
    }

    // Find user by channel ID
    const user = await db.users.findFirst({
      where: { google_watch_channel_id: channelId },
      select: {
        id: true,
        google_access_token: true,
        google_refresh_token: true,
        google_token_expires_at: true,
      },
    });

    if (!user) {
      console.error('❌ User not found for channel:', channelId);
      return NextResponse.json({ error: 'User not found for this channel' }, { status: 404 });
    }

    console.log('👤 Processing webhook for user:', user.id);

    if (!user.google_access_token) {
      console.error('❌ No access token for user:', user.id);
      return NextResponse.json({ error: 'No access token' }, { status: 401 });
    }

    // Check if token is expired and refresh if needed
    let accessToken = user.google_access_token;
    if (user.google_token_expires_at && user.google_token_expires_at < new Date()) {
      if (!user.google_refresh_token) {
        console.error('❌ Refresh token not available for user:', user.id);
        return NextResponse.json({ error: 'Token expired' }, { status: 401 });
      }

      console.log('🔄 Refreshing access token for user:', user.id);
      const credentials = await GoogleCalendarService.refreshAccessToken(user.google_refresh_token);
      accessToken = credentials.access_token!;

      // Update tokens in database
      await db.users.update({
        where: { id: user.id },
        data: {
          google_access_token: accessToken,
          google_token_expires_at: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
        },
      });
    }

    // Sync the specific event that changed (most efficient)
    console.log('🔄 Syncing specific event by resource ID for user:', user.id);
    const calendarService = new GoogleCalendarService(accessToken, db);
    const result = await calendarService.syncEventByResourceId(resourceId, user.id);

    console.log(`✅ Calendar sync completed for user ${user.id}:`, result);
    
    // Return 200 OK quickly to prevent Google from dropping webhooks
    return NextResponse.json({ 
      success: true, 
      message: 'Calendar synced successfully',
      result 
    });

  } catch (error) {
    console.error('❌ Error processing calendar webhook:', error);
    // Still return 200 OK to prevent Google from dropping future webhooks
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 200 }
    );
  }
}

// Handle GET requests (for webhook verification)
export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    message: 'Calendar webhook endpoint is active',
    timestamp: new Date().toISOString()
  });
} 