import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Bell, Calendar, TrendingUp, AlertCircle, PlusCircle, MessageSquare } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { InvestorCard } from '../../components/investor/InvestorCard';
import { useAuth } from '../../context/AuthContext';
import { Investor } from '../../types';
import { formatDistanceToNow } from 'date-fns';

interface DashboardStats {
  pendingRequests: number;
  acceptedConnections: number;
  profileViews: number;
  upcomingMeetings: number;
  unreadMessages: number;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

type DealApiResponse = {
  deals?: Array<{
    id?: string;
    status?: string;
    investor?: { id?: string };
  }>;
};

type NotificationApiResponse = {
  notifications?: Array<{
    id?: string;
    title?: string;
    message?: string;
    type?: string;
    read?: boolean;
    createdAt?: string;
  }>;
  unreadCount?: number;
};

export const EntrepreneurDashboard: React.FC = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [recommendedInvestors, setRecommendedInvestors] = useState<Investor[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    pendingRequests: 0,
    acceptedConnections: 0,
    profileViews: 0,
    upcomingMeetings: 0,
    unreadMessages: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  useEffect(() => {
    if (!user) return;

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
    const token = localStorage.getItem('business_nexus_access_token');
    if (!token) {
      setLoading(false);
      return;
    }

    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError('');

        const [investorsRes, dealsRes, notificationsRes] = await Promise.all([
          fetch(`${apiUrl}/investor/list/all`),
          fetch(`${apiUrl}/deals`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`${apiUrl}/notifications`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);

        if (investorsRes.ok) {
          const investorsData = await investorsRes.json();
          const investorsList = Array.isArray(investorsData) ? investorsData : [];
          const mappedInvestors: Investor[] = investorsList.map((investor: any) => {
            const stages = Array.isArray(investor.investmentStage) ? investor.investmentStage : [];
            const interests = Array.isArray(investor.investmentInterests) ? investor.investmentInterests : [];
            const portfolio = Array.isArray(investor.portfolioCompanies) ? investor.portfolioCompanies : [];

            return {
              id: investor.id?.toString?.() || '',
              name: investor.name || 'Investor',
              email: investor.email || '',
              role: 'investor',
              avatarUrl: investor.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(investor.name || 'Investor')}&background=random`,
              bio: investor.bio || '',
              location: investor.location || '',
              investmentInterests: interests,
              investmentStage: stages,
              portfolioCompanies: portfolio,
              totalInvestments: portfolio.length,
              minimumInvestment: 'Not specified',
              maximumInvestment: 'Not specified',
              createdAt: investor.createdAt || new Date().toISOString()
            };
          });
          setRecommendedInvestors(mappedInvestors.slice(0, 3));
        } else {
          setRecommendedInvestors([]);
        }

        let acceptedConnections = 0;
        if (dealsRes.ok) {
          const dealsData: DealApiResponse = await dealsRes.json();
          const deals = Array.isArray(dealsData?.deals) ? dealsData.deals : [];
          const connectedInvestorIds = new Set(
            deals
              .map(deal => deal.investor?.id?.toString?.())
              .filter((id): id is string => Boolean(id))
          );
          acceptedConnections = connectedInvestorIds.size;
        }

        let notificationItems: NotificationItem[] = [];
        let unreadMessageCount = 0;
        let pendingRequests = 0;
        if (notificationsRes.ok) {
          const notificationsData: NotificationApiResponse = await notificationsRes.json();
          const rawNotifications = Array.isArray(notificationsData.notifications) ? notificationsData.notifications : [];
          notificationItems = rawNotifications.map(item => ({
            id: item.id?.toString?.() || '',
            title: item.title || 'Notification',
            message: item.message || '',
            type: item.type || 'system',
            read: Boolean(item.read),
            createdAt: item.createdAt || new Date().toISOString()
          }));

          unreadMessageCount = notificationItems.filter(item => item.type === 'message' && !item.read).length;
          pendingRequests = notificationItems.filter(item => item.type === 'invests' && !item.read).length;
        }

        setNotifications(notificationItems);
        setStats({
          pendingRequests,
          acceptedConnections,
          profileViews: 0,
          upcomingMeetings: 0,
          unreadMessages: unreadMessageCount
        });
      } catch (fetchError) {
        console.error('Error fetching dashboard data:', fetchError);
        setError('Failed to load dashboard data');
        setNotifications([]);
        setRecommendedInvestors([]);
        setStats({
          pendingRequests: 0,
          acceptedConnections: 0,
          profileViews: 0,
          upcomingMeetings: 0,
          unreadMessages: 0
        });
      } finally {
        setLoading(false);
      }
    };

    void fetchDashboardData();
  }, [user]);
  
  if (!user) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {user.name}</h1>
          <p className="text-gray-600">Here's what's happening with your startup today</p>
        </div>
        
        <Link to="/investors">
          <Button
            leftIcon={<PlusCircle size={18} />}
          >
            Find Investors
          </Button>
        </Link>
      </div>
      
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="bg-primary-50 border border-primary-100">
          <CardBody>
            <div className="flex items-center">
              <div className="p-3 bg-primary-100 rounded-full mr-4">
                <Bell size={20} className="text-primary-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary-700">Pending Requests</p>
                <h3 className="text-xl font-semibold text-primary-900">{stats.pendingRequests}</h3>
              </div>
            </div>
          </CardBody>
        </Card>
        
        <Card className="bg-secondary-50 border border-secondary-100">
          <CardBody>
            <div className="flex items-center">
              <div className="p-3 bg-secondary-100 rounded-full mr-4">
                <Users size={20} className="text-secondary-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-secondary-700">Total Connections</p>
                <h3 className="text-xl font-semibold text-secondary-900">
                  {stats.acceptedConnections}
                </h3>
              </div>
            </div>
          </CardBody>
        </Card>
        
        <Card className="bg-accent-50 border border-accent-100">
          <CardBody>
            <div className="flex items-center">
              <div className="p-3 bg-accent-100 rounded-full mr-4">
                <Calendar size={20} className="text-accent-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-accent-700">Upcoming Meetings</p>
                <h3 className="text-xl font-semibold text-accent-900">{stats.upcomingMeetings}</h3>
              </div>
            </div>
          </CardBody>
        </Card>
        
        <Card className="bg-success-50 border border-success-100">
          <CardBody>
            <div className="flex items-center">
              <div className="p-3 bg-green-100 rounded-full mr-4">
                <TrendingUp size={20} className="text-success-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-success-700">Profile Views</p>
                <h3 className="text-xl font-semibold text-success-900">{stats.profileViews}</h3>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-blue-50 border border-blue-100">
          <CardBody>
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 rounded-full mr-4">
                <MessageSquare size={20} className="text-blue-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-blue-700">Unread Messages</p>
                <h3 className="text-xl font-semibold text-blue-900">{stats.unreadMessages}</h3>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Collaboration requests */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-900">Recent Activity</h2>
              <Badge variant="primary">{stats.pendingRequests} pending</Badge>
            </CardHeader>
            
            <CardBody>
              {loading ? (
                <div className="text-center py-8">
                  <p className="text-gray-600">Loading dashboard...</p>
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <p className="text-red-600">{error}</p>
                </div>
              ) : notifications.length > 0 ? (
                <div className="space-y-4">
                  {notifications.slice(0, 8).map(notification => (
                    <div key={notification.id} className="p-4 border border-gray-100 rounded-lg bg-gray-50">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-semibold text-gray-900">{notification.title}</h3>
                        {!notification.read && <Badge variant="primary" size="sm">New</Badge>}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                      <p className="text-xs text-gray-500 mt-2">
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                    <AlertCircle size={24} className="text-gray-500" />
                  </div>
                  <p className="text-gray-600">No activity yet</p>
                  <p className="text-sm text-gray-500 mt-1">Notifications and new investor actions will appear here</p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
        
        {/* Recommended investors */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-900">Recommended Investors</h2>
              <Link to="/investors" className="text-sm font-medium text-primary-600 hover:text-primary-500">
                View all
              </Link>
            </CardHeader>
            
            <CardBody className="space-y-4">
              {recommendedInvestors.map(investor => (
                <InvestorCard
                  key={investor.id}
                  investor={investor}
                  showActions={false}
                />
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
};
