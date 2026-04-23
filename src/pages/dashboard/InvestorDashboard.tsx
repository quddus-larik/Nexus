import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, DollarSign, Filter, MessageSquare, PlusCircle, Search, TrendingUp, Users } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { EntrepreneurCard } from '../../components/entrepreneur/EntrepreneurCard';
import { WarmContactCard } from '../../components/dashboard/WarmContactCard';
import { useAuth } from '../../context/AuthContext';
import { Entrepreneur } from '../../types';
import {
  DASHBOARD_TOKEN_KEY,
  DashboardStats,
  DashboardWarmContact,
  fetchDashboardSummary,
  fetchEntrepreneurDirectory
} from './dashboardApi';

const DEFAULT_STATS: DashboardStats = {
  warmContactsCount: 0,
  activeDealsCount: 0,
  closedDealsCount: 0,
  unreadMessagesCount: 0,
  unreadNotificationsCount: 0
};

export const InvestorDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>(DEFAULT_STATS);
  const [warmContacts, setWarmContacts] = useState<DashboardWarmContact[]>([]);
  const [startups, setStartups] = useState<Entrepreneur[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!user?.id) {
      return;
    }

    const token = localStorage.getItem(DASHBOARD_TOKEN_KEY);
    setLoading(true);
    setError(null);

    const summaryPromise = token
      ? fetchDashboardSummary(token)
      : Promise.reject(new Error('Missing authentication token'));
    const directoryPromise = fetchEntrepreneurDirectory();

    const [summaryResult, directoryResult] = await Promise.allSettled([
      summaryPromise,
      directoryPromise
    ]);

    const nextErrors: string[] = [];
    let nextRecommendedStartups: Entrepreneur[] = [];

    if (summaryResult.status === 'fulfilled') {
      const summary = summaryResult.value;
      nextRecommendedStartups = (summary.recommendedUsers || []).filter(
        (item): item is Entrepreneur => Boolean(item && item.role === 'entrepreneur')
      );

      setStats({ ...DEFAULT_STATS, ...(summary.stats || {}) });
      setWarmContacts((summary.warmContacts || []).filter((contact) => contact.role === 'entrepreneur'));
    } else {
      setStats(DEFAULT_STATS);
      setWarmContacts([]);
      nextErrors.push(token ? 'Failed to load dashboard summary.' : 'Sign in to view live dashboard stats.');
    }

    if (directoryResult.status === 'fulfilled') {
      const directory = directoryResult.value;
      setStartups(
        [...(directory.length > 0 ? directory : nextRecommendedStartups)].sort(
          (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
        )
      );
    } else {
      setStartups(nextRecommendedStartups);
      nextErrors.push('Failed to load startup directory.');
    }

    setError(nextErrors.length > 0 ? nextErrors.join(' ') : null);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    void loadDashboard();
  }, [user?.id, loadDashboard]);

  const industries = useMemo(() => {
    return Array.from(new Set(startups.map((startup) => startup.industry).filter(Boolean))).sort();
  }, [startups]);

  const filteredStartups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return startups.filter((startup) => {
      const searchableText = [
        startup.name,
        startup.startupName,
        startup.industry,
        startup.pitchSummary,
        startup.location,
        startup.bio,
        ...(startup.teamMembers || []).flatMap((member) => [member.name, member.role])
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = query === '' || searchableText.includes(query);
      const matchesIndustry =
        selectedIndustries.length === 0 || selectedIndustries.includes(startup.industry);

      return matchesSearch && matchesIndustry;
    });
  }, [searchQuery, selectedIndustries, startups]);

  const toggleIndustry = (industry: string) => {
    setSelectedIndustries((previous) =>
      previous.includes(industry)
        ? previous.filter((item) => item !== industry)
        : [...previous, industry]
    );
  };

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
                Discover startups
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-gray-600 md:text-base">
                Browse the startup directory, review warm contacts you already messaged, and track active
                mock investment opportunities from the backend.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/entrepreneurs')}
                rightIcon={<ArrowRight size={16} />}
              >
                Browse directory
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => navigate('/deals')}
                leftIcon={<DollarSign size={16} />}
              >
                Open deals
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:min-w-[420px] md:grid-cols-3">
            <Card className="border border-gray-200 bg-white text-gray-900 shadow-sm">
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-gray-50 p-3">
                    <Users size={18} className="text-gray-700" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Startups</p>
                    <p className="text-lg font-semibold text-gray-900">{loading ? '...' : startups.length}</p>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card className="border border-gray-200 bg-white text-gray-900 shadow-sm">
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-gray-50 p-3">
                    <MessageSquare size={18} className="text-gray-700" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Warm contacts</p>
                    <p className="text-lg font-semibold text-gray-900">{loading ? '...' : warmContacts.length}</p>
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
        <Card className="border border-amber-200 bg-amber-50">
          <CardBody className="flex items-center justify-between gap-4 p-4">
            <div>
              <h2 className="font-medium text-amber-900">Partial dashboard load</h2>
              <p className="mt-1 text-sm text-amber-800">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadDashboard()}>
              Retry
            </Button>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border border-gray-200 bg-white shadow-sm">
          <CardBody>
            <div className="flex items-center">
              <div className="p-3 bg-gray-50 rounded-full mr-4">
                <Users size={20} className="text-gray-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Total Startups</p>
                <h3 className="text-xl font-semibold text-gray-900">{loading ? '...' : startups.length}</h3>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="border border-gray-200 bg-white shadow-sm">
          <CardBody>
            <div className="flex items-center">
              <div className="p-3 bg-gray-50 rounded-full mr-4">
                <Filter size={20} className="text-gray-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Industries</p>
                <h3 className="text-xl font-semibold text-gray-900">{loading ? '...' : industries.length}</h3>
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
                <h3 className="text-xl font-semibold text-gray-900">{loading ? '...' : stats.unreadMessagesCount}</h3>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Warm contacts</h2>
            <p className="text-sm text-gray-600">
              Startups you already messaged, with deals linked when available.
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
                  profilePath={`/profile/entrepreneur/${contact.id}`}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 text-center">
              <div className="mb-4 rounded-full bg-white p-4 shadow-sm">
                <MessageSquare size={32} className="text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">No warm contacts yet</h3>
              <p className="mt-2 max-w-md text-sm text-gray-600">
                Message a startup first. Once the conversation exists, they will appear here and unlock the
                connected deal flow.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <Button variant="primary" size="sm" onClick={() => navigate('/entrepreneurs')}>
                  Browse startups
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate('/messages')}>
                  Open messages
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Startup directory</h2>
            <p className="text-sm text-gray-600">
              Real startup profiles pulled from MongoDB.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-500">{filteredStartups.length} results</span>
            <Button variant="ghost" size="sm" onClick={() => void loadDashboard()}>
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardBody className="space-y-4 p-4 md:p-6">
          <div className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
            <Input
              placeholder="Search startups, industries, locations, or keywords..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              fullWidth
              startAdornment={<Search size={18} />}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Filter size={18} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Filter by industry:</span>

              {industries.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {industries.map((industry) => (
                    <Badge
                      key={industry}
                      variant={selectedIndustries.includes(industry) ? 'primary' : 'gray'}
                      className="cursor-pointer"
                      onClick={() => toggleIndustry(industry)}
                    >
                      {industry}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-gray-500">No industries yet</span>
              )}
            </div>
          </div>

          {selectedIndustries.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedIndustries.map((industry) => (
                <Badge
                  key={industry}
                  variant="primary"
                  className="cursor-pointer"
                  onClick={() => toggleIndustry(industry)}
                >
                  {industry}
                </Badge>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIndustries([])}
              >
                Clear filters
              </Button>
            </div>
          )}

          {loading ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50">
              <div className="flex flex-col items-center">
                <div className="mb-3 h-10 w-10 animate-spin rounded-full border-b-2 border-primary-600" />
                <p className="text-sm text-gray-500">Loading startups...</p>
              </div>
            </div>
          ) : filteredStartups.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {filteredStartups.map((startup) => (
                <EntrepreneurCard
                  key={startup.id}
                  entrepreneur={startup}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 text-center">
              <div className="mb-4 rounded-full bg-white p-4 shadow-sm">
                <PlusCircle size={32} className="text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">No startups match your filters</h3>
              <p className="mt-2 max-w-md text-sm text-gray-600">
                Clear the current filters or reload the directory to see the full MongoDB-backed startup
                list.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedIndustries([]);
                  }}
                >
                  Clear filters
                </Button>
                <Button variant="primary" size="sm" onClick={() => void loadDashboard()}>
                  Reload
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
};
