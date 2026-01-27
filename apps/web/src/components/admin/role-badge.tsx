import { Badge } from '@/components/ui/badge';
import { UserRole } from '@/types';

interface RoleBadgeProps {
  role: UserRole;
}

const roleConfig = {
  [UserRole.OWNER]: {
    label: 'Dueño',
    variant: 'destructive' as const
  },
  [UserRole.ADMIN]: {
    label: 'Administrador',
    variant: 'default' as const
  },
  [UserRole.DRIVER]: {
    label: 'Chofer',
    variant: 'secondary' as const
  },
  [UserRole.CUSTOMER]: {
    label: 'Cliente',
    variant: 'outline' as const
  }
};

export function RoleBadge({ role }: RoleBadgeProps) {
  const config = roleConfig[role];

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
