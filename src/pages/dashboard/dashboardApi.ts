import { Entrepreneur, Investor, UserRole } from '../../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
export const DASHBOARD_TOKEN_KEY = 'business_nexus_access_token';

export interface DashboardStats {
  warmContactsCount: number;
  activeDealsCount: number;
  closedDealsCount: number;
  unreadMessagesCount: number;
  unreadNotificationsCount: number;
}

export interface DashboardWarmContact {
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
  dealId?: string;
  dealStatus?: string;
  dealAmount?: number;
  dealCurrency?: string;
  dealTitle?: string;
}

export interface DashboardDeal {
  id: string;
  investor: Investor | null;
  startup: Entrepreneur | null;
  roomId: string;
  title: string;
  amount: number;
  currency: string;
  equity: number;
  round: string;
  note: string;
  status: string;
  isMock: boolean;
  source: string;
  metadata: Record<string, unknown>;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummaryResponse {
  role?: UserRole;
  stats?: Partial<DashboardStats>;
  warmContacts?: DashboardWarmContact[];
  recommendedUsers?: Array<Investor | Entrepreneur>;
  recentDeals?: DashboardDeal[];
  error?: string;
  message?: string;
}

const fetchJson = async <T,>(path: string, token?: string): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`
        }
      : undefined
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

export const fetchDashboardSummary = async (token: string): Promise<DashboardSummaryResponse> =>
  fetchJson<DashboardSummaryResponse>('/dashboard', token);

export const fetchEntrepreneurDirectory = async (): Promise<Entrepreneur[]> =>
  fetchJson<Entrepreneur[]>('/entrepreneur/list/all');
