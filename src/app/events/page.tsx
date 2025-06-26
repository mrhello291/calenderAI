"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../_components/AuthProvider";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Calendar, Clock, Users, Tag, MapPin } from "lucide-react";

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

type OrganizedEvents = Record<
  string,
  Record<string, Record<string, Event[]>>
>;

export default function EventsPage() {
  const { user, loading } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncMessage, setSyncMessage] = useState<string>("");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const { data: eventsData, isLoading: eventsLoading, refetch } = api.calendar.getEvents.useQuery(
    {
      limit: 100,
    },
    {
      enabled: !!user,
    }
  );

  const { data: watchStatus, isLoading: watchLoading, refetch: refetchWatch } = api.calendar.getWatchStatus.useQuery(undefined, { enabled: !!user });
  
  console.log(watchStatus);
  // Helper to determine if real-time sync is active
  const isWatchActive = !!watchStatus?.google_watch_resource_id &&
    !!watchStatus?.google_watch_channel_id &&
    !!watchStatus?.google_watch_expires_at &&
    new Date(watchStatus.google_watch_expires_at).getTime() > Date.now();

  const watchExpiresSoon = isWatchActive &&
    !!watchStatus?.google_watch_expires_at &&
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
      void refetchWatch(); // Refresh watch status
    },
    onError: (error) => {
      setSyncMessage(`Error enabling real-time sync: ${error.message}`);
      setTimeout(() => setSyncMessage(""), 5000);
    },
  });

  const stopWatchMutation = api.calendar.stopWatch.useMutation({
    onSuccess: () => {
      setSyncMessage("Real-time sync disabled successfully.");
      setTimeout(() => setSyncMessage(""), 5000);
      void refetchWatch(); // Refresh watch status
    },
    onError: (error) => {
      setSyncMessage(`Error disabling real-time sync: ${error.message}`);
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

  const handleStopWatch = () => {
    setSyncMessage("Disabling real-time sync...");
    stopWatchMutation.mutate();
  };

  // Organize events by year, month, and day
  const organizeEvents = (events: Event[]): OrganizedEvents => {
    const organized: OrganizedEvents = {};
    
    events.forEach(event => {
      const startDate = new Date(event.start_time);
      const year = startDate.getFullYear().toString();
      const month = startDate.toLocaleString('default', { month: 'long' });
      const day = startDate.getDate().toString();

      (organized[year] ??= {});
      (organized[year][month] ??= {});
      (organized[year][month][day] ??= []);
      organized[year][month][day].push(event);
    });
    return organized;
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getEventStatusColor = (event: Event) => {
    if (event.is_cancelled) return 'bg-red-100 text-red-800 border-red-200';
    if (event.is_recurring) return 'bg-blue-100 text-blue-800 border-blue-200';
    return 'bg-green-100 text-green-800 border-green-200';
  };

  const getEventStatusText = (event: Event) => {
    if (event.is_cancelled) return 'Cancelled';
    if (event.is_recurring) return 'Recurring';
    return 'Confirmed';
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

  const organizedEvents = organizeEvents(events);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Calendar</h1>
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
              {/* Real-time sync status and expiration */}
              {isWatchActive && (
                <div className="flex items-center space-x-2 mb-1">
                  <span className={`text-xs font-semibold ${watchExpiresSoon ? 'text-yellow-600' : 'text-green-600'}`}>Real-Time Sync: Enabled</span>
                  {watchStatus?.google_watch_expires_at && (() => {
                    const date = new Date(watchStatus.google_watch_expires_at);
                    return !isNaN(date.getTime()) ? (
                      <span className="text-[10px] text-gray-600">(Expires: {date.toLocaleString()})</span>
                    ) : (
                      <span className="text-[10px] text-gray-600">(Expires: Unknown)</span>
                    );
                  })()}
                </div>
              )}
              {/* Help text for authentication issues */}
              <div className="text-xs text-gray-500 mb-2 max-w-xs text-right">
                💡 If real-time sync fails, try signing out and back in to refresh your Google tokens.
              </div>
              <div className="flex space-x-2">
                <Button 
                  onClick={handleSyncCalendar}
                  disabled={syncEventsMutation.isPending}
                  variant="outline"
                  size="sm"
                >
                  {syncEventsMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                      Syncing...
                    </>
                  ) : (
                    'Sync Calendar'
                  )}
                </Button>
                <Button 
                  onClick={handleSetupWatch}
                  disabled={setupWatchMutation.isPending || isWatchActive}
                  variant="default"
                  size="sm"
                >
                  {setupWatchMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Enabling...
                    </>
                  ) : (
                    'Enable Real-Time Sync'
                  )}
                </Button>
                <Button 
                  onClick={handleStopWatch}
                  disabled={stopWatchMutation.isPending || !isWatchActive}
                  variant="destructive"
                  size="sm"
                >
                  {stopWatchMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600 mr-2"></div>
                      Disabling...
                    </>
                  ) : (
                    'Disable Real-Time Sync'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar View */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {events.length === 0 ? (
          <div className="text-center py-12">
            <div className="mx-auto h-12 w-12 text-gray-400">
              <Calendar className="h-12 w-12" />
            </div>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No events</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by syncing your Google Calendar.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.keys(organizedEvents).sort().map(year => (
              <div key={year} className="space-y-6">
                <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-200 pb-2">
                  {year}
                </h2>
                {Object.keys(organizedEvents[year] ?? {}).sort((a, b) => {
                  const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                                 'July', 'August', 'September', 'October', 'November', 'December'];
                  return months.indexOf(a) - months.indexOf(b);
                }).map(month => (
                  <div key={month} className="space-y-4">
                    <h3 className="text-xl font-semibold text-gray-800 ml-4">
                      {month}
                    </h3>
                    {Object.keys(organizedEvents[year]?.[month] ?? {}).sort((a, b) => parseInt(a) - parseInt(b)).map(day => (
                      <div key={day} className="space-y-3">
                        <h4 className="text-lg font-medium text-gray-700 ml-8">
                          {day} {new Date(parseInt(year), 0, parseInt(day)).toLocaleDateString('en-US', { weekday: 'short' })}
                        </h4>
                        <div className="space-y-2 ml-12">
                          {organizedEvents[year]?.[month]?.[day]?.map(event => (
                            <Dialog key={event.id}>
                              <DialogTrigger asChild>
                                <div 
                                  className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
                                  onClick={() => setSelectedEvent(event)}
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center space-x-2 mb-2">
                                        <h5 className="font-medium text-gray-900">{event.title}</h5>
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getEventStatusColor(event)}`}>
                                          {getEventStatusText(event)}
                                        </span>
                                      </div>
                                      <div className="flex items-center text-sm text-gray-600 space-x-4">
                                        <div className="flex items-center">
                                          <Clock className="h-4 w-4 mr-1" />
                                          {formatTime(event.start_time)} - {formatTime(event.end_time)}
                                        </div>
                                        {event.attendees.length > 0 && (
                                          <div className="flex items-center">
                                            <Users className="h-4 w-4 mr-1" />
                                            {event.attendees.length} attendee{event.attendees.length !== 1 ? 's' : ''}
                                          </div>
                                        )}
                                        {event.tags.length > 0 && (
                                          <div className="flex items-center">
                                            <Tag className="h-4 w-4 mr-1" />
                                            {event.tags.length} tag{event.tags.length !== 1 ? 's' : ''}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle className="text-xl">{event.title}</DialogTitle>
                                  <DialogDescription>
                                    {formatDate(event.start_time)}
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                                    <Clock className="h-4 w-4" />
                                    <span>{formatTime(event.start_time)} - {formatTime(event.end_time)}</span>
                                  </div>
                                  
                                  {event.description && (
                                    <div>
                                      <h4 className="font-medium text-gray-900 mb-2">Description</h4>
                                      <p className="text-gray-700 whitespace-pre-wrap">{event.description}</p>
                                    </div>
                                  )}
                                  
                                  {event.attendees.length > 0 && (
                                    <div>
                                      <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                                        <Users className="h-4 w-4 mr-2" />
                                        Attendees ({event.attendees.length})
                                      </h4>
                                      <div className="space-y-1">
                                        {event.attendees.map((attendee, index) => (
                                          <div key={index} className="flex items-center justify-between text-sm">
                                            <span className="text-gray-700">{attendee.email}</span>
                                            <span className={`px-2 py-1 text-xs rounded-full ${
                                              attendee.response_status === 'accepted' ? 'bg-green-100 text-green-800' :
                                              attendee.response_status === 'declined' ? 'bg-red-100 text-red-800' :
                                              'bg-yellow-100 text-yellow-800'
                                            }`}>
                                              {attendee.response_status}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {event.tags.length > 0 && (
                                    <div>
                                      <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                                        <Tag className="h-4 w-4 mr-2" />
                                        Tags ({event.tags.length})
                                      </h4>
                                      <div className="flex flex-wrap gap-2">
                                        {event.tags.map((tag, index) => (
                                          <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                                            {tag.tag}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  
                                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                                    <MapPin className="h-4 w-4" />
                                    <span>Calendar: {event.calendar_id ?? 'Primary'}</span>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 