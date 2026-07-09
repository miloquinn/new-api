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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  createOrganizationDepartment,
  deleteOrganizationDepartment,
  getOrganizationDepartments,
  resetOrganizationMemberPassword,
  updateOrganizationDepartment,
  updateOrganizationMemberAssignment,
  updateOrganizationMemberStatus,
} from './api'
import {
  buildDepartmentTree,
  type DepartmentTreeNode,
} from './department-tree'
import { getOrganizationRoleName } from './i18n'
import { OrganizationStructureSection } from './structure-section'
import type {
  OrganizationDepartment,
  OrganizationMember,
  OrganizationRole,
} from './types'

const organizationDepartmentsQueryKey = ['organization-departments'] as const

type DepartmentDialogState =
  | { mode: 'create'; parentId: number; name: string }
  | { mode: 'rename'; department: OrganizationDepartment; name: string }
  | null

type MemberEditState = {
  member: OrganizationMember
  roleKey: string
  departmentId: number
} | null

type FlatDepartmentOption = {
  id: number
  label: string
  depth: number
}

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

type OrganizationStructureTabProps = {
  organizationName: string
  members: OrganizationMember[]
  roles: OrganizationRole[]
  assignableRoles: OrganizationRole[]
  isMembersLoading: boolean
  membersQueryKey: readonly string[]
}

export function OrganizationStructureTab(props: OrganizationStructureTabProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [departmentDialog, setDepartmentDialog] =
    useState<DepartmentDialogState>(null)
  const [deletingDepartment, setDeletingDepartment] =
    useState<OrganizationDepartment | null>(null)
  const [memberEdit, setMemberEdit] = useState<MemberEditState>(null)
  const [togglingMember, setTogglingMember] =
    useState<OrganizationMember | null>(null)
  const [resettingMember, setResettingMember] =
    useState<OrganizationMember | null>(null)
  const [resetPasswordResult, setResetPasswordResult] = useState('')

  const departmentsQuery = useQuery({
    queryKey: organizationDepartmentsQueryKey,
    queryFn: getOrganizationDepartments,
  })
  const departments = useMemo(
    () => departmentsQuery.data?.data?.departments ?? [],
    [departmentsQuery.data]
  )
  const memberCounts = departmentsQuery.data?.data?.member_counts ?? {}

  const departmentOptions = useMemo(
    () => flattenDepartmentOptions(buildDepartmentTree(departments)),
    [departments]
  )

  const invalidateStructure = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: organizationDepartmentsQueryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: props.membersQueryKey,
      }),
    ])
  }

  const saveDepartmentMutation = useMutation({
    mutationFn: async (state: NonNullable<DepartmentDialogState>) => {
      if (state.mode === 'create') {
        return createOrganizationDepartment({
          name: state.name.trim(),
          parent_id: state.parentId,
        })
      }
      return updateOrganizationDepartment({
        id: state.department.id,
        name: state.name.trim(),
        parent_id: state.department.parent_id,
        sort: state.department.sort,
      })
    },
    onSuccess: async (result) => {
      if (!result.success) {
        toast.error(result.message || t('Operation failed'))
        return
      }
      toast.success(t('Department saved successfully'))
      setDepartmentDialog(null)
      await invalidateStructure()
    },
  })

  const deleteDepartmentMutation = useMutation({
    mutationFn: deleteOrganizationDepartment,
    onSuccess: async (result) => {
      if (!result.success) {
        toast.error(result.message || t('Operation failed'))
        return
      }
      toast.success(t('Department deleted successfully'))
      setDeletingDepartment(null)
      await invalidateStructure()
    },
  })

  const updateMemberMutation = useMutation({
    mutationFn: updateOrganizationMemberAssignment,
    onSuccess: async (result) => {
      if (!result.success) {
        toast.error(result.message || t('Operation failed'))
        return
      }
      toast.success(t('Member updated successfully'))
      setMemberEdit(null)
      await invalidateStructure()
    },
  })

  const memberStatusMutation = useMutation({
    mutationFn: async (member: OrganizationMember) =>
      updateOrganizationMemberStatus(member.id, member.status === 1 ? 2 : 1),
    onSuccess: async (result) => {
      if (!result.success) {
        toast.error(result.message || t('Operation failed'))
        return
      }
      toast.success(t('Member updated successfully'))
      setTogglingMember(null)
      await invalidateStructure()
    },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: async (member: OrganizationMember) =>
      resetOrganizationMemberPassword(member.id),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.message || t('Operation failed'))
        return
      }
      setResettingMember(null)
      setResetPasswordResult(result.data?.initial_password ?? '')
    },
  })

  const submitDepartmentDialog = () => {
    if (!departmentDialog) return
    if (!departmentDialog.name.trim()) {
      toast.error(t('Department name is required'))
      return
    }
    saveDepartmentMutation.mutate(departmentDialog)
  }

  const copyText = async (value: string) => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    toast.success(t('Copied to clipboard'))
  }

  return (
    <>
      <OrganizationStructureSection
        organizationName={props.organizationName}
        departments={departments}
        members={props.members}
        roles={props.roles}
        memberCounts={memberCounts}
        canManageDepartments
        canManageMembers
        isLoading={props.isMembersLoading || departmentsQuery.isLoading}
        onCreateDepartment={(parentId) =>
          setDepartmentDialog({ mode: 'create', parentId, name: '' })
        }
        onRenameDepartment={(department) =>
          setDepartmentDialog({
            mode: 'rename',
            department,
            name: department.name,
          })
        }
        onDeleteDepartment={setDeletingDepartment}
        onEditMember={(member) =>
          setMemberEdit({
            member,
            roleKey: member.role_key,
            departmentId: member.department_id,
          })
        }
        onToggleMemberStatus={setTogglingMember}
        onResetMemberPassword={setResettingMember}
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
            <Label htmlFor='department-name'>{t('Department name')}</Label>
            <Input
              id='department-name'
              value={departmentDialog?.name ?? ''}
              autoFocus
              onChange={(event) =>
                setDepartmentDialog((current) =>
                  current ? { ...current, name: event.target.value } : current
                )
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submitDepartmentDialog()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDepartmentDialog(null)}>
              {t('Cancel')}
            </Button>
            <Button
              onClick={submitDepartmentDialog}
              disabled={saveDepartmentMutation.isPending}
            >
              {t('Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete department */}
      <ConfirmDialog
        open={deletingDepartment !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingDepartment(null)
        }}
        title={t('Delete department')}
        desc={t(
          'Delete department "{{name}}"? Departments with sub-departments or members cannot be deleted.',
          { name: deletingDepartment?.name ?? '' }
        )}
        destructive
        isLoading={deleteDepartmentMutation.isPending}
        handleConfirm={() => {
          if (deletingDepartment) {
            deleteDepartmentMutation.mutate(deletingDepartment.id)
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
                items={props.assignableRoles.map((role) => ({
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
                    {props.assignableRoles.map((role) => (
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
                        <span
                          style={{
                            paddingLeft: `${option.depth * 0.75}rem`,
                          }}
                        >
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
              onClick={() => {
                if (!memberEdit) return
                updateMemberMutation.mutate({
                  id: memberEdit.member.id,
                  role_key: memberEdit.roleKey,
                  department_id: memberEdit.departmentId,
                })
              }}
              disabled={updateMemberMutation.isPending}
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
          togglingMember?.status === 1 ? t('Disable member') : t('Enable member')
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
        isLoading={memberStatusMutation.isPending}
        handleConfirm={() => {
          if (togglingMember) {
            memberStatusMutation.mutate(togglingMember)
          }
        }}
      />

      {/* Reset member password */}
      <ConfirmDialog
        open={resettingMember !== null}
        onOpenChange={(open) => {
          if (!open) setResettingMember(null)
        }}
        title={t('Reset password')}
        desc={t(
          'Reset the password for "{{name}}"? A new random password will be generated.',
          {
            name:
              resettingMember?.user?.display_name ||
              resettingMember?.user?.username ||
              '',
          }
        )}
        destructive
        isLoading={resetPasswordMutation.isPending}
        handleConfirm={() => {
          if (resettingMember) {
            resetPasswordMutation.mutate(resettingMember)
          }
        }}
      />

      {/* Show the freshly generated password exactly once */}
      <Dialog
        open={resetPasswordResult !== ''}
        onOpenChange={(open) => {
          if (!open) setResetPasswordResult('')
        }}
      >
        <DialogContent className='sm:max-w-sm'>
          <DialogHeader>
            <DialogTitle>{t('New password generated')}</DialogTitle>
          </DialogHeader>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Copy this password now — it will not be shown again after closing.'
            )}
          </p>
          <div className='flex items-center gap-2'>
            <Input readOnly value={resetPasswordResult} className='font-mono' />
            <Button
              variant='outline'
              onClick={() => void copyText(resetPasswordResult)}
            >
              {t('Copy')}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setResetPasswordResult('')}>
              {t('Done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
