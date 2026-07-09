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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  buildDepartmentTree,
  type DepartmentTreeNode,
} from '@/features/organization-roles/department-tree'
import { getOrganizationRoleName } from '@/features/organization-roles/i18n'
import { OrganizationStructureSection } from '@/features/organization-roles/structure-section'
import type { OrganizationMember } from '@/features/organization-roles/types'

import {
  adminCreateOrgDepartment,
  adminDeleteOrgDepartment,
  adminUpdateOrgDepartment,
  adminUpdateOrgMember,
  adminUpdateOrgMemberStatus,
  getAdminOrgAssignableRoles,
  getUserOrgStructure,
} from '../lib/org-admin-api'

type MemberEditState = {
  member: OrganizationMember
  roleKey: string
  departmentId: number
} | null

type DepartmentDialogState =
  | { mode: 'create'; parentId: number; name: string }
  | { mode: 'rename'; departmentId: number; parentId: number; sort: number; name: string }
  | null

type FlatDepartmentOption = { id: number; label: string; depth: number }

function flattenDepartmentOptions(
  nodes: DepartmentTreeNode[],
  depth = 0
): FlatDepartmentOption[] {
  const options: FlatDepartmentOption[] = []
  for (const node of nodes) {
    options.push({ id: node.id, label: node.name, depth })
    options.push(...flattenDepartmentOptions(node.children, depth + 1))
  }
  return options
}

export function UserOrgStructurePanel(props: { userId: number }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const structureQueryKey = ['user-org-structure', props.userId] as const

  const [memberEdit, setMemberEdit] = useState<MemberEditState>(null)
  const [togglingMember, setTogglingMember] =
    useState<OrganizationMember | null>(null)
  const [departmentDialog, setDepartmentDialog] =
    useState<DepartmentDialogState>(null)
  const [deletingDepartmentId, setDeletingDepartmentId] = useState<
    number | null
  >(null)

  const structureQuery = useQuery({
    queryKey: structureQueryKey,
    queryFn: () => getUserOrgStructure(props.userId),
    staleTime: 30 * 1000,
  })
  const structure = structureQuery.data

  const rolesQuery = useQuery({
    queryKey: ['admin-org-roles', props.userId],
    queryFn: () => getAdminOrgAssignableRoles(props.userId),
    enabled: Boolean(structure?.organization),
    staleTime: 60 * 1000,
  })
  const roles = useMemo(
    () => rolesQuery.data?.data?.roles ?? [],
    [rolesQuery.data]
  )
  const assignableRoles = useMemo(
    () => roles.filter((role) => role.enabled && role.key !== 'owner'),
    [roles]
  )

  const departments = useMemo(
    () => structure?.departments ?? [],
    [structure?.departments]
  )
  const departmentOptions = useMemo(
    () => flattenDepartmentOptions(buildDepartmentTree(departments)),
    [departments]
  )

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: structureQueryKey })
  }

  const memberMutation = useMutation({
    mutationFn: (payload: {
      id: number
      role_key: string
      department_id: number
    }) => adminUpdateOrgMember(props.userId, payload),
    onSuccess: async (result) => {
      if (!result.success) {
        toast.error(result.message || t('Operation failed'))
        return
      }
      toast.success(t('Member updated successfully'))
      setMemberEdit(null)
      await invalidate()
    },
  })

  const statusMutation = useMutation({
    mutationFn: (member: OrganizationMember) =>
      adminUpdateOrgMemberStatus(
        props.userId,
        member.id,
        member.status === 1 ? 2 : 1
      ),
    onSuccess: async (result) => {
      if (!result.success) {
        toast.error(result.message || t('Operation failed'))
        return
      }
      toast.success(t('Member updated successfully'))
      setTogglingMember(null)
      await invalidate()
    },
  })

  const departmentSaveMutation = useMutation({
    mutationFn: (state: NonNullable<DepartmentDialogState>) => {
      if (state.mode === 'create') {
        return adminCreateOrgDepartment(props.userId, {
          name: state.name.trim(),
          parent_id: state.parentId,
        })
      }
      return adminUpdateOrgDepartment(props.userId, {
        id: state.departmentId,
        name: state.name.trim(),
        parent_id: state.parentId,
        sort: state.sort,
      })
    },
    onSuccess: async (result) => {
      if (!result.success) {
        toast.error(result.message || t('Operation failed'))
        return
      }
      toast.success(t('Department saved successfully'))
      setDepartmentDialog(null)
      await invalidate()
    },
  })

  const departmentDeleteMutation = useMutation({
    mutationFn: (deptId: number) =>
      adminDeleteOrgDepartment(props.userId, deptId),
    onSuccess: async (result) => {
      if (!result.success) {
        toast.error(result.message || t('Operation failed'))
        return
      }
      toast.success(t('Department deleted successfully'))
      setDeletingDepartmentId(null)
      await invalidate()
    },
  })

  if (structureQuery.isLoading) {
    return (
      <div className='flex flex-col gap-2 p-4'>
        <Skeleton className='h-4 w-48' />
        <Skeleton className='h-4 w-64' />
        <Skeleton className='h-4 w-56' />
      </div>
    )
  }

  if (!structure || (!structure.organization && !structure.membership)) {
    return (
      <div className='text-muted-foreground p-4 text-sm'>
        {t('This user does not belong to any organization.')}
      </div>
    )
  }

  // A user with a membership but no owned organization can only be shown as a
  // read-only affiliation line — the editable tree needs an owned org.
  if (!structure.organization) {
    return (
      <div className='text-muted-foreground p-4 text-sm'>
        {t('Member of')}{' '}
        <span className='text-foreground font-medium'>
          {structure.membership?.organization_name ??
            `#${structure.membership?.organization_id}`}
        </span>
      </div>
    )
  }

  const deletingDepartment = departments.find(
    (dept) => dept.id === deletingDepartmentId
  )

  return (
    <div className='p-4'>
      <OrganizationStructureSection
        organizationName={structure.organization.name}
        departments={departments}
        members={structure.members}
        roles={roles}
        memberCounts={structure.member_counts}
        canManageDepartments
        canManageMembers
        isLoading={structureQuery.isFetching}
        onCreateDepartment={(parentId) =>
          setDepartmentDialog({ mode: 'create', parentId, name: '' })
        }
        onRenameDepartment={(department) =>
          setDepartmentDialog({
            mode: 'rename',
            departmentId: department.id,
            parentId: department.parent_id,
            sort: department.sort,
            name: department.name,
          })
        }
        onDeleteDepartment={(department) =>
          setDeletingDepartmentId(department.id)
        }
        onEditMember={(member) =>
          setMemberEdit({
            member,
            roleKey: member.role_key,
            departmentId: member.department_id,
          })
        }
        onToggleMemberStatus={setTogglingMember}
        onResetMemberPassword={() =>
          toast.info(
            t('Reset the password from the user row actions menu instead.')
          )
        }
      />

      {/* Create / rename department */}
      <Dialog
        open={departmentDialog !== null}
        onOpenChange={(open) => {
          if (!open) setDepartmentDialog(null)
        }}
      >
        <DialogContent className='sm:max-w-sm'>
          <DialogHeader>
            <DialogTitle>
              {departmentDialog?.mode === 'rename'
                ? t('Rename department')
                : t('New Department')}
            </DialogTitle>
          </DialogHeader>
          <div className='flex flex-col gap-2'>
            <Label>{t('Department name')}</Label>
            <Input
              value={departmentDialog?.name ?? ''}
              autoFocus
              onChange={(event) =>
                setDepartmentDialog((current) =>
                  current ? { ...current, name: event.target.value } : current
                )
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter' && departmentDialog) {
                  event.preventDefault()
                  if (!departmentDialog.name.trim()) {
                    toast.error(t('Department name is required'))
                    return
                  }
                  departmentSaveMutation.mutate(departmentDialog)
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDepartmentDialog(null)}>
              {t('Cancel')}
            </Button>
            <Button
              disabled={departmentSaveMutation.isPending}
              onClick={() => {
                if (!departmentDialog) return
                if (!departmentDialog.name.trim()) {
                  toast.error(t('Department name is required'))
                  return
                }
                departmentSaveMutation.mutate(departmentDialog)
              }}
            >
              {t('Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete department */}
      <ConfirmDialog
        open={deletingDepartmentId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingDepartmentId(null)
        }}
        title={t('Delete department')}
        desc={t(
          'Delete department "{{name}}"? Departments with sub-departments or members cannot be deleted.',
          { name: deletingDepartment?.name ?? '' }
        )}
        destructive
        isLoading={departmentDeleteMutation.isPending}
        handleConfirm={() => {
          if (deletingDepartmentId !== null) {
            departmentDeleteMutation.mutate(deletingDepartmentId)
          }
        }}
      />

      {/* Edit member role & department */}
      <Dialog
        open={memberEdit !== null}
        onOpenChange={(open) => {
          if (!open) setMemberEdit(null)
        }}
      >
        <DialogContent className='sm:max-w-sm'>
          <DialogHeader>
            <DialogTitle>{t('Edit role & department')}</DialogTitle>
          </DialogHeader>
          <div className='flex flex-col gap-4'>
            <div className='flex flex-col gap-2'>
              <Label>{t('Role')}</Label>
              <Select
                items={assignableRoles.map((role) => ({
                  value: role.key,
                  label: getOrganizationRoleName(role, t),
                }))}
                value={memberEdit?.roleKey ?? ''}
                onValueChange={(value) =>
                  setMemberEdit((current) =>
                    current && typeof value === 'string'
                      ? { ...current, roleKey: value }
                      : current
                  )
                }
                disabled={memberEdit?.member.role_key === 'owner'}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {memberEdit?.member.role_key === 'owner' && (
                      <SelectItem value='owner'>
                        {t('Organization Owner')}
                      </SelectItem>
                    )}
                    {assignableRoles.map((role) => (
                      <SelectItem key={role.key} value={role.key}>
                        {getOrganizationRoleName(role, t)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className='flex flex-col gap-2'>
              <Label>{t('Department')}</Label>
              <Select
                items={[
                  { value: '0', label: t('Unassigned') },
                  ...departmentOptions.map((option) => ({
                    value: String(option.id),
                    label: option.label,
                  })),
                ]}
                value={String(memberEdit?.departmentId ?? 0)}
                onValueChange={(value) =>
                  setMemberEdit((current) =>
                    current && typeof value === 'string'
                      ? { ...current, departmentId: Number(value) }
                      : current
                  )
                }
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    <SelectItem value='0'>{t('Unassigned')}</SelectItem>
                    {departmentOptions.map((option) => (
                      <SelectItem key={option.id} value={String(option.id)}>
                        <span style={{ paddingLeft: `${option.depth * 0.75}rem` }}>
                          {option.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setMemberEdit(null)}>
              {t('Cancel')}
            </Button>
            <Button
              disabled={memberMutation.isPending}
              onClick={() => {
                if (!memberEdit) return
                memberMutation.mutate({
                  id: memberEdit.member.id,
                  role_key: memberEdit.roleKey,
                  department_id: memberEdit.departmentId,
                })
              }}
            >
              {t('Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enable / disable member */}
      <ConfirmDialog
        open={togglingMember !== null}
        onOpenChange={(open) => {
          if (!open) setTogglingMember(null)
        }}
        title={
          togglingMember?.status === 1
            ? t('Disable member')
            : t('Enable member')
        }
        desc={
          togglingMember?.status === 1
            ? t(
                'Disable "{{name}}"? They will lose access to this organization.',
                {
                  name:
                    togglingMember?.user?.display_name ||
                    togglingMember?.user?.username ||
                    '',
                }
              )
            : t('Enable "{{name}}" and restore their organization access?', {
                name:
                  togglingMember?.user?.display_name ||
                  togglingMember?.user?.username ||
                  '',
              })
        }
        destructive={togglingMember?.status === 1}
        isLoading={statusMutation.isPending}
        handleConfirm={() => {
          if (togglingMember) {
            statusMutation.mutate(togglingMember)
          }
        }}
      />
    </div>
  )
}
