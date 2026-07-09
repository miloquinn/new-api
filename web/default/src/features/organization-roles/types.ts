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

export type OrganizationPermissionMatrix = Record<string, Record<string, boolean>>

export interface OrganizationPermissionAction {
  action: string
  label_key: string
  description_key: string
  sensitive: boolean
}

export interface OrganizationPermissionResource {
  resource: string
  label_key: string
  actions: OrganizationPermissionAction[]
}

export interface OrganizationRoleTemplate {
  key: string
  name: string
  description: string
  permissions: OrganizationPermissionMatrix
}

export interface OrganizationPermissionCatalog {
  resources: OrganizationPermissionResource[]
  templates: OrganizationRoleTemplate[]
}

export interface Organization {
  id: number
  name: string
  owner_user_id: number
  status: number
  created_at: number
  updated_at: number
}

export interface OrganizationRole {
  id: number
  organization_id: number
  key: string
  name: string
  description: string
  permissions: OrganizationPermissionMatrix
  built_in: boolean
  enabled: boolean
  sort: number
  created_at: number
  updated_at: number
}

export interface OrganizationMemberUser {
  id: number
  username: string
  display_name: string
  email: string
  status: number
}

export interface OrganizationMember {
  id: number
  organization_id: number
  user_id: number
  role_key: string
  department_id: number
  status: number
  user?: OrganizationMemberUser
  created_at: number
  updated_at: number
}

export interface OrganizationDepartment {
  id: number
  organization_id: number
  parent_id: number
  name: string
  sort: number
  status: number
  created_at: number
  updated_at: number
}

export interface OrganizationDepartmentsResponse {
  organization: Organization
  departments: OrganizationDepartment[]
  member_counts: Record<string, number>
}

export interface OrganizationDepartmentPayload {
  id?: number
  name: string
  parent_id: number
  sort?: number
}

export interface OrganizationMemberUpdatePayload {
  id: number
  role_key: string
  department_id: number
}

export interface OrganizationMemberResetPasswordResponse {
  member: OrganizationMember
  initial_password: string
}

export interface OrganizationInvitation {
  id: number
  organization_id: number
  email: string
  role_key: string
  department_id: number
  status: number
  invited_by_user_id: number
  accepted_by_user_id: number
  expires_at: number
  accepted_at: number
  created_at: number
  updated_at: number
  token?: string
}

export interface OrganizationRolesResponse {
  organization: Organization
  roles: OrganizationRole[]
}

export interface OrganizationMembersResponse {
  organization: Organization
  members: OrganizationMember[]
}

export interface OrganizationInvitationsResponse {
  organization: Organization
  invitations: OrganizationInvitation[]
}

export interface OrganizationRolePayload {
  id?: number
  key: string
  name: string
  description: string
  permissions: OrganizationPermissionMatrix
  enabled?: boolean
  sort?: number
}

export interface OrganizationInvitationPayload {
  email?: string
  role_key: string
  department_id?: number
  expires_in_days?: number
}

export interface OrganizationMemberCreatePayload {
  username: string
  password?: string
  display_name?: string
  email?: string
  role_key: string
  department_id?: number
}

export interface OrganizationMemberCreateResponse {
  member: OrganizationMember
  initial_password?: string
}

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}
