/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import type { TFunction } from 'i18next'

import type { OrganizationRole } from './types'

const BUILT_IN_ROLE_NAME_KEYS = new Set([
  'Organization Owner',
  'Organization Admin',
  'Department Lead',
  'Developer',
  'Operations',
  'Finance',
  'Support',
  'Business',
  'Auditor',
])

export function getOrganizationRoleName(
  role: Pick<OrganizationRole, 'built_in' | 'name'>,
  t: TFunction
): string {
  if (!role.built_in || !BUILT_IN_ROLE_NAME_KEYS.has(role.name)) return role.name
  return t(role.name)
}

export function getOrganizationRoleNameByKey(
  roles: OrganizationRole[],
  roleKey: string,
  t: TFunction
): string {
  const role = roles.find((item) => item.key === roleKey)
  if (!role) return roleKey
  return getOrganizationRoleName(role, t)
}
