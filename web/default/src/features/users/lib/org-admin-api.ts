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
  ApiResponse,
  Organization,
  OrganizationDepartment,
  OrganizationDepartmentPayload,
  OrganizationMember,
  OrganizationMemberUpdatePayload,
  OrganizationRole,
} from '@/features/organization-roles/types'
import { api } from '@/lib/api'

export type UserOrgStructureResponse = {
  organization: Organization | null
  departments: OrganizationDepartment[]
  members: OrganizationMember[]
  member_counts: Record<string, number>
  membership: {
    organization_id: number
    organization_name?: string
    role_key: string
    department_id: number
    department_name?: string
  } | null
}

export async function getUserOrgStructure(
  userId: number
): Promise<UserOrgStructureResponse | null> {
  const res = await api.get(`/api/user/${userId}/org-structure`)
  if (!res.data?.success) return null
  return res.data.data as UserOrgStructureResponse
}

export async function getAdminOrgAssignableRoles(
  userId: number
): Promise<ApiResponse<{ organization: Organization; roles: OrganizationRole[] }>> {
  const res = await api.get(`/api/user/${userId}/org-roles`)
  return res.data
}

export async function adminUpdateOrgMember(
  userId: number,
  payload: OrganizationMemberUpdatePayload
): Promise<ApiResponse<OrganizationMember>> {
  const res = await api.put(`/api/user/${userId}/org-members`, payload)
  return res.data
}

export async function adminUpdateOrgMemberStatus(
  userId: number,
  memberId: number,
  status: number
): Promise<ApiResponse<OrganizationMember>> {
  const res = await api.post(
    `/api/user/${userId}/org-members/${memberId}/status`,
    { status }
  )
  return res.data
}

export async function adminCreateOrgDepartment(
  userId: number,
  payload: OrganizationDepartmentPayload
): Promise<ApiResponse<OrganizationDepartment>> {
  const res = await api.post(`/api/user/${userId}/org-departments`, payload)
  return res.data
}

export async function adminUpdateOrgDepartment(
  userId: number,
  payload: OrganizationDepartmentPayload & { id: number }
): Promise<ApiResponse<OrganizationDepartment>> {
  const res = await api.put(`/api/user/${userId}/org-departments`, payload)
  return res.data
}

export async function adminDeleteOrgDepartment(
  userId: number,
  deptId: number
): Promise<ApiResponse> {
  const res = await api.delete(
    `/api/user/${userId}/org-departments/${deptId}`
  )
  return res.data
}
