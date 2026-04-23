import React, { useState, useEffect } from 'react';
import { Search, Filter, MapPin } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { InvestorCard } from '../../components/investor/InvestorCard';

interface Investor {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string;
  bio: string;
  location: string;
  investmentStage: string[];
  investmentInterests: string[];
  portfolioCompanies: string[];
  position: string;
  createdAt: string;
}

export const InvestorsPage: React.FC = () => {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);

  useEffect(() => {
    fetchInvestors();
  }, []);

  const fetchInvestors = async () => {
    try {
      setLoading(true);
      setError(null);
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
      const response = await fetch(`${apiUrl}/investor/list/all`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch investors');
      }
      
      const data = await response.json();
      setInvestors(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching investors:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Get unique investment stages and interests
  const allStages = Array.from(new Set(investors.flatMap(i => i.investmentStage || [])));
  const allInterests = Array.from(new Set(investors.flatMap(i => i.investmentInterests || [])));

  // Filter investors based on search and filters
  const filteredInvestors = investors.filter(investor => {
    const matchesSearch = searchQuery === '' || 
      investor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      investor.bio.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (investor.investmentInterests || []).some(interest => 
        interest.toLowerCase().includes(searchQuery.toLowerCase())
      );
    
    const matchesStages = selectedStages.length === 0 ||
      (investor.investmentStage || []).some(stage => selectedStages.includes(stage));
    
    const matchesInterests = selectedInterests.length === 0 ||
      (investor.investmentInterests || []).some(interest => selectedInterests.includes(interest));
    
    return matchesSearch && matchesStages && matchesInterests;
  });
  
  const toggleStage = (stage: string) => {
    setSelectedStages(prev => 
      prev.includes(stage)
        ? prev.filter(s => s !== stage)
        : [...prev, stage]
    );
  };
  
  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev => 
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };
  
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Find Investors</h1>
        <p className="text-gray-600">Connect with investors who match your startup's needs</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-medium text-gray-900">Filters</h2>
            </CardHeader>
            <CardBody className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Investment Stage</h3>
                <div className="space-y-2">
                  {allStages.map(stage => (
                    <button
                      key={stage}
                      onClick={() => toggleStage(stage)}
                      className={`block w-full text-left px-3 py-2 rounded-md text-sm ${
                        selectedStages.includes(stage)
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {stage}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Investment Interests</h3>
                <div className="flex flex-wrap gap-2">
                  {allInterests.map(interest => (
                    <Badge
                      key={interest}
                      variant={selectedInterests.includes(interest) ? 'primary' : 'gray'}
                      className="cursor-pointer"
                      onClick={() => toggleInterest(interest)}
                    >
                      {interest}
                    </Badge>
                  ))}
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Location</h3>
                <div className="space-y-2">
                  <button className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50">
                    <MapPin size={16} className="mr-2" />
                    San Francisco, CA
                  </button>
                  <button className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50">
                    <MapPin size={16} className="mr-2" />
                    New York, NY
                  </button>
                  <button className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50">
                    <MapPin size={16} className="mr-2" />
                    Boston, MA
                  </button>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
        
        {/* Main content */}
        <div className="lg:col-span-3 space-y-6">
          <div className="flex items-center gap-4">
            <Input
              placeholder="Search investors by name, interests, or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              startAdornment={<Search size={18} />}
              fullWidth
            />
            
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-gray-500" />
              <span className="text-sm text-gray-600">
                {filteredInvestors.length} results
              </span>
            </div>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-4"></div>
                <p className="text-gray-600">Loading investors...</p>
              </div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">Error: {error}</p>
              <button 
                onClick={fetchInvestors}
                className="mt-2 text-sm px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Try Again
              </button>
            </div>
          ) : filteredInvestors.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600">No investors found matching your criteria.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredInvestors.map(investor => (
                <InvestorCard
                  key={investor.id}
                  investor={investor}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};