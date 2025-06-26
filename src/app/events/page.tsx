"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../_components/AuthProvider";
import { api } from "~/trpc/react";

interface Event {
  id: string;
  title: string;
  description: string | null;
  start_time: Date;
  end_time: Date;
  is_cancelled: boolean;
  is_recurring: boolean;
  calendar_id: string | null;
  attendees: Array<{
    email: string;
    response_status: string;
  }>;
  tags: Array<{
    tag: string;
  }>;
}

export default function EventsPage() {
  const { user, loading } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncMessage, setSyncMessage] = useState<string>("");

  const { data: eventsData, isLoading: eventsLoading, refetch } = api.calendar.getEvents.useQuery(
    {
      limit: 100,
    },
    {
      enabled: !!user,
    }
  );

  const { data: watchStatus, isLoading: watchLoading, refetch: refetchWatch } = api.calendar.getWatchStatus.useQuery(undefined, { enabled: !!user });

  // Helper to determine if real-time sync is active
  const isWatchActive = !!watchStatus?.google_watch_resource_id &&
    !!watchStatus?.google_watch_channel_id &&
    typeof watchStatus?.google_watch_expires_at === 'string' &&
    new Date(watchStatus.google_watch_expires_at).getTime() > Date.now();

  const watchExpiresSoon = isWatchActive &&
    typeof watchStatus?.google_watch_expires_at === 'string' &&
    (new Date(watchStatus.google_watch_expires_at).getTime() - Date.now() < 1000 * 60 * 60); // less than 1 hour

  const syncEventsMutation = api.calendar.syncEvents.useMutation({
    onSuccess: (data) => {
      setSyncMessage(`Successfully synced ${data.synced} events and removed ${data.deleted} old events.`);
      void refetch(); // Refresh the events list
      setTimeout(() => setSyncMessage(""), 5000); // Clear message after 5 seconds
    },
    onError: (error) => {
      setSyncMessage(`Error syncing calendar: ${error.message}`);
      setTimeout(() => setSyncMessage(""), 5000);
    },
  });

  const setupWatchMutation = api.calendar.setupWatch.useMutation({
    onSuccess: (data) => {
      setSyncMessage(`Real-time sync enabled! Watch expires at: ${new Date(data.expiration ?? '').toLocaleString()}`);
      setTimeout(() => setSyncMessage(""), 5000);
    },
    onError: (error) => {
      setSyncMessage(`Error enabling real-time sync: ${error.message}`);
      setTimeout(() => setSyncMessage(""), 5000);
    },
  });

  useEffect(() => {
    if (eventsData) {
      setEvents(eventsData);
      setIsLoading(false);
    }
  }, [eventsData]);

  const handleSyncCalendar = () => {
    setSyncMessage("Syncing calendar...");
    syncEventsMutation.mutate();
  };

  const handleSetupWatch = () => {
    setSyncMessage("Enabling real-time sync...");
    setupWatchMutation.mutate();
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading events...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Please log in to view events</h1>
        </div>
      </div>
    );
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(date));
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(date));
  };

  const getEventStatusColor = (event: Event) => {
    if (event.is_cancelled) return 'bg-red-100 text-red-800';
    if (event.is_recurring) return 'bg-blue-100 text-blue-800';
    return 'bg-green-100 text-green-800';
  };

  const getEventStatusText = (event: Event) => {
    if (event.is_cancelled) return 'Cancelled';
    if (event.is_recurring) return 'Recurring';
    return 'Confirmed';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Events</h1>
              <p className="mt-1 text-sm text-gray-500">
                {events.length} upcoming event{events.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex flex-col items-end space-y-2">
              {syncMessage && (
                <div className={`text-sm px-3 py-1 rounded-md ${
                  syncMessage.includes('Error') 
                    ? 'bg-red-100 text-red-800' 
                    : syncMessage.includes('Syncing') 
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-green-100 text-green-800'
                }`}>
                  {syncMessage}
                </div>
              )}
              <button 
                onClick={handleSyncCalendar}
                disabled={syncEventsMutation.isPending}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {syncEventsMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Syncing...
                  </>
                ) : (
                  'Sync Calendar'
                )}
              </button>
              <button 
                onClick={handleSetupWatch}
                disabled={setupWatchMutation.isPending}
                className={`bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center relative`}
              >
                {setupWatchMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Enabling...
                  </>
                ) : (
                  <>
                    Enable Real-Time Sync
                    {watchLoading ? (
                      <span className="ml-2 text-xs text-gray-200">Checking...</span>
                    ) : isWatchActive ? (
                      <span className={`ml-2 text-xs font-semibold ${watchExpiresSoon ? 'text-yellow-200' : 'text-green-200'}`}>Enabled{watchExpiresSoon ? ' (Expiring soon)' : ''}</span>
                    ) : (
                      <span className="ml-2 text-xs text-red-200 font-semibold">Disabled</span>
                    )}
                  </>
                )}
                {isWatchActive && typeof watchStatus?.google_watch_expires_at === 'string' && (
                  <span className="absolute right-2 top-1 text-[10px] text-gray-100">Expires: {new Date(watchStatus.google_watch_expires_at).toLocaleTimeString()}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Events List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {events.length === 0 ? (
          <div className="text-center py-12">
            <div className="mx-auto h-12 w-12 text-gray-400">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No events</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by syncing your Google Calendar.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <div
                key={event.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
              >
                <div className="p-6">
                  {/* Event Header */}
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">
                      {event.title}
                    </h3>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getEventStatusColor(event)}`}>
                      {getEventStatusText(event)}
                    </span>
                  </div>

                  {/* Event Time */}
                  <div className="mb-4">
                    <div className="flex items-center text-sm text-gray-600">
                      <svg className="flex-shrink-0 mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {formatDate(event.start_time)}
                    </div>
                    {event.start_time.toDateString() !== event.end_time.toDateString() && (
                      <div className="flex items-center text-sm text-gray-600 mt-1">
                        <span className="mr-2">to</span>
                        {formatDate(event.end_time)}
                      </div>
                    )}
                    {event.start_time.toDateString() === event.end_time.toDateString() && (
                      <div className="text-sm text-gray-500 mt-1">
                        {formatTime(event.start_time)} - {formatTime(event.end_time)}
                      </div>
                    )}
                  </div>

                  {/* Event Description */}
                  {event.description && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-600 line-clamp-3">
                        {event.description}
                      </p>
                    </div>
                  )}

                  {/* Event Tags */}
                  {event.tags.length > 0 && (
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-1">
                        {event.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800"
                          >
                            {tag.tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Event Attendees */}
                  {event.attendees.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center text-sm text-gray-600 mb-2">
                        <svg className="flex-shrink-0 mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        {event.attendees.length} attendee{event.attendees.length !== 1 ? 's' : ''}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {event.attendees.slice(0, 3).map((attendee, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            {attendee.email}
                          </span>
                        ))}
                        {event.attendees.length > 3 && (
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-600">
                            +{event.attendees.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Calendar Source */}
                  {event.calendar_id && event.calendar_id !== 'primary' && (
                    <div className="flex items-center text-xs text-gray-500">
                      <svg className="flex-shrink-0 mr-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {event.calendar_id}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 