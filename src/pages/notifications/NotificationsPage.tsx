import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, MessageCircle, UserPlus, DollarSign } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardBody } from '../../components/ui/Card';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import socketService from '../../services/socketService';

type NotificationType = 'collabs' | 'invests' | 'message' | 'system' | 'connection' | 'investment';

interface NotificationActor {
  id: string;
  name: string;
  avatarUrl: string;
  email?: string;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  type: NotificationType;
  createdAt: string;
  updatedAt?: string;
  actor?: NotificationActor | null;
  meta?: Record<string, unknown>;
}

interface NotificationApiActor {
  id?: string;
  _id?: string;
  name?: string;
  username?: string;
  avatarUrl?: string;
  email?: string;
}

interface NotificationApiItem {
  id?: string;
  _id?: string;
  title?: string;
  message?: string;
  link?: string;
  read?: boolean;
  type?: NotificationType;
  createdAt?: string;
  updatedAt?: string;
  actor?: NotificationApiActor | null;
  meta?: Record<string, unknown>;
}

interface NotificationApiResponse {
  notifications?: NotificationApiItem[];
  unreadCount?: number;
}

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const buildAvatarUrl = (name: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=random`;

const getErrorMessage = (data: unknown, fallback: string) => {
  const payload = data as { error?: string; message?: string } | null;
  return payload?.error || payload?.message || fallback;
};

const normalizeNotification = (notification: NotificationApiItem): NotificationItem => {
  const actorName = notification.actor?.name || notification.actor?.username || notification.title || 'User';
  const actorAvatar = notification.actor?.avatarUrl || buildAvatarUrl(actorName);

  return {
    id: String(notification.id ?? notification._id ?? ''),
    title: notification.title || actorName,
    message: notification.message || '',
    link: notification.link || '',
    read: Boolean(notification.read),
    type: (notification.type || 'system') as NotificationType,
    createdAt: notification.createdAt || notification.updatedAt || new Date().toISOString(),
    updatedAt: notification.updatedAt,
    actor: notification.actor
      ? {
          id: String(notification.actor.id ?? notification.actor._id ?? ''),
          name: actorName,
          avatarUrl: actorAvatar,
          email: notification.actor.email || ''
        }
      : null,
    meta: notification.meta || {}
  };
};

const fetchNotifications = async (apiBaseUrl: string, token: string): Promise<NotificationItem[]> => {
  const response = await fetch(`${apiBaseUrl}/notifications`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = (await response.json().catch(() => ({}))) as NotificationApiResponse | NotificationApiItem[];

  if (!response.ok) {
    throw new Error(getErrorMessage(data, 'Failed to load notifications'));
  }

  const items = Array.isArray(data)
    ? data
    : data.notifications ?? [];

  return items.map(normalizeNotification);
};

export const NotificationsPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const currentUserId = currentUser?.id;
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem('business_nexus_access_token');

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'message':
        return <MessageCircle size={16} className="text-primary-600" />;
      case 'collabs':
      case 'connection':
        return <UserPlus size={16} className="text-secondary-600" />;
      case 'invests':
      case 'investment':
        return <DollarSign size={16} className="text-accent-600" />;
      default:
        return <Bell size={16} className="text-gray-600" />;
    }
  };

  const loadNotifications = async () => {
    if (!token) {
      setError('You need to sign in to view notifications.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextNotifications = await fetchNotifications(apiUrl, token);
      setNotifications(nextNotifications);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUserId) return;

    if (!token) {
      setError('You need to sign in to view notifications.');
      return;
    }

    socketService.connect(token);
    let isMounted = true;

    setIsLoading(true);
    setError(null);

    void (async () => {
      try {
        const nextNotifications = await fetchNotifications(apiUrl, token);
        if (isMounted) {
          setNotifications(nextNotifications);
        }
      } catch (err) {
        if (isMounted) {
          setError((err as Error).message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    const handleNotificationReceived = (notification: NotificationApiItem) => {
      const nextNotification = normalizeNotification(notification);

      setNotifications(prev => {
        if (prev.some(item => item.id === nextNotification.id)) {
          return prev;
        }

        return [nextNotification, ...prev];
      });
    };

    socketService.on('notification:received', handleNotificationReceived);

    return () => {
      isMounted = false;
      socketService.off('notification:received');
    };
  }, [currentUserId, token]);

  const unreadCount = notifications.filter(notification => !notification.read).length;

  const handleMarkAllAsRead = async () => {
    if (!token || unreadCount === 0) return;

    setIsMarkingAllRead(true);

    try {
      const response = await fetch(`${apiUrl}/notifications/read-all`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string; message?: string }).error || (data as { error?: string; message?: string }).message || 'Failed to mark notifications as read');
      }

      setNotifications(prev => prev.map(notification => ({ ...notification, read: true })));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsMarkingAllRead(false);
    }
  };

  const handleNotificationClick = async (notification: NotificationItem) => {
    if (!notification.read) {
      setNotifications(prev =>
        prev.map(item => (item.id === notification.id ? { ...item, read: true } : item))
      );

      void (async () => {
        try {
          const response = await fetch(`${apiUrl}/notifications/${notification.id}/read`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`
            }
          });

          const data = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(getErrorMessage(data, 'Failed to mark notification as read'));
          }
        } catch {
          setNotifications(prev =>
            prev.map(item => (item.id === notification.id ? { ...item, read: false } : item))
          );
        }
      })();
    }

    if (notification.link) {
      navigate(notification.link);
    }
  };

  if (!currentUser) return null;
  
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-gray-600">Stay updated with your network activity</p>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleMarkAllAsRead}
          disabled={unreadCount === 0 || isMarkingAllRead}
        >
          {isMarkingAllRead ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600" />
          ) : (
            'Mark all as read'
          )}
        </Button>
      </div>
      
      {error && (
        <Card className="border border-red-200 bg-red-50">
          <CardBody className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-medium text-red-900">Unable to load notifications</h2>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={loadNotifications}>
              Retry
            </Button>
          </CardBody>
        </Card>
      )}

      {isLoading ? (
        <div className="h-56 flex flex-col items-center justify-center bg-white rounded-lg border border-gray-200">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mb-3" />
          <p className="text-sm text-gray-500">Loading notifications...</p>
        </div>
      ) : notifications.length > 0 ? (
        <div className="space-y-4">
          {notifications.map(notification => {
            const meta = getNotificationIcon(notification.type);
            const displayName = notification.actor?.name || notification.title;
            const avatarUrl = notification.actor?.avatarUrl || buildAvatarUrl(displayName);

            return (
              <Card
                key={notification.id}
                hoverable
                onClick={() => handleNotificationClick(notification)}
                className={`transition-colors duration-200 ${notification.read ? '' : 'bg-primary-50'}`}
              >
                <CardBody className="flex items-start p-4">
                  <Avatar
                    src={avatarUrl}
                    alt={displayName}
                    size="md"
                    className="flex-shrink-0 mr-4"
                  />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 truncate">
                            {notification.title}
                          </span>
                          {notification.read === false && (
                            <Badge variant="primary" size="sm" rounded>New</Badge>
                          )}
                          <Badge variant="primary" size="sm" rounded>
                            {notification.type === 'collabs' || notification.type === 'connection'
                              ? 'Collaboration'
                              : notification.type === 'invests' || notification.type === 'investment'
                                ? 'Investment'
                                : notification.type === 'message'
                                  ? 'Message'
                                  : 'Update'}
                          </Badge>
                        </div>

                        <p className="text-gray-600 mt-1">
                          {notification.message}
                        </p>
                      </div>

                      <div className="flex-shrink-0 mt-1">
                        {meta}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-3 text-sm text-gray-500">
                      <span>
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                      </span>
                      {notification.link && (
                        <span className="text-xs font-medium text-primary-600">Open</span>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="h-full flex flex-col items-center justify-center p-8 bg-white rounded-lg border border-gray-200">
          <div className="bg-gray-100 p-6 rounded-full mb-4">
            <Bell size={32} className="text-gray-400" />
          </div>
          <h2 className="text-xl font-medium text-gray-900">No notifications yet</h2>
          <p className="text-gray-600 text-center mt-2 max-w-md">
            You’ll see message, collaboration, and investment updates here as your network becomes active.
          </p>
        </div>
      )}
    </div>
  );
};
