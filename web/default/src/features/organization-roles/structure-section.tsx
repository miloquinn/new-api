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

import {
  Building2,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  FolderTree,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserX,
  UserCheck,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

import {
  buildDepartmentTree,
  collectSubtreeIds,
  UNASSIGNED_DEPARTMENT_ID,
  type DepartmentTreeNode,
} from './department-tree'
import { getOrganizationRoleNameByKey } from './i18n'
import type {
  OrganizationDepartment,
  OrganizationMember,
  OrganizationRole,
} from './types'

type DepartmentNodeRowProps = {
  node: DepartmentTreeNode
  depth: number
  selectedId: number | null
  expandedIds: Set<number>
  memberCounts: Record<string, number>
  canManage: boolean
  onSelect: (id: number) => void
  onToggle: (id: number) => void
  onCreateChild: (parentId: number) => void
  onRename: (dept: OrganizationDepartment) => void
  onDelete: (dept: OrganizationDepartment) => void
}

function subtreeMemberCount(
  node: DepartmentTreeNode,
  memberCounts: Record<string, number>
): number {
  return collectSubtreeIds(node).reduce(
    (sum, id) => sum + (memberCounts[String(id)] ?? 0),
    0
  )
}

function DepartmentNodeRow(props: DepartmentNodeRowProps) {
  const { t } = useTranslation()
  const node = props.node
  const hasChildren = node.children.length > 0
  const isExpanded = props.expandedIds.has(node.id)
  const isSelected = props.selectedId === node.id
  const count = subtreeMemberCount(node, props.memberCounts)

  return (
    <>
      <div
        role='treeitem'
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-selected={isSelected}
        className={cn(
          'group/dept-row flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors',
          isSelected
            ? 'bg-primary/10 text-primary font-medium'
            : 'hover:bg-muted/60'
        )}
        style={{ paddingLeft: `${props.depth * 1.25 + 0.5}rem` }}
        onClick={() => props.onSelect(node.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            props.onSelect(node.id)
          }
        }}
        tabIndex={0}
      >
        {hasChildren ? (
          <Button
            variant='ghost'
            size='icon-xs'
            className='shrink-0'
            aria-label={isExpanded ? t('Collapse') : t('Expand')}
            onClick={(event) => {
              event.stopPropagation()
              props.onToggle(node.id)
            }}
          >
            {isExpanded ? (
              <ChevronDown className='size-3.5' />
            ) : (
              <ChevronRight className='size-3.5' />
            )}
          </Button>
        ) : (
          <span className='size-6 shrink-0' aria-hidden='true' />
        )}
        <FolderTree
          className={cn(
            'size-3.5 shrink-0',
            isSelected ? 'text-primary' : 'text-muted-foreground/60'
          )}
          aria-hidden='true'
        />
        <span className='min-w-0 flex-1 truncate'>{node.name}</span>
        <span className='text-muted-foreground/60 shrink-0 text-xs tabular-nums'>
          {count}
        </span>
        {props.canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon-xs'
                  className='shrink-0 opacity-0 group-hover/dept-row:opacity-100 aria-expanded:opacity-100'
                  aria-label={t('Department actions')}
                  onClick={(event) => event.stopPropagation()}
                />
              }
            >
              <MoreHorizontal className='size-3.5' />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem
                onClick={(event) => {
                  event.stopPropagation()
                  props.onCreateChild(node.id)
                }}
              >
                <FolderPlus className='size-3.5' /> {t('Add sub-department')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(event) => {
                  event.stopPropagation()
                  props.onRename(node)
                }}
              >
                <Pencil className='size-3.5' /> {t('Rename')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant='destructive'
                onClick={(event) => {
                  event.stopPropagation()
                  props.onDelete(node)
                }}
              >
                <Trash2 className='size-3.5' /> {t('Delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {hasChildren && isExpanded && (
        <div role='group'>
          {node.children.map((child) => (
            <DepartmentNodeRow
              key={child.id}
              {...props}
              node={child}
              depth={props.depth + 1}
            />
          ))}
        </div>
      )}
    </>
  )
}

type OrganizationStructureSectionProps = {
  organizationName: string
  departments: OrganizationDepartment[]
  members: OrganizationMember[]
  roles: OrganizationRole[]
  memberCounts: Record<string, number>
  canManageDepartments: boolean
  canManageMembers: boolean
  isLoading: boolean
  onCreateDepartment: (parentId: number) => void
  onRenameDepartment: (dept: OrganizationDepartment) => void
  onDeleteDepartment: (dept: OrganizationDepartment) => void
  onEditMember: (member: OrganizationMember) => void
  onToggleMemberStatus: (member: OrganizationMember) => void
  onResetMemberPassword: (member: OrganizationMember) => void
}

export function OrganizationStructureSection(
  props: OrganizationStructureSectionProps
) {
  const { t } = useTranslation()
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  const tree = useMemo(
    () => buildDepartmentTree(props.departments),
    [props.departments]
  )

  const selectedSubtreeIds = useMemo(() => {
    if (selectedDeptId === null) return null
    if (selectedDeptId === UNASSIGNED_DEPARTMENT_ID) {
      return new Set([UNASSIGNED_DEPARTMENT_ID])
    }
    const findNode = (
      nodes: DepartmentTreeNode[]
    ): DepartmentTreeNode | null => {
      for (const node of nodes) {
        if (node.id === selectedDeptId) return node
        const found = findNode(node.children)
        if (found) return found
      }
      return null
    }
    const node = findNode(tree)
    if (!node) return null
    return new Set(collectSubtreeIds(node))
  }, [selectedDeptId, tree])

  const visibleMembers = useMemo(() => {
    if (!selectedSubtreeIds) return props.members
    return props.members.filter((member) =>
      selectedSubtreeIds.has(member.department_id)
    )
  }, [props.members, selectedSubtreeIds])

  const departmentNameById = useMemo(() => {
    const map = new Map<number, string>()
    for (const dept of props.departments) {
      map.set(dept.id, dept.name)
    }
    return map
  }, [props.departments])

  const unassignedCount =
    props.memberCounts[String(UNASSIGNED_DEPARTMENT_ID)] ?? 0

  let memberPanelTitle = t('All members')
  if (selectedDeptId === UNASSIGNED_DEPARTMENT_ID) {
    memberPanelTitle = t('Unassigned')
  } else if (selectedDeptId !== null) {
    memberPanelTitle = departmentNameById.get(selectedDeptId) ?? t('Members')
  }

  const handleToggle = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSelect = (id: number) => {
    setSelectedDeptId((prev) => (prev === id ? null : id))
  }

  return (
    <div className='grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]'>
      {/* Department tree */}
      <Card size='sm' className='h-fit'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-sm'>
            <Building2 className='text-muted-foreground size-4' />
            {props.organizationName || t('Organization')}
          </CardTitle>
          <CardDescription>{t('Departments')}</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-0.5' role='tree'>
          <div
            role='treeitem'
            aria-selected={selectedDeptId === null}
            className={cn(
              'flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
              selectedDeptId === null
                ? 'bg-primary/10 text-primary font-medium'
                : 'hover:bg-muted/60'
            )}
            onClick={() => setSelectedDeptId(null)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setSelectedDeptId(null)
              }
            }}
            tabIndex={0}
          >
            <Building2 className='size-3.5 shrink-0' aria-hidden='true' />
            <span className='flex-1'>{t('All members')}</span>
            <span className='text-muted-foreground/60 text-xs tabular-nums'>
              {props.members.length}
            </span>
          </div>
          {tree.map((node) => (
            <DepartmentNodeRow
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedDeptId}
              expandedIds={expandedIds}
              memberCounts={props.memberCounts}
              canManage={props.canManageDepartments}
              onSelect={handleSelect}
              onToggle={handleToggle}
              onCreateChild={props.onCreateDepartment}
              onRename={props.onRenameDepartment}
              onDelete={props.onDeleteDepartment}
            />
          ))}
          {unassignedCount > 0 && (
            <div
              role='treeitem'
              aria-selected={selectedDeptId === UNASSIGNED_DEPARTMENT_ID}
              className={cn(
                'text-muted-foreground flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
                selectedDeptId === UNASSIGNED_DEPARTMENT_ID
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-muted/60'
              )}
              onClick={() => handleSelect(UNASSIGNED_DEPARTMENT_ID)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleSelect(UNASSIGNED_DEPARTMENT_ID)
                }
              }}
              tabIndex={0}
            >
              <UserX className='size-3.5 shrink-0' aria-hidden='true' />
              <span className='flex-1'>{t('Unassigned')}</span>
              <span className='text-xs tabular-nums'>{unassignedCount}</span>
            </div>
          )}
          {props.canManageDepartments && (
            <Button
              variant='outline'
              size='sm'
              className='mt-2'
              onClick={() => props.onCreateDepartment(0)}
            >
              <FolderPlus className='size-3.5' /> {t('New Department')}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Member list for the selected department subtree */}
      <Card size='sm'>
        <CardHeader>
          <CardTitle className='text-sm'>{memberPanelTitle}</CardTitle>
          <CardDescription>
            {t('{{count}} member(s)', { count: visibleMembers.length })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Member')}</TableHead>
                <TableHead>{t('Role')}</TableHead>
                <TableHead>{t('Department')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                {props.canManageMembers && (
                  <TableHead className='w-10 text-right'>
                    {t('Actions')}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleMembers.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={props.canManageMembers ? 5 : 4}
                    className='text-muted-foreground py-8 text-center text-sm'
                  >
                    {props.isLoading ? t('Loading...') : t('No members')}
                  </TableCell>
                </TableRow>
              )}
              {visibleMembers.map((member) => {
                const isDisabled = member.status !== 1
                return (
                  <TableRow
                    key={member.id}
                    className={cn(isDisabled && 'opacity-60')}
                  >
                    <TableCell>
                      <div className='flex flex-col'>
                        <span className='font-medium'>
                          {member.user?.display_name ||
                            member.user?.username ||
                            `#${member.user_id}`}
                        </span>
                        {member.user?.email && (
                          <span className='text-muted-foreground text-xs'>
                            {member.user.email}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant='outline'>
                        {getOrganizationRoleNameByKey(
                          props.roles,
                          member.role_key,
                          t
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-muted-foreground text-sm'>
                      {member.department_id === 0
                        ? t('Unassigned')
                        : (departmentNameById.get(member.department_id) ??
                          `#${member.department_id}`)}
                    </TableCell>
                    <TableCell>
                      {isDisabled ? (
                        <StatusBadge
                          variant='danger'
                          label={t('Disabled')}
                          copyable={false}
                        />
                      ) : (
                        <StatusBadge
                          variant='success'
                          label={t('Enabled')}
                          copyable={false}
                        />
                      )}
                    </TableCell>
                    {props.canManageMembers && (
                      <TableCell className='text-right'>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant='ghost'
                                size='icon-sm'
                                aria-label={t('Member actions')}
                              />
                            }
                          >
                            <MoreHorizontal className='size-4' />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align='end'>
                            <DropdownMenuItem
                              onClick={() => props.onEditMember(member)}
                            >
                              <Pencil className='size-3.5' />{' '}
                              {t('Edit role & department')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                props.onResetMemberPassword(member)
                              }
                            >
                              <KeyRound className='size-3.5' />{' '}
                              {t('Reset password')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant={isDisabled ? 'default' : 'destructive'}
                              onClick={() =>
                                props.onToggleMemberStatus(member)
                              }
                            >
                              {isDisabled ? (
                                <>
                                  <UserCheck className='size-3.5' />{' '}
                                  {t('Enable')}
                                </>
                              ) : (
                                <>
                                  <UserX className='size-3.5' />{' '}
                                  {t('Disable')}
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
