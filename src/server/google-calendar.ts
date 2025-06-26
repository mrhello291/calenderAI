import { google } from 'googleapis';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

export class GoogleCalendarService {
  private calendar;
  private db: PrismaClient;

  constructor(accessToken: string, db: PrismaClient) {
    this.calendar = google.calendar({
      version: 'v3',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    this.db = db;
  }

  // Fetch all future events from Google Calendar
  async fetchFutureEvents() {
    try {
      const now = new Date();
      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 2500, // Adjust based on your needs
      });

      return response.data.items ?? [];
    } catch (error) {
      console.error('Error fetching Google Calendar events:', error);
      throw error;
    }
  }

  // Sync events to database
  async syncEventsToDatabase(userId: string) {
    try {
      const googleEvents = await this.fetchFutureEvents();
      
      // Get existing events for this user
      const existingEvents = await this.db.events.findMany({
        where: { user_id: userId },
        select: { id: true }
      });
      const existingEventIds = new Set(existingEvents.map(e => e.id));

      // Process each Google Calendar event
      for (const event of googleEvents) {
        if (!event.id) continue;

        const eventData = {
          id: event.id,
          user_id: userId,
          title: event.summary ?? 'Untitled Event',
          description: event.description ?? null,
          calendar_id: event.organizer?.email ?? 'primary',
          start_time: new Date(event.start?.dateTime ?? event.start?.date ?? ''),
          end_time: new Date(event.end?.dateTime ?? event.end?.date ?? ''),
          is_cancelled: event.status === 'cancelled',
          is_recurring: Array.isArray(event.recurrence) && event.recurrence.length > 0,
          recurrence: Array.isArray(event.recurrence) ? event.recurrence : undefined,
          updated_at: new Date(),
        };
        
        await this.db.events.upsert({
          where: { id: event.id },
          update: eventData,
          create: eventData,
        });

        // Remove from existing events set
        existingEventIds.delete(event.id);
      }

      // Delete events that no longer exist in Google Calendar
      if (existingEventIds.size > 0) {
        await this.db.events.deleteMany({
          where: {
            id: { in: Array.from(existingEventIds) },
            user_id: userId,
          },
        });
      }

      return { synced: googleEvents.length, deleted: existingEventIds.size };
    } catch (error) {
      console.error('Error syncing events to database:', error);
      throw error;
    }
  }

  // Set up Google Calendar Watch API for real-time updates
  async setupWatch(userId: string, webhookUrl: string) {
    try {
      const channelId = `calendar-watch-${userId}-${randomUUID()}`;
      const response = await this.calendar.events.watch({
        calendarId: 'primary',
        requestBody: {
          id: channelId,
          type: 'web_hook',
          address: webhookUrl,
          params: {
            ttl: '86400', // 24 hours
          },
        },
      });

      // Store the watch resource ID and channel ID for later cleanup
      await this.db.users.update({
        where: { id: userId },
        data: {
          google_watch_resource_id: response.data.resourceId,
          google_watch_channel_id: channelId,
          google_watch_expires_at: new Date(response.data.expiration ?? ''),
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error setting up Google Calendar watch:', error);
      throw error;
    }
  }

  // Stop watching for changes
  async stopWatch(userId: string) {
    try {
      const user = await this.db.users.findUnique({
        where: { id: userId },
        select: { google_watch_resource_id: true, google_watch_channel_id: true },
      });

      if (user?.google_watch_resource_id || user?.google_watch_channel_id) {
        // Clear the watch resource ID and channel ID
        await this.db.users.update({
          where: { id: userId },
          data: {
            google_watch_resource_id: null,
            google_watch_channel_id: null,
            google_watch_expires_at: null,
          },
        });
      }
    } catch (error) {
      console.error('Error stopping Google Calendar watch:', error);
      throw error;
    }
  }

  // Refresh access token using refresh token
  static async refreshAccessToken(refreshToken: string) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();
    return credentials;
  }
} 