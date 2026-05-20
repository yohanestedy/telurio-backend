import { Role } from '@prisma/client';

export type Permission =
  | 'dashboard.view'
  | 'calendar.view'
  | 'orders.view'
  | 'orders.manage'
  | 'orders.deliver'
  | 'orders.pay'
  | 'orders.cancel'
  | 'productions.view'
  | 'productions.manage'
  | 'expenses.view'
  | 'expenses.manage'
  | 'expense-categories.view'
  | 'expense-categories.manage'
  | 'coops.view'
  | 'coops.manage'
  | 'users.view'
  | 'users.manage'
  | 'customers.view'
  | 'customers.manage'
  | 'prices.view'
  | 'prices.manage'
  | 'stocks.view'
  | 'stocks.manage'
  | 'general-expenses.view'
  | 'general-expenses.manage'
  | 'coop-health.view'
  | 'coop-health.manage'
  | 'general-expense-categories.view'
  | 'general-expense-categories.manage'
  | 'reports.view'
  | 'profile.view';

export const permissionMap: Record<Permission, Role[]> = {
  'dashboard.view': [Role.ADMIN, Role.OWNER, Role.OPERATOR],
  'calendar.view': [Role.ADMIN, Role.OWNER, Role.OPERATOR],
  'orders.view': [Role.ADMIN, Role.OWNER, Role.OPERATOR],
  'orders.manage': [Role.ADMIN],
  'orders.deliver': [Role.OPERATOR],
  'orders.pay': [Role.ADMIN, Role.OWNER, Role.OPERATOR],
  'orders.cancel': [Role.ADMIN],
  'productions.view': [Role.ADMIN, Role.OPERATOR],
  'productions.manage': [Role.ADMIN, Role.OPERATOR],
  'expenses.view': [Role.ADMIN, Role.OWNER],
  'expenses.manage': [Role.ADMIN, Role.OWNER],
  'expense-categories.view': [Role.ADMIN, Role.OWNER],
  'expense-categories.manage': [Role.OWNER],
  'coops.view': [Role.ADMIN, Role.OWNER, Role.OPERATOR],
  'coops.manage': [Role.ADMIN],
  'users.view': [Role.ADMIN],
  'users.manage': [Role.ADMIN],
  'customers.view': [Role.ADMIN, Role.OWNER],
  'customers.manage': [Role.ADMIN],
  'prices.view': [Role.ADMIN, Role.OWNER, Role.OPERATOR],
  'prices.manage': [Role.ADMIN],
  'stocks.view': [Role.ADMIN, Role.OWNER, Role.OPERATOR],
  'stocks.manage': [Role.ADMIN, Role.OWNER, Role.OPERATOR],
  'general-expenses.view': [Role.ADMIN, Role.OWNER],
  'general-expenses.manage': [Role.ADMIN, Role.OWNER],
  'coop-health.view': [Role.ADMIN, Role.OWNER, Role.OPERATOR],
  'coop-health.manage': [Role.ADMIN],
  'general-expense-categories.view': [Role.ADMIN, Role.OWNER],
  'general-expense-categories.manage': [Role.OWNER],
  'reports.view': [Role.ADMIN, Role.OWNER, Role.OPERATOR],
  'profile.view': [Role.ADMIN, Role.OWNER, Role.OPERATOR],
};

export function hasPermission(
  role: Role | undefined | null,
  permission: Permission,
): boolean {
  if (!role) {
    return false;
  }

  return permissionMap[permission].includes(role);
}
