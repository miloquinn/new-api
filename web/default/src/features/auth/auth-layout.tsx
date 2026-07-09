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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'

type AuthLayoutProps = {
  children: React.ReactNode
}

/**
 * Split-screen auth shell: a brand panel on the left (desktop only) and the
 * form column on the right. All auth pages (sign-in / sign-up / OTP /
 * password reset) share this layout, so the brand story lives in one place.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()

  const brandMark = (
    <div className='flex items-center gap-2'>
      <div className='relative h-8 w-8'>
        {loading ? (
          <Skeleton className='absolute inset-0 rounded-full' />
        ) : (
          <img
            src={logo}
            alt={t('Logo')}
            className='h-8 w-8 rounded-full object-cover'
          />
        )}
      </div>
      {loading ? (
        <Skeleton className='h-6 w-24' />
      ) : (
        <span className='text-xl font-medium'>{systemName}</span>
      )}
    </div>
  )

  return (
    <div className='relative grid h-svh max-w-none lg:grid-cols-[minmax(0,42%)_1fr]'>
      {/* Left brand panel — desktop only */}
      <aside className='bg-primary text-primary-foreground relative hidden flex-col justify-between overflow-hidden p-10 lg:flex'>
        {/* Layered brand wash + grid texture */}
        <div
          aria-hidden
          className='pointer-events-none absolute inset-0'
          style={{
            background: [
              'radial-gradient(ellipse 80% 60% at 70% 10%, oklch(0.66 0.16 262.88 / 55%) 0%, transparent 70%)',
              'radial-gradient(ellipse 70% 50% at 20% 90%, oklch(0.38 0.14 262.88 / 70%) 0%, transparent 70%)',
            ].join(', '),
          }}
        />
        <div
          aria-hidden
          className='absolute inset-0 bg-[linear-gradient(to_right,oklch(1_0_0/6%)_1px,transparent_1px),linear-gradient(to_bottom,oklch(1_0_0/6%)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black_10%,transparent_100%)] bg-[size:3.5rem_3.5rem]'
        />

        <Link
          to='/'
          className='relative z-10 w-fit transition-opacity hover:opacity-80'
        >
          {brandMark}
        </Link>

        <div className='relative z-10 space-y-4'>
          <h2 className='max-w-md text-3xl leading-tight font-bold tracking-tight'>
            {t('Unified API Gateway for')}{' '}
            {t('Vast Range of AI Models')}
          </h2>
          <p className='text-primary-foreground/75 max-w-sm text-sm leading-relaxed'>
            {t(
              'Access a vast selection of models via a standard, unified API protocol. Power AI applications, manage digital assets, and connect the Future.'
            )}
          </p>
        </div>

        <div className='text-primary-foreground/60 relative z-10 text-xs'>
          {systemName}
        </div>
      </aside>

      {/* Right form column */}
      <div className='relative flex flex-col overflow-y-auto'>
        <Link
          to='/'
          className='absolute top-4 left-4 z-10 transition-opacity hover:opacity-80 sm:top-8 sm:left-8 lg:hidden'
        >
          {brandMark}
        </Link>
        <div className='container flex flex-1 items-center pt-16 lg:pt-0'>
          <div className='mx-auto flex w-full flex-col justify-center space-y-2 px-4 py-8 sm:w-[480px] sm:p-8'>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
