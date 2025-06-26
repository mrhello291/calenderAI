import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { GoogleCalendarService } from "~/server/google-calendar";

export const calendarRouter = createTRPCRouter({
  // Sync user's Google Calendar events
  syncEvents: protectedProcedure.mutation(async ({ ctx }) => {
    console.log('Checking Google tokens for user:', ctx.user.id);
    
    const user = await ctx.db.users.findUnique({
      where: { id: ctx.user.id },
      select: {
        google_access_token: true,
        google_refresh_token: true,
        google_token_expires_at: true,
      },
    });

    console.log('User record found:', !!user, 'Has access token:', !!user?.google_access_token);

    if (!user?.google_access_token) {
      throw new Error("Google Calendar not connected");
    }

    // Check if token is expired and refresh if needed
    let accessToken = user.google_access_token;
    if (user.google_token_expires_at && user.google_token_expires_at < new Date()) {
      if (!user.google_refresh_token) {
        throw new Error("Refresh token not available");
      }

      const credentials = await GoogleCalendarService.refreshAccessToken(user.google_refresh_token);
      accessToken = credentials.access_token!;

      // Update tokens in database
      await ctx.db.users.update({
        where: { id: ctx.user.id },
        data: {
          google_access_token: accessToken,
          google_token_expires_at: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
        },
      });
    }

    const calendarService = new GoogleCalendarService(accessToken, ctx.db);
    return await calendarService.syncEventsToDatabase(ctx.user.id);
  }),

  // Set up Google Calendar Watch API
  setupWatch: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await ctx.db.users.findUnique({
      where: { id: ctx.user.id },
      select: { google_access_token: true },
    });

    if (!user?.google_access_token) {
      throw new Error("Google Calendar not connected");
    }

    const calendarService = new GoogleCalendarService(user.google_access_token, ctx.db);
    const webhookUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/calendar/webhook`;
    
    return await calendarService.setupWatch(ctx.user.id, webhookUrl);
  }),

  // Stop Google Calendar Watch API
  stopWatch: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await ctx.db.users.findUnique({
      where: { id: ctx.user.id },
      select: { google_access_token: true },
    });

    if (!user?.google_access_token) {
      throw new Error("Google Calendar not connected");
    }

    const calendarService = new GoogleCalendarService(user.google_access_token, ctx.db);
    return await calendarService.stopWatch(ctx.user.id);
  }),

  // Get user's events
  getEvents: protectedProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const where = {
        user_id: ctx.user.id,
        ...((input.startDate ?? input.endDate) ? {
          start_time: {
            ...(input.startDate && { gte: input.startDate }),
            ...(input.endDate && { lte: input.endDate }),
          }
        } : {})
      };

      return await ctx.db.events.findMany({
        where,
        orderBy: { start_time: 'asc' },
        take: input.limit,
        include: {
          attendees: true,
          tags: true,
        },
      });
    }),

  // Get user's real-time sync (watch) status
  getWatchStatus: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.users.findUnique({
      where: { id: ctx.user.id },
      select: {
        google_watch_resource_id: true,
        google_watch_channel_id: true,
        google_watch_expires_at: true,
      },
    });
    return user;
  }),
}); 