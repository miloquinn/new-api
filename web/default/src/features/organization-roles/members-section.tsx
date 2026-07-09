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

import { Copy, MailPlus, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  getOrganizationRoleName,
  getOrganizationRoleNameByKey,
} from './i18n'
import type {
  OrganizationInvitation,
  OrganizationMember,
  OrganizationRole,
} from './types'

export type InvitationDraft = {
  email: string
  role_key: string
  department_id: number
  expires_in_days: number
}

export type MemberAccountDraft = {
  username: string
  password: string
  display_name: string
  email: string
  role_key: string
  department_id: number
}

type OrganizationMembersSectionProps = {
  assignableRoles: OrganizationRole[]
  roles: OrganizationRole[]
  invitationDraft: InvitationDraft
  memberDraft: MemberAccountDraft
  inviteLink: string
  latestInitialPassword: string
  members: OrganizationMember[]
  invitations: OrganizationInvitation[]
  isMembersLoading: boolean
  isInvitationsLoading: boolean
  isCreatingInvitation: boolean
  isCreatingMember: boolean
  isRevokingInvitation: boolean
  onUpdateInvitationDraft: (patch: Partial<InvitationDraft>) => void
  onUpdateMemberDraft: (patch: Partial<MemberAccountDraft>) => void
  onSubmitInvitation: () => void
  onSubmitMemberAccount: () => void
  onCopyText: (value: string) => void
  onRevokeInvitation: (id: number) => void
  invitationStatusLabel: (status: number) => string
}

export function OrganizationMembersSection({
  assignableRoles,
  roles,
  invitationDraft,
  memberDraft,
  inviteLink,
  latestInitialPassword,
  members,
  invitations,
  isMembersLoading,
  isInvitationsLoading,
  isCreatingInvitation,
  isCreatingMember,
  isRevokingInvitation,
  onUpdateInvitationDraft,
  onUpdateMemberDraft,
  onSubmitInvitation,
  onSubmitMemberAccount,
  onCopyText,
  onRevokeInvitation,
  invitationStatusLabel,
}: OrganizationMembersSectionProps) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Organization Members')}</CardTitle>
        <CardDescription>
          {t('Invite employees or create member accounts for this organization.')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className='grid gap-4 xl:grid-cols-2'>
          <div className='rounded-lg border p-3'>
            <div className='mb-3 flex items-center gap-2 font-medium'>
              <MailPlus className='size-4' />
              {t('Invite by link')}
            </div>
            <div className='grid gap-3 md:grid-cols-2'>
              <Input
                value={invitationDraft.email}
                onChange={(event) =>
                  onUpdateInvitationDraft({ email: event.target.value })
                }
                placeholder={t('Employee email optional')}
                type='email'
              />
              <select
                className='border-input bg-background h-9 rounded-md border px-3 text-sm'
                value={invitationDraft.role_key}
                onChange={(event) =>
                  onUpdateInvitationDraft({ role_key: event.target.value })
                }
              >
                {assignableRoles.map((role) => (
                  <option key={role.key} value={role.key}>
                    {getOrganizationRoleName(role, t)}
                  </option>
                ))}
              </select>
              <Input
                value={invitationDraft.department_id}
                onChange={(event) =>
                  onUpdateInvitationDraft({
                    department_id: Number(event.target.value) || 0,
                  })
                }
                placeholder={t('Department ID')}
                type='number'
              />
              <Input
                value={invitationDraft.expires_in_days}
                onChange={(event) =>
                  onUpdateInvitationDraft({
                    expires_in_days: Number(event.target.value) || 7,
                  })
                }
                placeholder={t('Expires in days')}
                type='number'
              />
            </div>
            <div className='mt-3 flex flex-wrap gap-2'>
              <Button onClick={onSubmitInvitation} disabled={isCreatingInvitation}>
                <MailPlus className='size-4' />
                {t('Create invitation')}
              </Button>
              {inviteLink ? (
                <Button variant='outline' onClick={() => onCopyText(inviteLink)}>
                  <Copy className='size-4' />
                  {t('Copy invite link')}
                </Button>
              ) : null}
            </div>
            {inviteLink ? (
              <div className='text-muted-foreground mt-2 break-all rounded-md bg-muted p-2 text-xs'>
                {inviteLink}
              </div>
            ) : null}
          </div>

          <div className='rounded-lg border p-3'>
            <div className='mb-3 flex items-center gap-2 font-medium'>
              <UserPlus className='size-4' />
              {t('Create member account')}
            </div>
            <div className='grid gap-3 md:grid-cols-2'>
              <Input
                value={memberDraft.username}
                onChange={(event) =>
                  onUpdateMemberDraft({ username: event.target.value })
                }
                placeholder={t('Username')}
              />
              <Input
                value={memberDraft.display_name}
                onChange={(event) =>
                  onUpdateMemberDraft({ display_name: event.target.value })
                }
                placeholder={t('Display name')}
              />
              <Input
                value={memberDraft.email}
                onChange={(event) =>
                  onUpdateMemberDraft({ email: event.target.value })
                }
                placeholder={t('Email')}
                type='email'
              />
              <Input
                value={memberDraft.password}
                onChange={(event) =>
                  onUpdateMemberDraft({ password: event.target.value })
                }
                placeholder={t('Initial password optional')}
                type='password'
              />
              <select
                className='border-input bg-background h-9 rounded-md border px-3 text-sm'
                value={memberDraft.role_key}
                onChange={(event) =>
                  onUpdateMemberDraft({ role_key: event.target.value })
                }
              >
                {assignableRoles.map((role) => (
                  <option key={role.key} value={role.key}>
                    {getOrganizationRoleName(role, t)}
                  </option>
                ))}
              </select>
              <Input
                value={memberDraft.department_id}
                onChange={(event) =>
                  onUpdateMemberDraft({
                    department_id: Number(event.target.value) || 0,
                  })
                }
                placeholder={t('Department ID')}
                type='number'
              />
            </div>
            <div className='mt-3 flex flex-wrap gap-2'>
              <Button onClick={onSubmitMemberAccount} disabled={isCreatingMember}>
                <UserPlus className='size-4' />
                {t('Create account')}
              </Button>
              {latestInitialPassword ? (
                <Button
                  variant='outline'
                  onClick={() => onCopyText(latestInitialPassword)}
                >
                  <Copy className='size-4' />
                  {t('Copy initial password')}
                </Button>
              ) : null}
            </div>
            {latestInitialPassword ? (
              <div className='text-muted-foreground mt-2 break-all rounded-md bg-muted p-2 text-xs'>
                {latestInitialPassword}
              </div>
            ) : null}
          </div>
        </div>

        <div className='mt-4 grid gap-4 xl:grid-cols-2'>
          <div className='min-w-0'>
            <div className='mb-2 text-sm font-medium'>{t('Members')}</div>
            <div className='overflow-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('User')}</TableHead>
                    <TableHead>{t('Role')}</TableHead>
                    <TableHead>{t('Department')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isMembersLoading ? (
                    <TableRow>
                      <TableCell colSpan={3}>{t('Loading...')}</TableCell>
                    </TableRow>
                  ) : null}
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className='flex flex-col'>
                          <span>
                            {member.user?.display_name || member.user?.username}
                          </span>
                          <span className='text-muted-foreground text-xs'>
                            {member.user?.email || member.user?.username}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getOrganizationRoleNameByKey(roles, member.role_key, t)}
                      </TableCell>
                      <TableCell>{member.department_id || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className='min-w-0'>
            <div className='mb-2 text-sm font-medium'>{t('Invitations')}</div>
            <div className='overflow-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Email')}</TableHead>
                    <TableHead>{t('Role')}</TableHead>
                    <TableHead>{t('Status')}</TableHead>
                    <TableHead className='text-right'>{t('Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isInvitationsLoading ? (
                    <TableRow>
                      <TableCell colSpan={4}>{t('Loading...')}</TableCell>
                    </TableRow>
                  ) : null}
                  {invitations.map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell>{invitation.email || '-'}</TableCell>
                      <TableCell>
                        {getOrganizationRoleNameByKey(
                          roles,
                          invitation.role_key,
                          t
                        )}
                      </TableCell>
                      <TableCell>
                        {invitationStatusLabel(invitation.status)}
                      </TableCell>
                      <TableCell className='text-right'>
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={invitation.status !== 1 || isRevokingInvitation}
                          onClick={() => onRevokeInvitation(invitation.id)}
                        >
                          {t('Revoke')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
