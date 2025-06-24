import { type NextRequest, NextResponse } from 'next/server';
import { db } from '~/server/db';
import { GoogleCalendarService } from '~/server/google-calendar';

interface WebhookChallenge {
  type: 'webhook.challenge';
  challenge: string;
}

interface WebhookCalendar {
  type: 'webhook.calendar';
  resourceId: string;
  resourceUri: string;
}

type WebhookBody = WebhookChallenge | WebhookCalendar;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as WebhookBody;
    
    // Google Calendar webhook sends a challenge for verification
    if (body.type === 'webhook.challenge') {
      return NextResponse.json({ challenge: body.challenge });
    }

    // Handle calendar change notifications
    if (body.type === 'webhook.calendar') {
      const { resourceId } = body;
      
      // Extract user ID from resourceId (format: calendar-watch-{userId})
      const userId = resourceId?.replace('calendar-watch-', '');
      
      if (!userId) {
        console.error('Invalid resourceId in webhook:', resourceId);
        return NextResponse.json({ error: 'Invalid resourceId' }, { status: 400 });
      }

      // Get user's access token
      const user = await db.users.findUnique({
        where: { id: userId },
        select: {
          google_access_token: true,
          google_refresh_token: true,
          google_token_expires_at: true,
        },
      });

      if (!user?.google_access_token) {
        console.error('User not found or no access token:', userId);
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      // Check if token is expired and refresh if needed
      let accessToken = user.google_access_token;
      if (user.google_token_expires_at && user.google_token_expires_at < new Date()) {
        if (!user.google_refresh_token) {
          console.error('Refresh token not available for user:', userId);
          return NextResponse.json({ error: 'Token expired' }, { status: 401 });
        }

        const credentials = await GoogleCalendarService.refreshAccessToken(user.google_refresh_token);
        accessToken = credentials.access_token!;

        // Update tokens in database
        await db.users.update({
          where: { id: userId },
          data: {
            google_access_token: accessToken,
            google_token_expires_at: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
          },
        });
      }

      // Sync the user's calendar
      const calendarService = new GoogleCalendarService(accessToken, db);
      const result = await calendarService.syncEventsToDatabase(userId);

      console.log(`Calendar sync completed for user ${userId}:`, result);
      
      return NextResponse.json({ 
        success: true, 
        message: 'Calendar synced successfully',
        result 
      });
    }

    // Unknown webhook type
    console.warn('Unknown webhook type:', (body as { type: string }).type);
    return NextResponse.json({ error: 'Unknown webhook type' }, { status: 400 });

  } catch (error) {
    console.error('Error processing calendar webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
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