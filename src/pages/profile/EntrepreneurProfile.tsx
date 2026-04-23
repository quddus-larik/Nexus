import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { MessageCircle, Users, Calendar, Building2, MapPin, UserCircle, FileText, DollarSign } from 'lucide-react';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { Entrepreneur } from '../../types';
import { DASHBOARD_TOKEN_KEY, fetchDashboardSummary } from '../dashboard/dashboardApi';

export const EntrepreneurProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser, updateProfile } = useAuth();

  const [entrepreneur, setEntrepreneur] = useState<Entrepreneur | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [relationshipState, setRelationshipState] = useState<{
    isWarmContact: boolean;
    activeDealId: string;
    activeDealStatus: string;
  }>({
    isWarmContact: false,
    activeDealId: '',
    activeDealStatus: ''
  });
  const [formState, setFormState] = useState({
    name: '',
    startupName: '',
    industry: '',
    location: '',
    pitchSummary: '',
    teamSize: 0,
    teamMembers: [] as Array<{ name: string; role: string; type: number }>
  });

  const apiBaseUrl = import.meta.env.VITE_API_URL as string | undefined;

  useEffect(() => {
    if (!id) {
      setError('Missing entrepreneur id');
      setIsLoading(false);
      return;
    }

    if (!apiBaseUrl) {
      setError('Missing API base URL');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    fetch(`${apiBaseUrl}/entrepreneur/${id}`)
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || data.message || 'Failed to load entrepreneur');
        }
        return data as Entrepreneur;
      })
      .then(data => {
        setEntrepreneur(data);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load entrepreneur');
      })
      .finally(() => setIsLoading(false));
  }, [apiBaseUrl, id]);

  useEffect(() => {
    if (!id || !currentUser || currentUser.role !== 'investor' || currentUser.id === id) {
      setRelationshipState({
        isWarmContact: false,
        activeDealId: '',
        activeDealStatus: ''
      });
      return;
    }

    const token = localStorage.getItem(DASHBOARD_TOKEN_KEY);
    if (!token) {
      setRelationshipState({
        isWarmContact: false,
        activeDealId: '',
        activeDealStatus: ''
      });
      return;
    }

    let isActive = true;

    void fetchDashboardSummary(token)
      .then((data) => {
        if (!isActive) return;

        const warmContact = (data.warmContacts || []).some((contact) => contact.id === id);
        const activeDeal = (data.recentDeals || []).find(
          (deal) => deal.startup?.id === id || deal.investor?.id === id
        );

        setRelationshipState({
          isWarmContact: warmContact,
          activeDealId: activeDeal?.id || '',
          activeDealStatus: activeDeal?.status || ''
        });
      })
      .catch(() => {
        if (!isActive) return;

        setRelationshipState({
          isWarmContact: false,
          activeDealId: '',
          activeDealStatus: ''
        });
      });

    return () => {
      isActive = false;
    };
  }, [currentUser, id]);

  useEffect(() => {
    if (!entrepreneur) {
      return;
    }

    setFormState({
      name: entrepreneur.name || '',
      startupName: entrepreneur.startupName || '',
      industry: entrepreneur.industry || '',
      location: entrepreneur.location || '',
      pitchSummary: entrepreneur.pitchSummary || entrepreneur.bio || '',
      teamSize: entrepreneur.teamSize || 0,
      teamMembers: entrepreneur.teamMembers || []
    });
  }, [entrepreneur]);

  const handleSave = async () => {
    if (!id || !entrepreneur) {
      return;
    }

    setIsSaving(true);
    setFormError(null);

    const token = localStorage.getItem(DASHBOARD_TOKEN_KEY);

    const payload = {
      username: formState.name.trim(),
      position: formState.startupName.trim(),
      industries: formState.industry ? [formState.industry.trim()] : [],
      address: formState.location.trim(),
      about: formState.pitchSummary.trim(),
      teamMembers: formState.teamMembers.filter(member => member.name && member.role && typeof member.type === 'number'),
      teamSize: formState.teamSize || 0
    };

    try {
      if (!token) {
        throw new Error('Missing authentication token');
      }

      const updatedUser = await updateProfile(id, payload);
      setEntrepreneur(updatedUser as Entrepreneur);
      setIsEditing(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (entrepreneur) {
      setFormState({
        name: entrepreneur.name || '',
        startupName: entrepreneur.startupName || '',
        industry: entrepreneur.industry || '',
        location: entrepreneur.location || '',
        pitchSummary: entrepreneur.pitchSummary || entrepreneur.bio || '',
        teamSize: entrepreneur.teamSize || 1,
        teamMembers: entrepreneur.teamMembers || []
      });
    }
    setFormError(null);
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900">Loading entrepreneur...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900">Unable to load entrepreneur</h2>
        <p className="text-gray-600 mt-2">{error}</p>
        <Link to="/dashboard/investor">
          <Button variant="outline" className="mt-4">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  if (!entrepreneur || entrepreneur.role !== 'entrepreneur') {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900">Entrepreneur not found</h2>
        <p className="text-gray-600 mt-2">The entrepreneur profile you're looking for doesn't exist or has been removed.</p>
        <Link to="/dashboard/investor">
          <Button variant="outline" className="mt-4">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }
  
  const isCurrentUser = currentUser?.id === entrepreneur.id;
  const isInvestor = currentUser?.role === 'investor';
  const effectiveTeamSize = entrepreneur.teamSize;
  const dealButtonLabel = relationshipState.activeDealId
    ? 'Open Deal Desk'
    : relationshipState.isWarmContact
      ? 'Create Deal'
      : 'Message First';
  
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Profile header */}
      <Card>
        <CardBody className="sm:flex sm:items-start sm:justify-between p-6">
          <div className="sm:flex sm:space-x-6">
            <Avatar
              src={entrepreneur.avatarUrl}
              alt={entrepreneur.name}
              size="xl"
              className="mx-auto sm:mx-0"
            />
            
            <div className="mt-4 sm:mt-0 text-center sm:text-left">
              <h1 className="text-2xl font-bold text-gray-900">{entrepreneur.name}</h1>
              <p className="text-gray-600 flex items-center justify-center sm:justify-start mt-1">
                <Building2 size={16} className="mr-1" />
                Founder at {entrepreneur.startupName || 'Startup'}
              </p>
              
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start mt-3">
                <Badge variant="primary">{entrepreneur.industry || 'Industry'}</Badge>
                <Badge variant="gray">
                  <MapPin size={14} className="mr-1" />
                  {entrepreneur.location || 'Location'}
                </Badge>
                <Badge variant="accent">
                  <Calendar size={14} className="mr-1" />
                  Founded {entrepreneur.foundedYear || '—'}
                </Badge>
                <Badge variant="secondary">
                  <Users size={14} className="mr-1" />
                  {effectiveTeamSize} team members
                </Badge>
                {isInvestor && !isCurrentUser && (
                  <Badge
                    variant={relationshipState.activeDealId ? 'success' : relationshipState.isWarmContact ? 'primary' : 'gray'}
                  >
                    {relationshipState.activeDealId
                      ? `Deal ${relationshipState.activeDealStatus || 'linked'}`
                      : relationshipState.isWarmContact
                        ? 'Warm contact'
                        : 'Message first'}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          <div className="mt-6 sm:mt-0 flex flex-col sm:flex-row gap-2 justify-center sm:justify-end">
            {!isCurrentUser && (
              <>
                <Link to={`/chat/${entrepreneur.id}`}>
                  <Button
                    variant="outline"
                    leftIcon={<MessageCircle size={18} />}
                  >
                    Message
                  </Button>
                </Link>
                
                {isInvestor && (
                  <Button
                    leftIcon={<DollarSign size={18} />}
                    variant={relationshipState.activeDealId ? 'secondary' : 'primary'}
                    onClick={() => navigate('/deals')}
                  >
                    {dealButtonLabel}
                  </Button>
                )}
              </>
            )}
            
            {isCurrentUser && (
              <Button
                variant="outline"
                leftIcon={<UserCircle size={18} />}
                onClick={() => (isEditing ? handleCancel() : setIsEditing(true))}
              >
                {isEditing ? 'Cancel' : 'Edit Profile'}
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      {isCurrentUser && isEditing && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-medium text-gray-900">Edit Profile</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Full Name"
                value={formState.name}
                onChange={event => setFormState(prev => ({ ...prev, name: event.target.value }))}
                fullWidth
              />
              <Input
                label="Startup Name"
                value={formState.startupName}
                onChange={event => setFormState(prev => ({ ...prev, startupName: event.target.value }))}
                fullWidth
              />
              <Input
                label="Industry"
                value={formState.industry}
                onChange={event => setFormState(prev => ({ ...prev, industry: event.target.value }))}
                fullWidth
              />
              <Input
                label="Location"
                value={formState.location}
                onChange={event => setFormState(prev => ({ ...prev, location: event.target.value }))}
                fullWidth
              />
              <Input
                label="Team Size"
                type="number"
                min="1"
                value={formState.teamSize}
                onChange={event => setFormState(prev => ({ ...prev, teamSize: parseInt(event.target.value) || 1 }))}
                fullWidth
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pitch Summary</label>
              <textarea
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                rows={4}
                value={formState.pitchSummary}
                onChange={event => setFormState(prev => ({ ...prev, pitchSummary: event.target.value }))}
              />
            </div>
            {formError && (
              <p className="text-sm text-error-500">{formError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content - left side */}
        <div className="lg:col-span-2 space-y-6">
          {/* About */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-medium text-gray-900">About</h2>
            </CardHeader>
            <CardBody>
              <p className="text-gray-700">{entrepreneur.bio}</p>
            </CardBody>
          </Card>
          
          {/* Startup Description */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-medium text-gray-900">Startup Overview</h2>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                <div>
                  <h3 className="text-md font-medium text-gray-900">Problem Statement</h3>
                  <p className="text-gray-700 mt-1">
                    {entrepreneur?.pitchSummary?.split('.')[0] ? `${entrepreneur.pitchSummary.split('.')[0]}.` : 'Problem statement not provided.'}
                  </p>
                </div>
                
                <div>
                  <h3 className="text-md font-medium text-gray-900">Solution</h3>
                  <p className="text-gray-700 mt-1">
                    {entrepreneur.pitchSummary || 'Solution details not provided.'}
                  </p>
                </div>
                
                <div>
                  <h3 className="text-md font-medium text-gray-900">Market Opportunity</h3>
                  <p className="text-gray-700 mt-1">
                    {entrepreneur.industry
                      ? `The ${entrepreneur.industry} market is experiencing significant growth, with a projected CAGR of 14.5% through 2027. Our solution addresses key pain points in this expanding market.`
                      : 'Market opportunity details are being prepared.'}
                  </p>
                </div>
                
                <div>
                  <h3 className="text-md font-medium text-gray-900">Competitive Advantage</h3>
                  <p className="text-gray-700 mt-1">
                    Unlike our competitors, we offer a unique approach that combines innovative technology with deep industry expertise, resulting in superior outcomes for our customers.
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
          
          {/* Team */}
          <Card>
            <CardHeader className="flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-900">Team</h2>
              <span className="text-sm text-gray-500">{effectiveTeamSize} members</span>
            </CardHeader>
            <CardBody>
              {isCurrentUser && isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Team Members</label>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {formState.teamMembers.map((member, index) => (
                        <div key={index} className="flex gap-2 items-end">
                          <Input
                            placeholder="Name"
                            value={member.name}
                            onChange={(e) => {
                              const updated = [...formState.teamMembers];
                              updated[index].name = e.target.value;
                              setFormState(prev => ({ ...prev, teamMembers: updated }));
                            }}
                            fullWidth
                          />
                          <Input
                            placeholder="Role (e.g., CEO, CTO, Designer)"
                            value={member.role}
                            onChange={(e) => {
                              const updated = [...formState.teamMembers];
                              updated[index].role = e.target.value;
                              setFormState(prev => ({ ...prev, teamMembers: updated }));
                            }}
                            fullWidth
                          />
                          <Input
                            type="number"
                            placeholder="Type"
                            value={member.type}
                            onChange={(e) => {
                              const updated = [...formState.teamMembers];
                              updated[index].type = parseInt(e.target.value) || 0;
                              setFormState(prev => ({ ...prev, teamMembers: updated }));
                            }}
                            fullWidth
                          />
                          <Button
                            variant="outline"
                            onClick={() => {
                              const updated = formState.teamMembers.filter((_, i) => i !== index);
                              setFormState(prev => ({ ...prev, teamMembers: updated }));
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setFormState(prev => ({
                          ...prev,
                          teamMembers: [...prev.teamMembers, { name: '', role: '', type: 0 }]
                        }));
                      }}
                      className="mt-2 w-full"
                    >
                      + Add Team Member
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {entrepreneur.teamMembers && entrepreneur.teamMembers.length > 0 ? (
                    <>
                      {entrepreneur.teamMembers.map((member, index) => (
                        <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-md">
                          <div className="flex items-center flex-1">
                            <Avatar
                              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=random`}
                              alt={member.name}
                              size="md"
                              className="mr-3"
                            />
                            <div>
                              <h3 className="text-sm font-medium text-gray-900">{member.name}</h3>
                              <p className="text-xs text-gray-500">{member.role}</p>
                            </div>
                          </div>
                          <div className="bg-primary-100 px-2 py-1 rounded text-xs font-medium text-primary-700">
                            Type: {member.type}
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="col-span-full text-center py-4">
                      <p className="text-gray-500">No team members added yet</p>
                     </div>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
        
        {/* Sidebar - right side */}
        <div className="space-y-6">
          {/* Funding Details */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-medium text-gray-900">Funding</h2>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                <div>
                  <span className="text-sm text-gray-500">Current Round</span>
                  <div className="flex items-center mt-1">
                    <DollarSign size={18} className="text-accent-600 mr-1" />
                    <p className="text-lg font-semibold text-gray-900">{entrepreneur.fundingNeeded || 'Not specified'}</p>
                  </div>
                </div>
                
                <div>
                  <span className="text-sm text-gray-500">Valuation</span>
                  <p className="text-md font-medium text-gray-900">$8M - $12M</p>
                </div>
                
                <div>
                  <span className="text-sm text-gray-500">Previous Funding</span>
                  <p className="text-md font-medium text-gray-900">$750K Seed (2022)</p>
                </div>
                
                <div className="pt-3 border-t border-gray-100">
                  <span className="text-sm text-gray-500">Funding Timeline</span>
                  <div className="mt-2 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium">Pre-seed</span>
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Completed</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium">Seed</span>
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Completed</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium">Series A</span>
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">In Progress</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
          
          {/* Documents */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-medium text-gray-900">Documents</h2>
            </CardHeader>
            <CardBody>
              <div className="space-y-3">
                <div className="flex items-center p-3 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">
                  <div className="p-2 bg-primary-50 rounded-md mr-3">
                    <FileText size={18} className="text-primary-700" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-gray-900">Pitch Deck</h3>
                    <p className="text-xs text-gray-500">Updated 2 months ago</p>
                  </div>
                  <Button variant="outline" size="sm">View</Button>
                </div>
                
                <div className="flex items-center p-3 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">
                  <div className="p-2 bg-primary-50 rounded-md mr-3">
                    <FileText size={18} className="text-primary-700" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-gray-900">Business Plan</h3>
                    <p className="text-xs text-gray-500">Updated 1 month ago</p>
                  </div>
                  <Button variant="outline" size="sm">View</Button>
                </div>
                
                <div className="flex items-center p-3 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">
                  <div className="p-2 bg-primary-50 rounded-md mr-3">
                    <FileText size={18} className="text-primary-700" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-gray-900">Financial Projections</h3>
                    <p className="text-xs text-gray-500">Updated 2 weeks ago</p>
                  </div>
                  <Button variant="outline" size="sm">View</Button>
                </div>
              </div>
              
              {!isCurrentUser && isInvestor && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-sm text-gray-500">
                    {relationshipState.activeDealId
                      ? 'This startup already has a mock investment linked. Open the deal desk to update the round, amount, or status.'
                      : relationshipState.isWarmContact
                        ? 'You have already messaged this startup. Create a mock investment from the deal desk.'
                        : 'Message this founder first to unlock mock investment actions.'}
                  </p>

                  <Button
                    className="mt-3 w-full"
                    variant={relationshipState.activeDealId ? 'secondary' : 'primary'}
                    onClick={() => {
                      if (relationshipState.activeDealId || relationshipState.isWarmContact) {
                        navigate('/deals');
                        return;
                      }

                      navigate(`/chat/${entrepreneur.id}`);
                    }}
                  >
                    {relationshipState.activeDealId
                      ? 'Open Deal Desk'
                      : relationshipState.isWarmContact
                        ? 'Create Mock Deal'
                        : 'Message Startup'}
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
};
