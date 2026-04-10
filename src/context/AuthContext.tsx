import React, { createContext, useState, useContext, useEffect } from 'react';
import { User, UserRole, AuthContextType } from '../types';
import toast from 'react-hot-toast';

// Create Auth Context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Local storage keys
const USER_STORAGE_KEY = 'business_nexus_user';
const TOKEN_STORAGE_KEY = 'business_nexus_access_token';
const RESET_TOKEN_KEY = 'business_nexus_reset_token';

const API_BASE_URL = import.meta.env.VITE_API_URL as string | undefined;

const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const apiRequest = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
  if (!API_BASE_URL) {
    throw new Error('Missing API base URL');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(init.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error((data as { message?: string; error?: string }).message || (data as { error?: string }).error || 'Request failed');
  }

  return data as T;
};

const fetchAuthenticatedUser = async (): Promise<User | null> => {
  try {
    return await apiRequest<User>('/auth/me', { method: 'GET' });
  } catch {
    return null;
  }
};

// Auth Provider Component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for stored user on initial load
  useEffect(() => {
    const storedUser = localStorage.getItem(USER_STORAGE_KEY);
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }

    const hasToken = !!localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!hasToken) {
      setIsLoading(false);
      return;
    }

    fetchAuthenticatedUser()
      .then(fetchedUser => {
        if (fetchedUser) {
          setUser(fetchedUser);
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(fetchedUser));
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Login with API
  const login = async (email: string, password: string, role: UserRole): Promise<void> => {
    setIsLoading(true);
    
    try {
      const data = await apiRequest<{ accessToken: string; user?: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      if (!data.accessToken) {
        throw new Error('Missing access token');
      }

      localStorage.setItem(TOKEN_STORAGE_KEY, data.accessToken);

      let resolvedUser = data.user ?? null;

      if (!resolvedUser) {
        resolvedUser = await fetchAuthenticatedUser();
      }

      if (!resolvedUser) {
        const displayName = email.split('@')[0] || 'User';
        resolvedUser = {
          id: `${role[0]}-${Date.now()}`,
          name: displayName,
          email,
          role,
          avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`,
          bio: '',
          createdAt: new Date().toISOString()
        };
      }

      setUser(resolvedUser);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(resolvedUser));
      toast.success('Successfully logged in!');
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Register with API
  const register = async (name: string, email: string, password: string, role: UserRole): Promise<void> => {
    setIsLoading(true);
    
    try {
      const data = await apiRequest<{ accessToken: string; user?: User }>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password, type: role, username: name })
      });

      if (!data.accessToken) {
        throw new Error('Missing access token');
      }

      localStorage.setItem(TOKEN_STORAGE_KEY, data.accessToken);

      let resolvedUser = data.user ?? null;

      if (!resolvedUser) {
        resolvedUser = await fetchAuthenticatedUser();
      }

      if (!resolvedUser) {
        resolvedUser = {
          id: `${role[0]}-${Date.now()}`,
          name,
          email,
          role,
          avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
          bio: '',
          createdAt: new Date().toISOString()
        };
      }

      setUser(resolvedUser);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(resolvedUser));
      toast.success('Account created successfully!');
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const forgotPassword = async (email: string): Promise<void> => {
    try {
      const data = await apiRequest<{ resetToken?: string; message?: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });

      if (data.resetToken) {
        localStorage.setItem(RESET_TOKEN_KEY, data.resetToken);
      }

      toast.success('Password reset instructions sent to your email');
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    }
  };

  const resetPassword = async (token: string, newPassword: string): Promise<void> => {
    try {
      const storedToken = localStorage.getItem(RESET_TOKEN_KEY);
      const payloadToken = token || storedToken;

      if (!payloadToken) {
        throw new Error('Missing reset token');
      }

      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: payloadToken, newPassword })
      });

      localStorage.removeItem(RESET_TOKEN_KEY);
      toast.success('Password reset successfully');
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    }
  };

  // Logout function
  const logout = (): void => {
    setUser(null);
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    toast.success('Logged out successfully');
  };

  const updateProfile = async (userId: string, updates: Partial<User>): Promise<void> => {
    try {
      const updatedUser = await apiRequest<User>(`/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });

      if (user?.id === userId) {
        setUser(updatedUser);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser));
      }

      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    }
  };

  const value = {
    user,
    login,
    register,
    logout,
    forgotPassword,
    resetPassword,
    updateProfile,
    isAuthenticated: !!user,
    isLoading
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook for using auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
