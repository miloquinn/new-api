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

import { api } from '@/lib/api'

import type {
  ApiResponse,
  OrganizationPermissionCatalog,
  OrganizationDepartment,
  OrganizationDepartmentPayload,
  OrganizationDepartmentsResponse,
  OrganizationInvitation,
  OrganizationInvitationPayload,
  OrganizationInvitationsResponse,
  OrganizationMember,
  OrganizationMemberCreatePayload,
  OrganizationMemberCreateResponse,
  OrganizationMemberResetPasswordResponse,
  OrganizationMembersResponse,
  OrganizationMemberUpdatePayload,
  OrganizationRole,
  OrganizationRolePayload,
  OrganizationRolesResponse,
} from './types'

export async function getOrganizationPermissionCatalog(): Promise<OrganizationPermissionCatalog> {
  const res = await api.get('/api/org/permission/catalog')
  return {
    resources: res.data?.data?.resources ?? [],
    templates: res.data?.data?.templates ?? [],
  }
}

export async function getOrganizationRoles(): Promise<ApiResponse<OrganizationRolesResponse>> {
  const res = await api.get('/api/org/roles')
  return res.data
}

export async function createOrganizationRole(
  payload: OrganizationRolePayload
): Promise<ApiResponse<OrganizationRole>> {
  const res = await api.post('/api/org/roles', payload)
  return res.data
}

export async function updateOrganizationRole(
  payload: OrganizationRolePayload & { id: number }
): Promise<ApiResponse<OrganizationRole>> {
  const res = await api.put('/api/org/roles', payload)
  return res.data
}

export async function deleteOrganizationRole(id: number): Promise<ApiResponse> {
  const res = await api.delete(`/api/org/roles/${id}`)
  return res.data
}

export async function getOrganizationMembers(): Promise<ApiResponse<OrganizationMembersResponse>> {
  const res = await api.get('/api/org/members')
  return res.data
}

export async function createOrganizationMemberAccount(
  payload: OrganizationMemberCreatePayload
): Promise<ApiResponse<OrganizationMemberCreateResponse>> {
  const res = await api.post('/api/org/members', payload)
  return res.data
}

export async function getOrganizationInvitations(): Promise<ApiResponse<OrganizationInvitationsResponse>> {
  const res = await api.get('/api/org/invitations')
  return res.data
}

export async function createOrganizationInvitation(
  payload: OrganizationInvitationPayload
): Promise<ApiResponse<OrganizationInvitation>> {
  const res = await api.post('/api/org/invitations', payload)
  return res.data
}

export async function revokeOrganizationInvitation(id: number): Promise<ApiResponse> {
  const res = await api.delete(`/api/org/invitations/${id}`)
  return res.data
}

export async function getOrganizationDepartments(): Promise<ApiResponse<OrganizationDepartmentsResponse>> {
  const res = await api.get('/api/org/departments')
  return res.data
}

export async function createOrganizationDepartment(
  payload: OrganizationDepartmentPayload
): Promise<ApiResponse<OrganizationDepartment>> {
  const res = await api.post('/api/org/departments', payload)
  return res.data
}

export async function updateOrganizationDepartment(
  payload: OrganizationDepartmentPayload & { id: number }
): Promise<ApiResponse<OrganizationDepartment>> {
  const res = await api.put('/api/org/departments', payload)
  return res.data
}

export async function deleteOrganizationDepartment(id: number): Promise<ApiResponse> {
  const res = await api.delete(`/api/org/departments/${id}`)
  return res.data
}

export async function updateOrganizationMemberAssignment(
  payload: OrganizationMemberUpdatePayload
): Promise<ApiResponse<OrganizationMember>> {
  const res = await api.put('/api/org/members', payload)
  return res.data
}

export async function updateOrganizationMemberStatus(
  id: number,
  status: number
): Promise<ApiResponse<OrganizationMember>> {
  const res = await api.post(`/api/org/members/${id}/status`, { status })
  return res.data
}

export async function resetOrganizationMemberPassword(
  id: number
): Promise<ApiResponse<OrganizationMemberResetPasswordResponse>> {
  const res = await api.post(`/api/org/members/${id}/reset_password`)
  return res.data
}

export type OrganizationUsageItem = {
  user_id?: number
  username?: string
  model_name: string
  created_at: number
  count: number
  quota: number
  token_used: number
}

export type OrganizationUsageResponse = {
  scope: 'organization' | 'department' | 'own'
  items: OrganizationUsageItem[]
}

export async function getOrganizationUsage(params: {
  start_timestamp: number
  end_timestamp: number
  by_member?: boolean
}): Promise<ApiResponse<OrganizationUsageResponse>> {
  const res = await api.get('/api/org/usage', {
    params: {
      start_timestamp: params.start_timestamp,
      end_timestamp: params.end_timestamp,
      by_member: params.by_member ? 'true' : undefined,
    },
  })
  return res.data
}
