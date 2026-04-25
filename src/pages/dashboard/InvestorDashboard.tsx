import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, PieChart, Filter, Search, PlusCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { EntrepreneurCard } from '../../components/entrepreneur/EntrepreneurCard';
import { useAuth } from '../../context/AuthContext';
import { Entrepreneur } from '../../types';

type DealApiResponse = {
  deals?: Array<{
    startup?: { id?: string };
    investor?: { id?: string };
    status?: string;
  }>;
};

export const InvestorDashboard: React.FC = () => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [entrepreneurs, setEntrepreneurs] = useState<Entrepreneur[]>([]);
  const [connectionCount, setConnectionCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const currentUserId = (user as any)?.id?.toString?.() || (user as any)?._id?.toString?.() || '';
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';

  useEffect(() => {
    if (!user) {
      setEntrepreneurs([]);
      setConnectionCount(0);
      setIsLoading(false);
      return;
    }

    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);
        setError('');
        const token = localStorage.getItem('business_nexus_access_token');

        const entrepreneurPromise = fetch(`${apiUrl}/entrepreneur/list/all`);
        const dealsPromise = token
          ? fetch(`${apiUrl}/deals`, {
              headers: {
                Authorization: `Bearer ${token}`
              }
            })
          : Promise.resolve(null);

        const [entrepreneurRes, dealsRes] = await Promise.all([entrepreneurPromise, dealsPromise]);

        if (entrepreneurRes.ok) {
          const entrepreneurData = await entrepreneurRes.json();
          const list = Array.isArray(entrepreneurData) ? entrepreneurData : [];
          setEntrepreneurs(list);
        } else {
          setEntrepreneurs([]);
        }

        if (dealsRes && dealsRes.ok) {
          const dealsData: DealApiResponse = await dealsRes.json();
          const deals = Array.isArray(dealsData?.deals) ? dealsData.deals : [];
          const connectedStartupIds = new Set(
            deals
              .map(deal => deal.startup?.id?.toString?.())
              .filter((id): id is string => Boolean(id))
          );
          setConnectionCount(connectedStartupIds.size);
        } else {
          setConnectionCount(0);
        }
      } catch (err) {
        console.error('Error loading investor dashboard:', err);
        setError('Failed to load dashboard data');
        setEntrepreneurs([]);
        setConnectionCount(0);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchDashboardData();
  }, [apiUrl, currentUserId, user]);
  
  // Filter entrepreneurs based on search and industry filters
  const filteredEntrepreneurs = useMemo(
    () =>
      entrepreneurs.filter(entrepreneur => {
        const name = entrepreneur.name || '';
        const startupName = entrepreneur.startupName || '';
        const industry = entrepreneur.industry || '';
        const pitchSummary = entrepreneur.pitchSummary || '';

        const matchesSearch =
          searchQuery === '' ||
          name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          startupName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          industry.toLowerCase().includes(searchQuery.toLowerCase()) ||
          pitchSummary.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesIndustry =
          selectedIndustries.length === 0 || selectedIndustries.includes(industry);

        return matchesSearch && matchesIndustry;
      }),
    [entrepreneurs, searchQuery, selectedIndustries]
  );
  
  // Get unique industries for filter
  const industries = Array.from(new Set(entrepreneurs.map(e => e.industry).filter(Boolean)));
  
  // Toggle industry selection
  const toggleIndustry = (industry: string) => {
    setSelectedIndustries(prevSelected => 
      prevSelected.includes(industry)
        ? prevSelected.filter(i => i !== industry)
        : [...prevSelected, industry]
    );
  };

  if (!user) return null;
  
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Discover Startups</h1>
          <p className="text-gray-600">Find and connect with promising entrepreneurs</p>
        </div>
        
        <Link to="/entrepreneurs">
          <Button
            leftIcon={<PlusCircle size={18} />}
          >
            View All Startups
          </Button>
        </Link>
      </div>
      
      {/* Filters and search */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="w-full md:w-2/3">
          <Input
            placeholder="Search startups, industries, or keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            fullWidth
            startAdornment={<Search size={18} />}
          />
        </div>
        
        <div className="w-full md:w-1/3">
          <div className="flex items-center space-x-2">
            <Filter size={18} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filter by:</span>
            
            <div className="flex flex-wrap gap-2">
              {industries.map(industry => (
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
          </div>
        </div>
      </div>
      
      {/* Stats summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-primary-50 border border-primary-100">
          <CardBody>
            <div className="flex items-center">
              <div className="p-3 bg-primary-100 rounded-full mr-4">
                <Users size={20} className="text-primary-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary-700">Total Startups</p>
                <h3 className="text-xl font-semibold text-primary-900">{entrepreneurs.length}</h3>
              </div>
            </div>
          </CardBody>
        </Card>
        
        <Card className="bg-secondary-50 border border-secondary-100">
          <CardBody>
            <div className="flex items-center">
              <div className="p-3 bg-secondary-100 rounded-full mr-4">
                <PieChart size={20} className="text-secondary-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-secondary-700">Industries</p>
                <h3 className="text-xl font-semibold text-secondary-900">{industries.length}</h3>
              </div>
            </div>
          </CardBody>
        </Card>
        
        <Card className="bg-accent-50 border border-accent-100">
          <CardBody>
            <div className="flex items-center">
              <div className="p-3 bg-accent-100 rounded-full mr-4">
                <Users size={20} className="text-accent-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-accent-700">Your Connections</p>
                <h3 className="text-xl font-semibold text-accent-900">
                  {connectionCount}
                </h3>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
      
      {/* Entrepreneurs grid */}
      <div>
        <Card>
          <CardHeader>
            <h2 className="text-lg font-medium text-gray-900">Featured Startups</h2>
          </CardHeader>
          
          <CardBody>
            {isLoading && (
              <div className="text-center py-8 text-gray-600">Loading startups...</div>
            )}

            {!isLoading && error && (
              <div className="text-center py-8">
                <p className="text-red-600">{error}</p>
              </div>
            )}

            {!isLoading && !error && filteredEntrepreneurs.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredEntrepreneurs.map(entrepreneur => (
                  <EntrepreneurCard
                    key={entrepreneur.id}
                    entrepreneur={entrepreneur}
                  />
                ))}
              </div>
            ) : !isLoading && !error ? (
              <div className="text-center py-8">
                <p className="text-gray-600">No startups match your filters</p>
                <Button 
                  variant="outline" 
                  className="mt-2"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedIndustries([]);
                  }}
                >
                  Clear filters
                </Button>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
};
