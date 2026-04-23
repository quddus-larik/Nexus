import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Bell, DollarSign, MessageSquare, TrendingUp, Users } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { InvestorCard } from '../../components/investor/InvestorCard';
import { useAuth } from '../../context/AuthContext';
import { Investor } from '../../types';
import {
  DASHBOARD_TOKEN_KEY,
  DashboardStats,
  DashboardWarmContact,
  fetchDashboardSummary
} from './dashboardApi';
import { WarmContactCard } from '../../components/dashboard/WarmContactCard';

const DEFAULT_STATS: DashboardStats = {
  warmContactsCount: 0,
  activeDealsCount: 0,
  closedDealsCount: 0,
  unreadMessagesCount: 0,
  unreadNotificationsCount: 0
};

export const EntrepreneurDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>(DEFAULT_STATS);
  const [warmContacts, setWarmContacts] = useState<DashboardWarmContact[]>([]);
  const [recommendedInvestors, setRecommendedInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!user?.id) {
      return;
    }

    const token = localStorage.getItem(DASHBOARD_TOKEN_KEY);
    if (!token) {
      setError('You need to sign in to view the dashboard.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchDashboardSummary(token);
      const nextWarmContacts = (data.warmContacts || []).filter(
        (contact) => contact.role === 'investor'
      );
      const nextRecommendedInvestors = (data.recommendedUsers || []).filter(
        (item): item is Investor => Boolean(item && item.role === 'investor')
      );

      setStats({ ...DEFAULT_STATS, ...(data.stats || {}) });
      setWarmContacts(nextWarmContacts);
      setRecommendedInvestors(nextRecommendedInvestors);
    } catch (err) {
      setError((err as Error).message);
      setStats(DEFAULT_STATS);
      setWarmContacts([]);
      setRecommendedInvestors([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    void loadDashboard();
  }, [user?.id, loadDashboard]);

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="gray" rounded>
                Live data
              </Badge>
              <Badge variant="gray" rounded>
                MongoDB-backed
              </Badge>
            </div>

            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
                Welcome, {user.name}
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-gray-600 md:text-base">
                MongoDB-backed view of warm investors, active deals, and unread activity pulled from your
                messages, deals, and notifications.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/investors')}
                rightIcon={<ArrowRight size={16} />}
              >
                Browse Investors
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => navigate('/deals')}
                leftIcon={<DollarSign size={16} />}
              >
                Open Deals
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:min-w-[420px]">
            <Card className="border border-gray-200 bg-white text-gray-900 shadow-sm">
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-gray-50 p-3">
                    <Users size={18} className="text-gray-700" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Warm investors</p>
                    <p className="text-lg font-semibold text-gray-900">{loading ? '...' : stats.warmContactsCount}</p>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card className="border border-gray-200 bg-white text-gray-900 shadow-sm">
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-gray-50 p-3">
                    <TrendingUp size={18} className="text-gray-700" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Active deals</p>
                    <p className="text-lg font-semibold text-gray-900">{loading ? '...' : stats.activeDealsCount}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>

      {error && (
        <Card className="border border-red-200 bg-red-50">
          <CardBody className="flex items-center justify-between gap-4 p-4">
            <div>
              <h2 className="font-medium text-red-900">Unable to load dashboard</h2>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadDashboard()}>
              Retry
            </Button>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border border-gray-200 bg-white shadow-sm">
          <CardBody>
            <div className="flex items-center">
              <div className="p-3 bg-gray-50 rounded-full mr-4">
                <DollarSign size={20} className="text-gray-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Closed deals</p>
                <h3 className="text-xl font-semibold text-gray-900">
                  {loading ? '...' : stats.closedDealsCount}
                </h3>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="border border-gray-200 bg-white shadow-sm">
          <CardBody>
            <div className="flex items-center">
              <div className="p-3 bg-gray-50 rounded-full mr-4">
                <MessageSquare size={20} className="text-gray-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Unread messages</p>
                <h3 className="text-xl font-semibold text-gray-900">
                  {loading ? '...' : stats.unreadMessagesCount}
                </h3>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="border border-gray-200 bg-white shadow-sm">
          <CardBody>
            <div className="flex items-center">
              <div className="p-3 bg-gray-50 rounded-full mr-4">
                <Bell size={20} className="text-gray-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Unread notifications</p>
                <h3 className="text-xl font-semibold text-gray-900">
                  {loading ? '...' : stats.unreadNotificationsCount}
                </h3>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {error && !loading ? null : null}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Warm investors who already messaged you</h2>
              <p className="text-sm text-gray-600">
                Only investors with an existing conversation appear here.
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>{loading ? '...' : warmContacts.length} contacts</span>
              <span className="text-gray-300">•</span>
              <span>{stats.activeDealsCount} active deals</span>
            </div>
          </CardHeader>

          <CardBody className="p-4 md:p-6">
            {loading ? (
              <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50">
                <div className="flex flex-col items-center">
                  <div className="mb-3 h-10 w-10 animate-spin rounded-full border-b-2 border-primary-600" />
                  <p className="text-sm text-gray-500">Loading warm contacts...</p>
                </div>
              </div>
            ) : warmContacts.length > 0 ? (
              <div className="grid gap-4">
                {warmContacts.map((contact) => (
                  <WarmContactCard
                    key={contact.id}
                    contact={contact}
                    profilePath={`/profile/investor/${contact.id}`}
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 text-center">
                <div className="mb-4 rounded-full bg-white p-4 shadow-sm">
                  <Users size={32} className="text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">No warm investors yet</h3>
                <p className="mt-2 max-w-md text-sm text-gray-600">
                  Message an investor first. Once the conversation exists, they will appear here and unlock
                  the connected dashboard view.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-3">
                  <Button variant="primary" size="sm" onClick={() => navigate('/investors')}>
                    Browse Investors
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate('/messages')}>
                    Open Messages
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Recommended investors</h2>
              <p className="text-sm text-gray-600">
                Active investor profiles pulled from the database.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/investors')}>
              View all
            </Button>
          </CardHeader>

          <CardBody className="p-4 md:p-6">
            {loading ? (
              <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50">
                <div className="flex flex-col items-center">
                  <div className="mb-3 h-10 w-10 animate-spin rounded-full border-b-2 border-primary-600" />
                  <p className="text-sm text-gray-500">Loading investors...</p>
                </div>
              </div>
            ) : recommendedInvestors.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2">
                {recommendedInvestors.map((investor) => (
                  <InvestorCard key={investor.id} investor={investor} />
                ))}
              </div>
            ) : (
              <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 text-center">
                <div className="mb-4 rounded-full bg-white p-4 shadow-sm">
                  <TrendingUp size={32} className="text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">No investors to recommend</h3>
                <p className="mt-2 max-w-md text-sm text-gray-600">
                  New investor profiles will appear here as soon as they are saved in MongoDB.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-3">
                  <Button variant="primary" size="sm" onClick={() => navigate('/investors')}>
                    Browse Investors
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate('/deals')}>
                    Open Deals
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
};
