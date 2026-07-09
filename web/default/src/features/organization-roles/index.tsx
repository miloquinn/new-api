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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'

import {
  createOrganizationInvitation,
  createOrganizationMemberAccount,
  createOrganizationRole,
  deleteOrganizationRole,
  getOrganizationInvitations,
  getOrganizationMembers,
  getOrganizationPermissionCatalog,
  getOrganizationRoles,
  revokeOrganizationInvitation,
  updateOrganizationRole,
} from './api'
import {
  blankDraft,
  normalizeMatrix,
  roleToDraft,
  type RoleDraft,
} from './permission-matrix'
import {
  OrganizationMembersSection,
  type InvitationDraft,
  type MemberAccountDraft,
} from './members-section'
import { OrganizationRoleManager } from './role-manager'
import type {
  OrganizationInvitation,
  OrganizationMember,
  OrganizationPermissionCatalog,
  OrganizationRole,
} from './types'

const organizationRolesQueryKey = ['organization-roles'] as const
const organizationMembersQueryKey = ['organization-members'] as const
const organizationInvitationsQueryKey = ['organization-invitations'] as const
const permissionCatalogQueryKey = ['organization-permission-catalog'] as const

const emptyCatalog: OrganizationPermissionCatalog = { resources: [], templates: [] }
const emptyRoles: OrganizationRole[] = []
const emptyMembers: OrganizationMember[] = []
const emptyInvitations: OrganizationInvitation[] = []

const initialInvitationDraft: InvitationDraft = {
  email: '',
  role_key: '',
  department_id: 0,
  expires_in_days: 7,
}

const initialMemberDraft: MemberAccountDraft = {
  username: '',
  password: '',
  display_name: '',
  email: '',
  role_key: '',
  department_id: 0,
}

export function OrganizationRoles() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<RoleDraft | null>(null)
  const [invitationDraft, setInvitationDraft] = useState<InvitationDraft>(
    initialInvitationDraft
  )
  const [memberDraft, setMemberDraft] =
    useState<MemberAccountDraft>(initialMemberDraft)
  const [latestInviteToken, setLatestInviteToken] = useState('')
  const [latestInitialPassword, setLatestInitialPassword] = useState('')

  const catalogQuery = useQuery({
    queryKey: permissionCatalogQueryKey,
    queryFn: getOrganizationPermissionCatalog,
    staleTime: 5 * 60 * 1000,
  })
  const catalog = catalogQuery.data ?? emptyCatalog

  const rolesQuery = useQuery({
    queryKey: organizationRolesQueryKey,
    queryFn: getOrganizationRoles,
    enabled: catalog.resources.length > 0,
  })
  const roles = rolesQuery.data?.data?.roles ?? emptyRoles
  const organizationName = rolesQuery.data?.data?.organization?.name
  const assignableRoles = useMemo(
    () => roles.filter((role) => role.enabled && role.key !== 'owner'),
    [roles]
  )

  const membersQuery = useQuery({
    queryKey: organizationMembersQueryKey,
    queryFn: getOrganizationMembers,
    enabled: roles.length > 0,
  })
  const members = membersQuery.data?.data?.members ?? emptyMembers

  const invitationsQuery = useQuery({
    queryKey: organizationInvitationsQueryKey,
    queryFn: getOrganizationInvitations,
    enabled: roles.length > 0,
  })
  const invitations = invitationsQuery.data?.data?.invitations ?? emptyInvitations

  useEffect(() => {
    if (selectedId !== null || roles.length === 0 || catalog.resources.length === 0) {
      return
    }
    setSelectedId(roles[0].id)
    setDraft(roleToDraft(roles[0], catalog))
  }, [catalog, roles, selectedId])

  useEffect(() => {
    if (assignableRoles.length === 0) return
    setInvitationDraft((current) =>
      current.role_key ? current : { ...current, role_key: assignableRoles[0].key }
    )
    setMemberDraft((current) =>
      current.role_key ? current : { ...current, role_key: assignableRoles[0].key }
    )
  }, [assignableRoles])

  const saveMutation = useMutation({
    mutationFn: async (payload: RoleDraft) => {
      const cleanPayload = {
        id: payload.id,
        key: payload.key,
        name: payload.name,
        description: payload.description,
        permissions: normalizeMatrix(catalog, payload.permissions),
        enabled: payload.enabled ?? true,
        sort: payload.sort ?? 1000,
      }
      if (payload.id) {
        return updateOrganizationRole({
          ...cleanPayload,
          id: payload.id,
        })
      }
      return createOrganizationRole(cleanPayload)
    },
    onSuccess: async (result) => {
      if (!result.success || !result.data) return
      toast.success(t('Role saved successfully'))
      await queryClient.invalidateQueries({ queryKey: organizationRolesQueryKey })
      setSelectedId(result.data.id)
      setDraft(roleToDraft(result.data, catalog))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteOrganizationRole,
    onSuccess: async (result) => {
      if (!result.success) return
      toast.success(t('Role deleted successfully'))
      await queryClient.invalidateQueries({ queryKey: organizationRolesQueryKey })
      setSelectedId(null)
      setDraft(null)
    },
  })

  const createInvitationMutation = useMutation({
    mutationFn: createOrganizationInvitation,
    onSuccess: async (result) => {
      if (!result.success || !result.data) return
      toast.success(t('Invitation created successfully'))
      setLatestInviteToken(result.data.token ?? '')
      await queryClient.invalidateQueries({
        queryKey: organizationInvitationsQueryKey,
      })
    },
  })

  const createMemberMutation = useMutation({
    mutationFn: createOrganizationMemberAccount,
    onSuccess: async (result) => {
      if (!result.success || !result.data) return
      toast.success(t('Member account created successfully'))
      setLatestInitialPassword(result.data.initial_password ?? '')
      setMemberDraft((current) => ({
        ...initialMemberDraft,
        role_key: current.role_key,
      }))
      await queryClient.invalidateQueries({ queryKey: organizationMembersQueryKey })
    },
  })

  const revokeInvitationMutation = useMutation({
    mutationFn: revokeOrganizationInvitation,
    onSuccess: async (result) => {
      if (!result.success) return
      toast.success(t('Invitation revoked successfully'))
      await queryClient.invalidateQueries({
        queryKey: organizationInvitationsQueryKey,
      })
    },
  })

  const beginCreate = () => {
    setSelectedId('new')
    setDraft(blankDraft(catalog))
  }

  const duplicateRole = () => {
    if (!draft) return
    setSelectedId('new')
    setDraft({
      ...draft,
      id: undefined,
      built_in: false,
      key: `${draft.key}_copy`,
      name: `${draft.name} Copy`,
      enabled: true,
      sort: 1000,
    })
  }

  const selectRole = (role: OrganizationRole) => {
    setSelectedId(role.id)
    setDraft(roleToDraft(role, catalog))
  }

  const updateDraft = (patch: Partial<RoleDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }

  const setPermission = (
    resource: string,
    action: string,
    checked: boolean
  ) => {
    if (!draft) return
    updateDraft({
      permissions: {
        ...draft.permissions,
        [resource]: {
          ...draft.permissions[resource],
          [action]: checked,
        },
      },
    })
  }

  const setResourcePermissions = (resource: string, checked: boolean) => {
    if (!draft) return
    const actions =
      catalog.resources.find((item) => item.resource === resource)?.actions ?? []
    const nextActions: Record<string, boolean> = {}
    for (const action of actions) {
      nextActions[action.action] = checked
    }
    updateDraft({
      permissions: {
        ...draft.permissions,
        [resource]: nextActions,
      },
    })
  }

  const saveDraft = () => {
    if (!draft) return
    if (!draft.key.trim() || !draft.name.trim()) {
      toast.error(t('Role key and name are required'))
      return
    }
    saveMutation.mutate(draft)
  }

  const deleteDraft = () => {
    if (!draft?.id || draft.built_in) return
    deleteMutation.mutate(draft.id)
  }

  const updateInvitationDraft = (patch: Partial<InvitationDraft>) => {
    setInvitationDraft((current) => ({ ...current, ...patch }))
  }

  const updateMemberDraft = (patch: Partial<MemberAccountDraft>) => {
    setMemberDraft((current) => ({ ...current, ...patch }))
  }

  const submitInvitation = () => {
    const roleKey = invitationDraft.role_key || assignableRoles[0]?.key
    if (!roleKey) {
      toast.error(t('Please create an assignable role first'))
      return
    }
    createInvitationMutation.mutate({
      email: invitationDraft.email.trim() || undefined,
      role_key: roleKey,
      department_id: invitationDraft.department_id,
      expires_in_days: invitationDraft.expires_in_days,
    })
  }

  const submitMemberAccount = () => {
    const roleKey = memberDraft.role_key || assignableRoles[0]?.key
    if (!memberDraft.username.trim()) {
      toast.error(t('Username is required'))
      return
    }
    if (!roleKey) {
      toast.error(t('Please create an assignable role first'))
      return
    }
    createMemberMutation.mutate({
      username: memberDraft.username.trim(),
      password: memberDraft.password.trim() || undefined,
      display_name: memberDraft.display_name.trim() || undefined,
      email: memberDraft.email.trim() || undefined,
      role_key: roleKey,
      department_id: memberDraft.department_id,
    })
  }

  const inviteLink =
    latestInviteToken && typeof window !== 'undefined'
      ? `${window.location.origin}/sign-up?organization_invite_token=${encodeURIComponent(latestInviteToken)}`
      : ''

  const copyText = async (value: string) => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    toast.success(t('Copied to clipboard'))
  }

  const invitationStatusLabel = (status: number) => {
    if (status === 1) return t('Pending')
    if (status === 2) return t('Accepted')
    if (status === 3) return t('Expired')
    if (status === 4) return t('Revoked')
    return t('Unknown')
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Organization Roles')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button onClick={beginCreate} disabled={catalog.resources.length === 0}>
          <Plus className='size-4' />
          {t('New role')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <OrganizationRoleManager
          catalog={catalog}
          roles={roles}
          organizationName={organizationName}
          selectedId={selectedId}
          draft={draft}
          isLoading={catalogQuery.isLoading || rolesQuery.isLoading}
          isSaving={saveMutation.isPending}
          isDeleting={deleteMutation.isPending}
          onSelectRole={selectRole}
          onUpdateDraft={updateDraft}
          onSetPermission={setPermission}
          onSetResourcePermissions={setResourcePermissions}
          onDuplicateRole={duplicateRole}
          onDeleteRole={deleteDraft}
          onSaveRole={saveDraft}
        />

        <OrganizationMembersSection
          assignableRoles={assignableRoles}
          roles={roles}
          invitationDraft={invitationDraft}
          memberDraft={memberDraft}
          inviteLink={inviteLink}
          latestInitialPassword={latestInitialPassword}
          members={members}
          invitations={invitations}
          isMembersLoading={membersQuery.isLoading}
          isInvitationsLoading={invitationsQuery.isLoading}
          isCreatingInvitation={createInvitationMutation.isPending}
          isCreatingMember={createMemberMutation.isPending}
          isRevokingInvitation={revokeInvitationMutation.isPending}
          onUpdateInvitationDraft={updateInvitationDraft}
          onUpdateMemberDraft={updateMemberDraft}
          onSubmitInvitation={submitInvitation}
          onSubmitMemberAccount={submitMemberAccount}
          onCopyText={copyText}
          onRevokeInvitation={revokeInvitationMutation.mutate}
          invitationStatusLabel={invitationStatusLabel}
        />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
