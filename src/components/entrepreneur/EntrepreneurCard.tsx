import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, ExternalLink, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Entrepreneur } from '../../types';
import { Card, CardBody, CardFooter } from '../ui/Card';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface EntrepreneurCardProps {
  entrepreneur: Entrepreneur;
  showActions?: boolean;
  onTeamSizeUpdate?: (id: string, teamSize: number) => Promise<void>;
}

export const EntrepreneurCard: React.FC<EntrepreneurCardProps> = ({
  entrepreneur,
  showActions = true,
  onTeamSizeUpdate
}) => {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [isEditingTeam, setIsEditingTeam] = useState(false);
  const [teamSize, setTeamSize] = useState(entrepreneur.teamSize || 1);
  const [isSaving, setIsSaving] = useState(false);
  
  // Only the entrepreneur owner can edit their own team size
  const isOwner = currentUser?.id === entrepreneur.id && currentUser?.role === 'entrepreneur';
  
  const authHeader = useMemo(() => {
    const token = localStorage.getItem('business_nexus_access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);
  
  const apiBaseUrl = import.meta.env.VITE_API_URL as string | undefined;
  
  const handleViewProfile = () => {
    navigate(`/profile/entrepreneur/${entrepreneur.id}`);
  };
  
  const handleMessage = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/chat/${entrepreneur.id}`);
  };
  
  const handleTeamSizeUpdate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!apiBaseUrl || !entrepreneur.id || !isOwner) {
      return;
    }
    
    setIsSaving(true);
    
    try {
      const response = await fetch(`${apiBaseUrl}/users/update/${entrepreneur.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader
        },
        body: JSON.stringify({ teamSize })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update team size');
      }
      
      if (onTeamSizeUpdate) {
        await onTeamSizeUpdate(entrepreneur.id, teamSize);
      }
      
      setIsEditingTeam(false);
    } catch (err) {
      console.error('Error updating team size:', err);
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <Card 
      hoverable 
      className="transition-all duration-300 h-full"
      onClick={handleViewProfile}
    >
      <CardBody className="flex flex-col">
        <div className="flex items-start">
          <Avatar
            src={entrepreneur.avatarUrl}
            alt={entrepreneur.name}
            size="lg"
            status={entrepreneur.isOnline ? 'online' : 'offline'}
            className="mr-4"
          />
          
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{entrepreneur.name}</h3>
            <p className="text-sm text-gray-500 mb-2">{entrepreneur.startupName}</p>
            
            <div className="flex flex-wrap gap-2 mb-3">
              <Badge variant="primary" size="sm">{entrepreneur.industry}</Badge>
              <Badge variant="gray" size="sm">{entrepreneur.location}</Badge>
              <Badge variant="accent" size="sm">Founded {entrepreneur.foundedYear}</Badge>
            </div>
          </div>
        </div>
        
        <div className="mt-3">
          <h4 className="text-sm font-medium text-gray-900 mb-1">Pitch Summary</h4>
          <p className="text-sm text-gray-600 line-clamp-3">{entrepreneur.pitchSummary}</p>
        </div>
        
        <div className="mt-3 flex justify-between items-center">
          <div>
            <span className="text-xs text-gray-500">Funding Need</span>
            <p className="text-sm font-medium text-gray-900">{entrepreneur.fundingNeeded}</p>
          </div>
          
          <div>
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Users size={14} />
              Team Members
            </span>
            {isOwner && isEditingTeam ? (
              <div className="flex gap-1 mt-1" onClick={e => e.stopPropagation()}>
                <Input
                  type="number"
                  min="1"
                  value={teamSize}
                  onChange={(e) => setTeamSize(parseInt(e.target.value) || 1)}
                  className="w-16"
                />
                <Button
                  size="sm"
                  onClick={handleTeamSizeUpdate}
                  disabled={isSaving}
                >
                  {isSaving ? '...' : '✓'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTeamSize(entrepreneur.teamSize || 1);
                    setIsEditingTeam(false);
                  }}
                >
                  ✕
                </Button>
              </div>
            ) : (
              <div 
                className={`flex items-center gap-2 ${isOwner ? 'cursor-pointer hover:bg-gray-100' : ''} p-1 rounded transition`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isOwner) {
                    setIsEditingTeam(true);
                  }
                }}
              >
                <p className="text-sm font-medium text-gray-900">{entrepreneur.teamSize || 1} people</p>
                {isOwner && <span className="text-xs text-primary-600">✎</span>}
              </div>
            )}
          </div>
        </div>
        
        {entrepreneur.teamMembers && entrepreneur.teamMembers.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <h4 className="text-xs font-medium text-gray-700 mb-2">Team Members:</h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {entrepreneur.teamMembers.map((member, idx) => (
                <div key={idx} className="text-xs text-gray-600 flex items-center justify-between">
                  <span>{member.name} - {member.role}</span>
                  <span className="bg-primary-50 text-primary-700 px-2 py-0.5 rounded text-xs">
                    Type: {member.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardBody>
      
      {showActions && (
        <CardFooter className="border-t border-gray-100 bg-gray-50 flex justify-between">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<MessageCircle size={16} />}
            onClick={handleMessage}
          >
            Message
          </Button>
          
          <Button
            variant="primary"
            size="sm"
            rightIcon={<ExternalLink size={16} />}
            onClick={handleViewProfile}
          >
            View Profile
          </Button>
        </CardFooter>
      )}
    </Card>
  );
};