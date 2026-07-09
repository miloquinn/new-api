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

import type {
  OrganizationPermissionCatalog,
  OrganizationPermissionMatrix,
  OrganizationRole,
  OrganizationRolePayload,
} from './types'

export type RoleDraft = OrganizationRolePayload & {
  id?: number
  built_in?: boolean
}

export function createEmptyMatrix(
  catalog: OrganizationPermissionCatalog
): OrganizationPermissionMatrix {
  const matrix: OrganizationPermissionMatrix = {}
  for (const resource of catalog.resources) {
    matrix[resource.resource] = {}
    for (const action of resource.actions) {
      matrix[resource.resource][action.action] = false
    }
  }
  return matrix
}

export function normalizeMatrix(
  catalog: OrganizationPermissionCatalog,
  value?: OrganizationPermissionMatrix
): OrganizationPermissionMatrix {
  const matrix = createEmptyMatrix(catalog)
  for (const resource of catalog.resources) {
    for (const action of resource.actions) {
      matrix[resource.resource][action.action] =
        value?.[resource.resource]?.[action.action] ?? false
    }
  }
  return matrix
}

export function roleToDraft(
  role: OrganizationRole,
  catalog: OrganizationPermissionCatalog
): RoleDraft {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    permissions: normalizeMatrix(catalog, role.permissions),
    enabled: role.enabled,
    sort: role.sort,
    built_in: role.built_in,
  }
}

export function blankDraft(catalog: OrganizationPermissionCatalog): RoleDraft {
  return {
    key: '',
    name: '',
    description: '',
    permissions: createEmptyMatrix(catalog),
    enabled: true,
    sort: 1000,
  }
}

export function grantedCount(permissions: OrganizationPermissionMatrix): number {
  let count = 0
  for (const actions of Object.values(permissions)) {
    for (const allowed of Object.values(actions)) {
      if (allowed) count += 1
    }
  }
  return count
}
