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
import { useNavigate } from '@tanstack/react-router'
import { User, Wallet, LogOut, Settings } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SignOutDialog } from '@/components/sign-out-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import useDialogState from '@/hooks/use-dialog'
import { useIsSidebarModuleVisible } from '@/hooks/use-sidebar-config'
import { useUserDisplay } from '@/hooks/use-user-display'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

const avatarFallbackClassName = 'font-semibold text-white'

export function ProfileDropdown() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useDialogState()
  const user = useAuthStore((state) => state.auth.user)
  const { displayName, roleLabel } = useUserDisplay(user)
  const isSuperAdmin = user?.role === ROLE.SUPER_ADMIN
  const isAdmin = user?.role === ROLE.ADMIN
  const isWalletVisible = useIsSidebarModuleVisible('/wallet')
  const avatarName = user?.username || displayName
  const avatarFallback = getUserAvatarFallback(avatarName)
  const avatarFallbackStyle = useMemo(
    () => getUserAvatarStyle(avatarName),
    [avatarName]
  )
  let roleBadgeClassName =
    'bg-muted text-muted-foreground border border-transparent'
  if (isSuperAdmin) {
    roleBadgeClassName =
      'border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
  } else if (isAdmin) {
    roleBadgeClassName =
      'border border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400'
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          render={
            <Button
              variant='ghost'
              className='hover:ring-ring/40 relative size-7 rounded-full p-0 transition-shadow hover:ring-2'
            />
          }
        >
          <Avatar className='size-7'>
            <AvatarFallback
              className={`${avatarFallbackClassName} text-[11px]`}
              style={avatarFallbackStyle}
            >
              {avatarFallback}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' sideOffset={8} className='w-64 p-1.5'>
          <div className='from-muted/80 to-muted/30 mb-1 flex items-center gap-3 rounded-lg bg-gradient-to-br px-2.5 py-3'>
            <Avatar className='ring-background size-10 shadow-sm ring-2'>
              <AvatarFallback
                className={`${avatarFallbackClassName} text-sm`}
                style={avatarFallbackStyle}
              >
                {avatarFallback}
              </AvatarFallback>
            </Avatar>
            <div className='flex flex-1 flex-col gap-1.5 overflow-hidden'>
              <p className='text-foreground truncate text-sm leading-none font-semibold'>
                {displayName}
              </p>
              <div className='flex items-center gap-1'>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium ${roleBadgeClassName}`}
                >
                  {roleLabel}
                </span>
                {user?.group ? (
                  <span className='text-muted-foreground border-border rounded-full border px-1.5 py-0.5 font-mono text-[10px] leading-none'>
                    {String(user.group)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <DropdownMenuItem
            className='gap-2.5 py-2'
            onClick={() => navigate({ to: '/profile' })}
          >
            <User className='text-muted-foreground size-4' />
            {t('Profile')}
          </DropdownMenuItem>

          {isWalletVisible && (
            <DropdownMenuItem
              className='gap-2.5 py-2'
              onClick={() => navigate({ to: '/wallet' })}
            >
              <Wallet className='text-muted-foreground size-4' />
              {t('Wallet')}
            </DropdownMenuItem>
          )}

          {isSuperAdmin && (
            <DropdownMenuItem
              className='gap-2.5 py-2'
              onClick={() =>
                navigate({
                  to: '/system-settings/site/$section',
                  params: { section: 'system-info' },
                })
              }
            >
              <Settings className='text-muted-foreground size-4' />
              {t('System Settings')}
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant='destructive'
            className='gap-2.5 py-2'
            onClick={() => setOpen(true)}
          >
            <LogOut className='size-4' />
            {t('Sign out')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
