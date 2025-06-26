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
          google_resource_id: event.htmlLink ? new URL(event.htmlLink).pathname.split('/').pop() : null, // Extract resource ID from HTML link
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

      // Log the response for debugging
      console.log('Watch response:', response.data);

      // Parse expiration safely
      let expiration: Date | null = null;
      if (response.data.expiration) {
        const expNum = Number(response.data.expiration);
        if (!isNaN(expNum)) {
          expiration = new Date(expNum);
        }
      }

      await this.db.users.update({
        where: { id: userId },
        data: {
          google_watch_resource_id: response.data.resourceId,
          google_watch_channel_id: channelId,
          google_watch_expires_at: expiration,
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

  // Fetch recent events from Google Calendar (more efficient for webhooks)
  async fetchRecentEvents(minutesBack = 5) {
    try {
      const now = new Date();
      const timeMin = new Date(now.getTime() - minutesBack * 60 * 1000);
      
      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 100, // Smaller limit for recent events
      });

      return response.data.items ?? [];
    } catch (error) {
      console.error('Error fetching recent Google Calendar events:', error);
      throw error;
    }
  }

  // Efficient sync for webhook updates - only sync recent events
  async syncRecentEventsToDatabase(userId: string, minutesBack = 5) {
    try {
      console.log(`🔄 Syncing recent events (last ${minutesBack} minutes) for user:`, userId);
      
      const googleEvents = await this.fetchRecentEvents(minutesBack);
      console.log(`📅 Found ${googleEvents.length} recent events`);
      
      // Get existing events for this user in the recent time range
      const now = new Date();
      const timeMin = new Date(now.getTime() - minutesBack * 60 * 1000);
      
      const existingEvents = await this.db.events.findMany({
        where: { 
          user_id: userId,
          start_time: {
            gte: timeMin
          }
        },
        select: { id: true, start_time: true }
      });
      
      const existingEventIds = new Set(existingEvents.map(e => e.id));
      let synced = 0;
      let deleted = 0;

      // Process each recent Google Calendar event
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
        synced++;

        // Remove from existing events set
        existingEventIds.delete(event.id);
      }

      // Delete events that no longer exist in Google Calendar (only recent ones)
      if (existingEventIds.size > 0) {
        await this.db.events.deleteMany({
          where: {
            id: { in: Array.from(existingEventIds) },
            user_id: userId,
          },
        });
        deleted = existingEventIds.size;
      }

      console.log(`✅ Recent sync completed: ${synced} synced, ${deleted} deleted`);
      return { synced, deleted };
    } catch (error) {
      console.error('Error syncing recent events to database:', error);
      throw error;
    }
  }

  // Sync a single event by resource ID (most efficient for webhooks)
  async syncEventByResourceId(resourceId: string, userId: string) {
    try {
      console.log(`🔄 Syncing single event by resource ID: ${resourceId} for user: ${userId}`);
      
      // Find the event in our database by resource ID
      const existingEvent = await this.db.events.findFirst({
        where: { 
          google_resource_id: resourceId,
          user_id: userId 
        }
      });

      if (!existingEvent) {
        console.log(`🆕 Event not found in database for resource ID: ${resourceId} - fetching from Google Calendar`);
        
        // Try to find the event by searching recent events
        const recentEvents = await this.fetchRecentEvents(10); // Last 10 minutes
        const newEvent = recentEvents.find(event => {
          const eventResourceId = event.htmlLink ? new URL(event.htmlLink).pathname.split('/').pop() : null;
          return eventResourceId === resourceId;
        });

        if (!newEvent) {
          console.log(`⚠️ Event not found in recent events for resource ID: ${resourceId}`);
          return { synced: 0, deleted: 0 };
        }

        // Check if the event is in the future
        const eventStartTime = new Date(newEvent.start?.dateTime ?? newEvent.start?.date ?? '');
        const now = new Date();
        
        if (eventStartTime <= now) {
          console.log(`⏰ Event is in the past, skipping: ${newEvent.summary}`);
          return { synced: 0, deleted: 0 };
        }

        // Add the new future event to database
        const eventData = {
          id: newEvent.id!,
          user_id: userId,
          title: newEvent.summary ?? 'Untitled Event',
          description: newEvent.description ?? null,
          calendar_id: newEvent.organizer?.email ?? 'primary',
          google_resource_id: newEvent.htmlLink ? new URL(newEvent.htmlLink).pathname.split('/').pop() : null,
          start_time: eventStartTime,
          end_time: new Date(newEvent.end?.dateTime ?? newEvent.end?.date ?? ''),
          is_cancelled: newEvent.status === 'cancelled',
          is_recurring: Array.isArray(newEvent.recurrence) && newEvent.recurrence.length > 0,
          recurrence: Array.isArray(newEvent.recurrence) ? newEvent.recurrence : undefined,
          updated_at: new Date(),
        };

        await this.db.events.create({
          data: eventData,
        });

        console.log(`✅ New future event added: ${newEvent.summary}`);
        return { synced: 1, deleted: 0 };
      }

      // Event exists - fetch the updated version from Google Calendar
      const event = await this.calendar.events.get({
        calendarId: 'primary',
        eventId: existingEvent.id
      });

      if (!event.data) {
        console.log(`🗑️ Event was deleted from Google Calendar: ${existingEvent.id}`);
        // Delete from our database
        await this.db.events.delete({
          where: { id: existingEvent.id }
        });
        return { synced: 0, deleted: 1 };
      }

      // Check if the updated event is still in the future
      const eventStartTime = new Date(event.data.start?.dateTime ?? event.data.start?.date ?? '');
      const now = new Date();
      
      if (eventStartTime <= now) {
        console.log(`⏰ Updated event is in the past, deleting: ${event.data.summary}`);
        await this.db.events.delete({
          where: { id: existingEvent.id }
        });
        return { synced: 0, deleted: 1 };
      }

      // Update the event in our database
      const eventData = {
        id: event.data.id!,
        user_id: userId,
        title: event.data.summary ?? 'Untitled Event',
        description: event.data.description ?? null,
        calendar_id: event.data.organizer?.email ?? 'primary',
        google_resource_id: event.data.htmlLink ? new URL(event.data.htmlLink).pathname.split('/').pop() : null,
        start_time: eventStartTime,
        end_time: new Date(event.data.end?.dateTime ?? event.data.end?.date ?? ''),
        is_cancelled: event.data.status === 'cancelled',
        is_recurring: Array.isArray(event.data.recurrence) && event.data.recurrence.length > 0,
        recurrence: Array.isArray(event.data.recurrence) ? event.data.recurrence : undefined,
        updated_at: new Date(),
      };

      await this.db.events.upsert({
        where: { id: event.data.id! },
        update: eventData,
        create: eventData,
      });

      console.log(`✅ Event updated: ${event.data.summary}`);
      return { synced: 1, deleted: 0 };
    } catch (error) {
      console.error('Error syncing single event by resource ID:', error);
      return { synced: 0, deleted: 0 };
    }
  }
} 