import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, ExternalLink, DollarSign } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardBody, CardFooter } from '../ui/Card';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { DashboardWarmContact } from '../../pages/dashboard/dashboardApi';

interface WarmContactCardProps {
  contact: DashboardWarmContact;
  profilePath: string;
}

const getDealStatusVariant = (status?: string) => {
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

const formatMoney = (amount?: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0
  }).format(Number(amount || 0));

export const WarmContactCard: React.FC<WarmContactCardProps> = ({
  contact,
  profilePath
}) => {
  const navigate = useNavigate();
  const hasDeal = Boolean(contact.dealId);

  const handleViewProfile = () => {
    navigate(profilePath);
  };

  const handleMessage = (event: React.MouseEvent) => {
    event.stopPropagation();
    navigate(`/chat/${contact.id}`);
  };

  const handleOpenDeals = (event: React.MouseEvent) => {
    event.stopPropagation();
    navigate('/deals');
  };

  return (
    <Card hoverable className="transition-all duration-300 h-full" onClick={handleViewProfile}>
      <CardBody className="flex h-full flex-col">
        <div className="flex items-start gap-4">
          <Avatar src={contact.avatarUrl} alt={contact.name} size="lg" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold text-gray-900">{contact.name}</h3>
              <Badge variant="gray" size="sm" rounded>
                {contact.role === 'investor' ? 'Investor' : 'Startup'}
              </Badge>
              {contact.dealStatus && (
                <Badge variant={getDealStatusVariant(contact.dealStatus)} size="sm" rounded>
                  {contact.dealStatus}
                </Badge>
              )}
            </div>

            <p className="mt-1 text-sm text-gray-500">
              {contact.industry || contact.startupName || 'Warm contact'}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="primary" size="sm">
                {contact.messageCount} message{contact.messageCount === 1 ? '' : 's'}
              </Badge>
              {hasDeal && (
                <Badge variant="accent" size="sm">
                  {formatMoney(contact.dealAmount, contact.dealCurrency)}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex-1 rounded-2xl bg-gray-50 p-4">
          <p className="text-sm text-gray-600 line-clamp-3">
            {contact.lastMessage || 'Conversation started'}
          </p>
          <p className="mt-3 text-xs text-gray-500">
            Last message {formatDistanceToNow(new Date(contact.lastMessageAt), { addSuffix: true })}
          </p>
          {hasDeal && (
            <p className="mt-2 flex items-center gap-2 text-xs text-gray-500">
              <DollarSign size={14} />
              {contact.dealTitle || 'Active deal'} is linked to this conversation.
            </p>
          )}
        </div>
      </CardBody>

      <CardFooter className="border-t border-gray-100 bg-gray-50 flex justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          leftIcon={<MessageCircle size={16} />}
          onClick={handleMessage}
        >
          Message
        </Button>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<DollarSign size={16} />}
            onClick={handleOpenDeals}
          >
            Deals
          </Button>
          <Button
            variant="primary"
            size="sm"
            rightIcon={<ExternalLink size={16} />}
            onClick={handleViewProfile}
          >
            Profile
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};
