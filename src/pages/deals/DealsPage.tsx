import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  DollarSign,
  Filter,
  MessageCircle,
  Search,
  Send,
  TrendingUp,
  Users
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const TOKEN_KEY = 'business_nexus_access_token';
const DEAL_STATUSES = ['Proposed', 'Due Diligence', 'Term Sheet', 'Negotiation', 'Closed', 'Passed'] as const;
const ROUND_OPTIONS = ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Growth'] as const;

type DealStatus = (typeof DEAL_STATUSES)[number];

interface DealParty {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl: string;
  bio: string;
  location: string;
  startupName: string;
  industry: string;
  createdAt?: string;
}

interface DealRecord {
  id: string;
  investor: DealParty | null;
  startup: DealParty | null;
  roomId: string;
  title: string;
  amount: number;
  currency: string;
  equity: number;
  round: string;
  note: string;
  status: DealStatus;
  isMock: boolean;
  source: string;
  metadata: Record<string, unknown>;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

interface DealEligibleContact {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl: string;
  bio: string;
  location: string;
  startupName: string;
  industry: string;
  lastMessage: string;
  lastMessageAt: string;
  messageCount: number;
  roomId: string;
}

interface DealApiParty {
  id?: string;
  _id?: string;
  name?: string;
  email?: string;
  role?: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  startupName?: string;
  industry?: string;
  createdAt?: string;
}

interface DealApiItem {
  id?: string;
  _id?: string;
  investor?: DealApiParty | null;
  startup?: DealApiParty | null;
  roomId?: string;
  title?: string;
  amount?: number | string;
  currency?: string;
  equity?: number | string;
  round?: string;
  note?: string;
  status?: string;
  isMock?: boolean;
  source?: string;
  metadata?: Record<string, unknown>;
  lastActivityAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface DealEligibleApiItem {
  id?: string;
  _id?: string;
  name?: string;
  email?: string;
  role?: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  startupName?: string;
  industry?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  messageCount?: number;
  roomId?: string;
}

interface DealPageResponse {
  deals?: DealApiItem[];
}

interface DealEligibleResponse {
  contacts?: DealEligibleApiItem[];
}

interface DealCreateResponse {
  deal?: DealApiItem;
  error?: string;
  message?: string;
}

interface DealFormState {
  amount: string;
  equity: string;
  round: string;
  status: DealStatus;
  note: string;
}

const buildAvatarUrl = (displayName: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || 'User')}&background=random`;

const buildDisplayName = (user?: DealApiParty | DealEligibleApiItem | null) =>
  user?.name || 'User';

const getSafeCurrencyCode = (currency?: string) => {
  const code = String(currency || 'USD').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : 'USD';
};

const fetchJson = async <T,>(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });

  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || data.message || 'Request failed');
  }

  return data as T;
};

const normalizeParty = (party?: DealApiParty | null): DealParty | null => {
  if (!party) {
    return null;
  }

  const displayName = buildDisplayName(party);
  const role = String(party.role || '').toLowerCase() === 'investor' ? 'investor' : 'entrepreneur';

  return {
    id: String(party.id || party._id || ''),
    name: displayName,
    email: party.email || '',
    role: role as UserRole,
    avatarUrl: party.avatarUrl || buildAvatarUrl(displayName),
    bio: party.bio || '',
    location: party.location || '',
    startupName: party.startupName || 'Startup',
    industry: party.industry || '',
    createdAt: party.createdAt
  };
};

const normalizeDeal = (deal: DealApiItem): DealRecord => {
  const status = DEAL_STATUSES.includes(deal.status as DealStatus)
    ? (deal.status as DealStatus)
    : 'Proposed';
  const amount = Number(deal.amount || 0);
  const equity = Number(deal.equity || 0);
  const currency = getSafeCurrencyCode(deal.currency);

  return {
    id: String(deal.id || deal._id || ''),
    investor: normalizeParty(deal.investor),
    startup: normalizeParty(deal.startup),
    roomId: deal.roomId || '',
    title: deal.title || 'Mock investment',
    amount: Number.isFinite(amount) ? amount : 0,
    currency,
    equity: Number.isFinite(equity) ? equity : 0,
    round: deal.round || 'Seed',
    note: deal.note || '',
    status,
    isMock: Boolean(deal.isMock),
    source: deal.source || 'message',
    metadata: deal.metadata || {},
    lastActivityAt: deal.lastActivityAt || deal.updatedAt || deal.createdAt || new Date().toISOString(),
    createdAt: deal.createdAt || new Date().toISOString(),
    updatedAt: deal.updatedAt || new Date().toISOString()
  };
};

const normalizeContact = (contact: DealEligibleApiItem): DealEligibleContact => {
  const displayName = buildDisplayName(contact);
  const role = String(contact.role || '').toLowerCase() === 'investor' ? 'investor' : 'entrepreneur';

  return {
    id: String(contact.id || contact._id || ''),
    name: displayName,
    email: contact.email || '',
    role: role as UserRole,
    avatarUrl: contact.avatarUrl || buildAvatarUrl(displayName),
    bio: contact.bio || '',
    location: contact.location || '',
    startupName: contact.startupName || 'Startup',
    industry: contact.industry || '',
    lastMessage: contact.lastMessage || '',
    lastMessageAt: contact.lastMessageAt || new Date().toISOString(),
    messageCount: Number(contact.messageCount || 0),
    roomId: contact.roomId || ''
  };
};

const formatMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: getSafeCurrencyCode(currency),
    maximumFractionDigits: 0
  }).format(amount);

const formatEquity = (equity: number) =>
  Number.isInteger(equity) ? `${equity}%` : `${equity.toFixed(1)}%`;

const getCounterpartyRoleLabel = (role: UserRole) => (role === 'investor' ? 'Startup' : 'Investor');

const getDirectoryPath = (role: UserRole) => (role === 'investor' ? '/entrepreneurs' : '/investors');

const getStatusVariant = (status: DealStatus) => {
  switch (status) {
    case 'Proposed':
      return 'warning';
    case 'Due Diligence':
      return 'primary';
    case 'Term Sheet':
      return 'secondary';
    case 'Negotiation':
      return 'accent';
    case 'Closed':
      return 'success';
    case 'Passed':
      return 'gray';
    default:
      return 'gray';
  }
};

const getDealCounterparty = (deal: DealRecord, currentUserRole: UserRole) =>
  currentUserRole === 'investor' ? deal.startup : deal.investor;

const getDealCounterpartyId = (deal: DealRecord, currentUserRole: UserRole) =>
  getDealCounterparty(deal, currentUserRole)?.id || '';

const getDealSearchText = (deal: DealRecord, currentUserRole: UserRole) => {
  const counterparty = getDealCounterparty(deal, currentUserRole);
  return [
    deal.title,
    deal.round,
    deal.status,
    deal.note,
    counterparty?.name || '',
    counterparty?.industry || '',
    counterparty?.startupName || ''
  ]
    .join(' ')
    .toLowerCase();
};

export const DealsPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const currentUserId = currentUser?.id;
  const currentUserRole = (currentUser?.role === 'investor' ? 'investor' : 'entrepreneur') as UserRole;
  const counterpartyLabel = getCounterpartyRoleLabel(currentUserRole);
  const directoryPath = getDirectoryPath(currentUserRole);
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [eligibleContacts, setEligibleContacts] = useState<DealEligibleContact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<DealStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<DealFormState>({
    amount: '50000',
    equity: '5',
    round: 'Seed',
    status: 'Proposed',
    note: 'Mock investment sent after a warm introduction.'
  });

  const loadPageData = useCallback(async () => {
    if (!currentUserId) {
      return;
    }

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setError('You need to sign in to view and create deals.');
      setDeals([]);
      setEligibleContacts([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [dealsResponse, contactsResponse] = await Promise.all([
        fetchJson<DealPageResponse>('/deals', token),
        fetchJson<DealEligibleResponse>('/deals/eligible', token)
      ]);

      const nextDeals = (dealsResponse.deals || []).map(normalizeDeal);
      const nextContacts = (contactsResponse.contacts || []).map(normalizeContact);

      setDeals(nextDeals);
      setEligibleContacts(nextContacts);
      setSelectedContactId((current) => {
        if (current && nextContacts.some((contact) => contact.id === current)) {
          return current;
        }

        return nextContacts[0]?.id || '';
      });
    } catch (err) {
      setError((err as Error).message);
      setDeals([]);
      setEligibleContacts([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    void loadPageData();
  }, [currentUserId, loadPageData]);

  if (!currentUser) {
    return null;
  }

  const token = localStorage.getItem(TOKEN_KEY);
  const selectedContact = eligibleContacts.find((contact) => contact.id === selectedContactId) || null;
  const activeContacts = eligibleContacts.filter((contact) => {
    if (!searchQuery.trim()) {
      return true;
    }

    const query = searchQuery.toLowerCase();
    return [
      contact.name,
      contact.industry,
      contact.startupName,
      contact.bio,
      contact.lastMessage,
      contact.role
    ]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });

  const filteredDeals = deals.filter((deal) => {
    const statusAllowed = selectedStatuses.length === 0 || selectedStatuses.includes(deal.status);

    if (!statusAllowed) {
      return false;
    }

    if (!searchQuery.trim()) {
      return true;
    }

    return getDealSearchText(deal, currentUserRole).includes(searchQuery.toLowerCase());
  });

  const activeDealCount = deals.filter((deal) => !['Closed', 'Passed'].includes(deal.status)).length;
  const closedDealsCount = deals.filter((deal) => deal.status === 'Closed').length;
  const totalCommitted = deals.reduce((sum, deal) => sum + (Number.isFinite(deal.amount) ? deal.amount : 0), 0);
  const uniqueRelationships = new Set(
    deals.map((deal) => getDealCounterpartyId(deal, currentUserRole)).filter(Boolean)
  ).size;
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const closedThisMonth = deals.filter((deal) => {
    if (deal.status !== 'Closed') {
      return false;
    }

    const activity = new Date(deal.lastActivityAt || deal.updatedAt || deal.createdAt);
    return activity.getMonth() === currentMonth && activity.getFullYear() === currentYear;
  }).length;

  const selectedContactDeal = selectedContact
    ? deals.find((deal) => getDealCounterpartyId(deal, currentUserRole) === selectedContact.id) || null
    : null;

  const toggleStatus = (status: DealStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((entry) => entry !== status) : [...prev, status]
    );
  };

  const handleSelectContact = (contactId: string) => {
    setSelectedContactId(contactId);
    setError(null);
    setSuccess(null);
  };

  const handleSubmitDeal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const tokenValue = localStorage.getItem(TOKEN_KEY);
    if (!tokenValue) {
      setError('You need to sign in to create a deal.');
      return;
    }

    if (!selectedContact) {
      setError(`Message a ${counterpartyLabel.toLowerCase()} before creating a deal.`);
      return;
    }

    const amount = Number(form.amount);
    const equity = Number(form.equity);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid investment amount.');
      return;
    }

    if (!Number.isFinite(equity) || equity <= 0 || equity > 100) {
      setError('Enter a valid equity percentage.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_URL}/deals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenValue}`
        },
        body: JSON.stringify({
          counterpartyId: selectedContact.id,
          amount,
          equity,
          round: form.round,
          status: form.status,
          note: form.note
        })
      });

      const data = (await response.json().catch(() => ({}))) as DealCreateResponse;

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to create deal');
      }

      if (data.deal) {
        const createdDeal = normalizeDeal(data.deal);
        setDeals((prev) => [createdDeal, ...prev]);
      }

      setSuccess(`Mock investment recorded for ${selectedContact.name}.`);
      setForm((prev) => ({
        ...prev,
        note: 'Mock investment sent after a warm introduction.'
      }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-primary-900 p-6 text-white shadow-xl md:p-8">
        <div className="absolute -right-16 top-0 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-primary-400/20 blur-3xl" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="warning" rounded>
                Mock flow
              </Badge>
              <Badge variant="gray" rounded>
                Message-backed deals only
              </Badge>
            </div>

            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                {currentUserRole === 'investor' ? 'Startup Investment Desk' : 'Investor Deal Desk'}
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-white/80 md:text-base">
                Create a mock investment only after you have messaged the other side. This stores a deal
                record, updates the pipeline, and notifies the counterparty.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(directoryPath)}
                rightIcon={<ArrowRight size={16} />}
              >
                {currentUserRole === 'investor' ? 'Browse Startups' : 'Browse Investors'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-white/20 text-white hover:bg-white/10"
                onClick={() => navigate('/messages')}
                leftIcon={<MessageCircle size={16} />}
              >
                Open Messages
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:min-w-[440px]">
            <Card className="border-white/10 bg-white/10 text-white shadow-none">
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white/10 p-3">
                    <DollarSign size={18} />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/60">Total committed</p>
                    <p className="text-lg font-semibold">{formatMoney(totalCommitted, 'USD')}</p>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card className="border-white/10 bg-white/10 text-white shadow-none">
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white/10 p-3">
                    <TrendingUp size={18} />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/60">Active deals</p>
                    <p className="text-lg font-semibold">{activeDealCount}</p>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card className="border-white/10 bg-white/10 text-white shadow-none">
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white/10 p-3">
                    <Users size={18} />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/60">Warm leads</p>
                    <p className="text-lg font-semibold">{eligibleContacts.length}</p>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card className="border-white/10 bg-white/10 text-white shadow-none">
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white/10 p-3">
                    <Calendar size={18} />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/60">Closed this month</p>
                    <p className="text-lg font-semibold">{closedThisMonth}</p>
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
              <h2 className="font-medium text-red-900">Unable to load deals</h2>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadPageData()}>
              Retry
            </Button>
          </CardBody>
        </Card>
      )}

      {success && (
        <Card className="border border-success-200 bg-success-50">
          <CardBody className="p-4">
            <p className="text-sm font-medium text-success-800">{success}</p>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="h-full">
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {counterpartyLabel}s you already messaged
              </h2>
              <p className="text-sm text-gray-600">
                Select a warm contact and send a mock investment. No conversation means no deal.
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Filter size={16} />
              <span>Filter pipeline</span>
            </div>
          </CardHeader>

          <CardBody className="space-y-4 p-4 md:p-6">
            <div className="flex flex-col gap-4 lg:flex-row">
              <div className="flex-1">
                <Input
                  placeholder={`Search ${counterpartyLabel.toLowerCase()}s, rounds, status, notes...`}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  startAdornment={<Search size={18} />}
                  fullWidth
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {DEAL_STATUSES.map((status) => (
                  <Badge
                    key={status}
                    variant={selectedStatuses.includes(status) ? getStatusVariant(status) : 'gray'}
                    className="cursor-pointer"
                    onClick={() => toggleStatus(status)}
                    rounded
                  >
                    {status}
                  </Badge>
                ))}
              </div>
            </div>

            {isLoading ? (
              <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50">
                <div className="flex flex-col items-center">
                  <div className="mb-3 h-10 w-10 animate-spin rounded-full border-b-2 border-primary-600" />
                  <p className="text-sm text-gray-500">Loading deals...</p>
                </div>
              </div>
            ) : filteredDeals.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-gray-200">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr className="border-b border-gray-200">
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        {counterpartyLabel}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Equity
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Round
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Last Activity
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-200 bg-white">
                    {filteredDeals.map((deal) => {
                      const counterparty = getDealCounterparty(deal, currentUserRole);

                      if (!counterparty) {
                        return null;
                      }

                      return (
                        <tr key={deal.id} className="transition-colors hover:bg-gray-50">
                          <td className="whitespace-nowrap px-6 py-4">
                            <div className="flex items-center">
                              <Avatar
                                src={counterparty.avatarUrl}
                                alt={counterparty.name}
                                size="sm"
                                className="flex-shrink-0"
                              />
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900">{counterparty.name}</div>
                                <div className="text-sm text-gray-500">
                                  {counterparty.industry || counterparty.startupName || counterparty.role}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                            {formatMoney(deal.amount, deal.currency)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                            {formatEquity(deal.equity)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4">
                            <Badge variant={getStatusVariant(deal.status)} rounded>
                              {deal.status}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                            {deal.round}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                            {formatDistanceToNow(new Date(deal.lastActivityAt), { addSuffix: true })}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate(`/chat/${counterparty.id}`)}
                                leftIcon={<MessageCircle size={16} />}
                              >
                                Chat
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSelectContact(counterparty.id)}
                              >
                                Use in form
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 text-center">
                <div className="mb-4 rounded-full bg-white p-4 shadow-sm">
                  <MessageCircle size={32} className="text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">No deals yet</h3>
                <p className="mt-2 max-w-md text-sm text-gray-600">
                  Message a {counterpartyLabel.toLowerCase()} first. Once the conversation starts, you can
                  send a mock investment from this page.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-3">
                  <Button variant="primary" size="sm" onClick={() => navigate(directoryPath)}>
                    {currentUserRole === 'investor' ? 'Browse Startups' : 'Browse Investors'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate('/messages')}>
                    Open Messages
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="h-full" id="mock-investment-form">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Mock Investment</h2>
                <p className="text-sm text-gray-600">
                  Send money to a startup after you have messaged them.
                </p>
              </div>
              <Badge variant="warning" rounded>
                Simulation
              </Badge>
            </div>
          </CardHeader>

          <CardBody className="space-y-5 p-4 md:p-6">
            {selectedContact ? (
              <div
                className={`rounded-2xl border p-4 ${
                  selectedContactDeal ? 'border-primary-200 bg-primary-50' : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-start gap-4">
                  <Avatar src={selectedContact.avatarUrl} alt={selectedContact.name} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-gray-900">{selectedContact.name}</h3>
                      <Badge variant="gray" rounded>
                        {selectedContact.role}
                      </Badge>
                      {selectedContactDeal && (
                        <Badge variant={getStatusVariant(selectedContactDeal.status)} rounded>
                          {selectedContactDeal.status}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {selectedContact.industry || selectedContact.startupName || 'Warm contact'}
                    </p>
                    <p className="mt-2 text-sm text-gray-500">
                      {selectedContact.lastMessage || 'Conversation started'}
                    </p>
                    <p className="mt-2 text-xs text-gray-500">
                      Last message {formatDistanceToNow(new Date(selectedContact.lastMessageAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/chat/${selectedContact.id}`)}
                    leftIcon={<MessageCircle size={16} />}
                  >
                    Open Chat
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(directoryPath)}
                  >
                    {currentUserRole === 'investor' ? 'Browse Startups' : 'Browse Investors'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5">
                <h3 className="text-base font-semibold text-gray-900">Message first to unlock investing</h3>
                <p className="mt-2 text-sm text-gray-600">
                  No eligible {counterpartyLabel.toLowerCase()} has a conversation with you yet.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button variant="primary" size="sm" onClick={() => navigate(directoryPath)}>
                    {currentUserRole === 'investor' ? 'Browse Startups' : 'Browse Investors'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate('/messages')}>
                    Go to Messages
                  </Button>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmitDeal} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Amount"
                  type="number"
                  min="1"
                  step="1"
                  value={form.amount}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, amount: event.target.value }))
                  }
                  startAdornment={<DollarSign size={16} />}
                  fullWidth
                  disabled={!selectedContact || isSubmitting}
                  helperText="Mock transfer amount"
                />

                <Input
                  label="Equity"
                  type="number"
                  min="0.1"
                  max="100"
                  step="0.1"
                  value={form.equity}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, equity: event.target.value }))
                  }
                  endAdornment={<span className="text-sm text-gray-500">%</span>}
                  fullWidth
                  disabled={!selectedContact || isSubmitting}
                  helperText="Ownership percentage"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Round</label>
                  <select
                    value={form.round}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, round: event.target.value }))
                    }
                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50"
                    disabled={!selectedContact || isSubmitting}
                  >
                    {ROUND_OPTIONS.map((round) => (
                      <option key={round} value={round}>
                        {round}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Pipeline status</label>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, status: event.target.value as DealStatus }))
                    }
                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50"
                    disabled={!selectedContact || isSubmitting}
                  >
                    {DEAL_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Note</label>
                <textarea
                  rows={4}
                  value={form.note}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, note: event.target.value }))
                  }
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50"
                  placeholder={`Add a short note for the ${counterpartyLabel.toLowerCase()}`}
                  disabled={!selectedContact || isSubmitting}
                />
              </div>

              <div className="rounded-2xl bg-primary-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-primary-600">Mock summary</p>
                <p className="mt-2 text-sm text-gray-700">
                  You are about to send {formatMoney(Number(form.amount || 0), 'USD')} for{' '}
                  {formatEquity(Number(form.equity || 0))} equity to{' '}
                  {selectedContact?.name || `a ${counterpartyLabel.toLowerCase()}`}.
                </p>
              </div>

              <Button
                type="submit"
                size="lg"
                fullWidth
                isLoading={isSubmitting}
                disabled={!selectedContact || !token}
                leftIcon={<Send size={18} />}
              >
                Send mock money
              </Button>

              <p className="text-xs text-gray-500">
                This is a mock investment flow. It stores a deal record and notifies the other side, but
                it does not move real money.
              </p>
            </form>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Warm contacts</h2>
            <p className="text-sm text-gray-600">
              Only members you have already messaged can be used for a deal.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>{uniqueRelationships} relationship{uniqueRelationships === 1 ? '' : 's'}</span>
            <span className="text-gray-300">•</span>
            <span>{closedDealsCount} closed</span>
          </div>
        </CardHeader>

        <CardBody className="p-4 md:p-6">
          {activeContacts.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {activeContacts.map((contact) => {
                const contactDeal = deals.find(
                  (deal) => getDealCounterpartyId(deal, currentUserRole) === contact.id
                );
                const isSelected = selectedContactId === contact.id;

                return (
                  <Card
                    key={contact.id}
                    hoverable
                    onClick={() => handleSelectContact(contact.id)}
                    className={`border transition-colors ${
                      isSelected ? 'border-primary-500 ring-1 ring-primary-500' : 'border-gray-200'
                    }`}
                  >
                    <CardBody className="p-4">
                      <div className="flex items-start gap-3">
                        <Avatar src={contact.avatarUrl} alt={contact.name} size="md" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-semibold text-gray-900">
                              {contact.name}
                            </h3>
                            <Badge variant="gray" size="sm" rounded>
                              {contact.role}
                            </Badge>
                            {contactDeal && (
                              <Badge variant={getStatusVariant(contactDeal.status)} size="sm" rounded>
                                {contactDeal.status}
                              </Badge>
                            )}
                          </div>

                          <p className="mt-1 text-xs text-gray-500">
                            {contact.industry || contact.startupName || 'Warm contact'}
                          </p>

                          <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                            {contact.lastMessage || 'Conversation started'}
                          </p>

                          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500">
                            <span>{contact.messageCount} message{contact.messageCount === 1 ? '' : 's'}</span>
                            <span>
                              {formatDistanceToNow(new Date(contact.lastMessageAt), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/chat/${contact.id}`);
                          }}
                          leftIcon={<MessageCircle size={16} />}
                        >
                          Chat
                        </Button>
                        <Button
                          variant={isSelected ? 'secondary' : 'outline'}
                          size="sm"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleSelectContact(contact.id);
                          }}
                        >
                          {isSelected ? 'Selected' : 'Use in form'}
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 text-center">
              <div className="mb-4 rounded-full bg-white p-4 shadow-sm">
                <Users size={32} className="text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                No warm contacts yet
              </h3>
              <p className="mt-2 max-w-lg text-sm text-gray-600">
                Message a {counterpartyLabel.toLowerCase()} first. Once a conversation exists, they will
                appear here and unlock the mock investment form.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <Button variant="primary" size="sm" onClick={() => navigate(directoryPath)}>
                  {currentUserRole === 'investor' ? 'Browse Startups' : 'Browse Investors'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate('/messages')}>
                  Open Messages
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
};
