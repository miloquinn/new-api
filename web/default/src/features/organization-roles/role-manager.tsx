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

import { Copy, Save, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import { getOrganizationRoleName } from './i18n'
import { grantedCount, type RoleDraft } from './permission-matrix'
import type {
  OrganizationPermissionCatalog,
  OrganizationRole,
} from './types'

type OrganizationRoleManagerProps = {
  catalog: OrganizationPermissionCatalog
  roles: OrganizationRole[]
  organizationName?: string
  selectedId: number | 'new' | null
  draft: RoleDraft | null
  isLoading: boolean
  isSaving: boolean
  isDeleting: boolean
  onSelectRole: (role: OrganizationRole) => void
  onUpdateDraft: (patch: Partial<RoleDraft>) => void
  onSetPermission: (resource: string, action: string, checked: boolean) => void
  onSetResourcePermissions: (resource: string, checked: boolean) => void
  onDuplicateRole: () => void
  onDeleteRole: () => void
  onSaveRole: () => void
}

export function OrganizationRoleManager({
  catalog,
  roles,
  organizationName,
  selectedId,
  draft,
  isLoading,
  isSaving,
  isDeleting,
  onSelectRole,
  onUpdateDraft,
  onSetPermission,
  onSetResourcePermissions,
  onDuplicateRole,
  onDeleteRole,
  onSaveRole,
}: OrganizationRoleManagerProps) {
  const { t } = useTranslation()
  const selectedGrantedCount = draft ? grantedCount(draft.permissions) : 0

  return (
    <div className='grid min-h-full gap-4 lg:grid-cols-[340px_minmax(0,1fr)]'>
      <Card className='min-h-0'>
        <CardHeader>
          <CardTitle>{organizationName || t('Current organization')}</CardTitle>
          <CardDescription>
            {t('Create reusable identities and assign module permissions.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='max-h-[calc(100vh-260px)] overflow-auto'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Role')}</TableHead>
                  <TableHead className='w-20 text-right'>{t('Grants')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={2}>{t('Loading...')}</TableCell>
                  </TableRow>
                ) : null}
                {roles.map((role) => (
                  <TableRow
                    key={role.id}
                    className={cn(
                      'cursor-pointer',
                      selectedId === role.id && 'bg-muted/60'
                    )}
                    onClick={() => onSelectRole(role)}
                  >
                    <TableCell className='whitespace-normal'>
                      <div className='flex min-w-0 flex-col gap-1'>
                        <div className='flex items-center gap-2'>
                          <span className='font-medium'>
                            {getOrganizationRoleName(role, t)}
                          </span>
                          {role.built_in ? (
                            <Badge variant='outline'>{t('Built-in')}</Badge>
                          ) : null}
                        </div>
                        <span className='text-muted-foreground font-mono text-xs'>
                          {role.key}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className='text-right'>
                      {grantedCount(role.permissions)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className='min-h-0'>
        <CardHeader>
          <CardTitle>{draft?.id ? t('Edit role') : t('Create role')}</CardTitle>
          <CardDescription>
            {t('Choose exactly what this identity can use and view.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {draft ? (
            <div className='flex flex-col gap-5'>
              <div className='grid gap-3 md:grid-cols-[220px_1fr_120px]'>
                <div className='space-y-1.5'>
                  <label className='text-sm font-medium' htmlFor='role-key'>
                    {t('Role key')}
                  </label>
                  <Input
                    id='role-key'
                    value={draft.key}
                    disabled={draft.built_in}
                    onChange={(event) => onUpdateDraft({ key: event.target.value })}
                    placeholder='finance_readonly'
                  />
                </div>
                <div className='space-y-1.5'>
                  <label className='text-sm font-medium' htmlFor='role-name'>
                    {t('Role name')}
                  </label>
                  <Input
                    id='role-name'
                    value={draft.name}
                    onChange={(event) =>
                      onUpdateDraft({ name: event.target.value })
                    }
                    placeholder={t('Finance')}
                  />
                </div>
                <div className='flex items-end justify-between gap-3 rounded-lg border px-3 py-2'>
                  <span className='text-sm font-medium'>{t('Enabled')}</span>
                  <Switch
                    checked={draft.enabled ?? true}
                    onCheckedChange={(checked) =>
                      onUpdateDraft({ enabled: Boolean(checked) })
                    }
                  />
                </div>
              </div>

              <div className='space-y-1.5'>
                <label className='text-sm font-medium' htmlFor='role-description'>
                  {t('Description')}
                </label>
                <Textarea
                  id='role-description'
                  value={draft.description}
                  onChange={(event) =>
                    onUpdateDraft({ description: event.target.value })
                  }
                  placeholder={t('Describe when this identity should be used.')}
                />
              </div>

              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='text-muted-foreground text-sm'>
                  {t('{{count}} permissions selected', {
                    count: selectedGrantedCount,
                  })}
                </div>
                <div className='flex flex-wrap gap-2'>
                  <Button variant='outline' onClick={onDuplicateRole}>
                    <Copy className='size-4' />
                    {t('Duplicate')}
                  </Button>
                  <Button
                    variant='outline'
                    onClick={onDeleteRole}
                    disabled={!draft.id || draft.built_in || isDeleting}
                  >
                    <Trash2 className='size-4' />
                    {t('Delete')}
                  </Button>
                  <Button onClick={onSaveRole} disabled={isSaving}>
                    <Save className='size-4' />
                    {t('Save')}
                  </Button>
                </div>
              </div>

              <div className='grid gap-3 xl:grid-cols-2'>
                {catalog.resources.map((resource) => {
                  const actions = resource.actions
                  const selected = actions.filter(
                    (action) => draft.permissions[resource.resource]?.[action.action]
                  )
                  const allSelected =
                    actions.length > 0 && selected.length === actions.length
                  return (
                    <div key={resource.resource} className='rounded-lg border p-3'>
                      <div className='mb-3 flex items-start justify-between gap-3'>
                        <div>
                          <div className='font-medium'>{t(resource.label_key)}</div>
                          <div className='text-muted-foreground text-xs'>
                            {selected.length}/{actions.length}
                          </div>
                        </div>
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(checked) =>
                            onSetResourcePermissions(
                              resource.resource,
                              Boolean(checked)
                            )
                          }
                        />
                      </div>
                      <div className='grid gap-2'>
                        {actions.map((action) => (
                          <label
                            key={action.action}
                            className='hover:bg-muted/50 flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5'
                          >
                            <Checkbox
                              checked={
                                draft.permissions[resource.resource]?.[
                                  action.action
                                ] ?? false
                              }
                              onCheckedChange={(checked) =>
                                onSetPermission(
                                  resource.resource,
                                  action.action,
                                  Boolean(checked)
                                )
                              }
                            />
                            <span className='min-w-0 flex-1'>
                              <span className='flex items-center gap-2 text-sm font-medium'>
                                {t(action.label_key)}
                                {action.sensitive ? (
                                  <Badge variant='destructive'>
                                    {t('Sensitive')}
                                  </Badge>
                                ) : null}
                              </span>
                              <span className='text-muted-foreground block text-xs leading-5'>
                                {t(action.description_key)}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className='text-muted-foreground flex min-h-56 items-center justify-center text-sm'>
              {t('Select a role or create a new one.')}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
