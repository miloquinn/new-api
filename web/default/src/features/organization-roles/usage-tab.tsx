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

import { useQuery } from '@tanstack/react-query'
import { BarChart3 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatNumber, formatQuota } from '@/lib/format'

import { getOrganizationUsage } from './api'

const DAY_SECONDS = 24 * 60 * 60

function scopeBadge(scope: 'organization' | 'department' | 'own', t: TFn) {
  if (scope === 'organization') {
    return { label: t('Organization-wide'), variant: 'info' as const }
  }
  if (scope === 'department') {
    return { label: t('Your department'), variant: 'success' as const }
  }
  return { label: t('Your own usage'), variant: 'neutral' as const }
}

type TFn = (key: string, options?: Record<string, unknown>) => string

export function OrganizationUsageTab() {
  const { t } = useTranslation()

  // Fixed trailing-30-day window; timestamps are computed once per mount to
  // keep the query key stable across re-renders.
  const range = useMemo(() => {
    const end = Math.floor(Date.now() / 1000)
    return { start: end - 30 * DAY_SECONDS, end }
  }, [])

  const usageQuery = useQuery({
    queryKey: ['organization-usage', range.start, range.end],
    queryFn: () =>
      getOrganizationUsage({
        start_timestamp: range.start,
        end_timestamp: range.end,
      }),
    staleTime: 60 * 1000,
  })

  const data = usageQuery.data?.data
  const scope = data?.scope ?? 'own'
  const badge = scopeBadge(scope, t)

  const byModel = useMemo(() => {
    const map = new Map<
      string,
      { model: string; count: number; quota: number; tokens: number }
    >()
    for (const item of data?.items ?? []) {
      const key = item.model_name || t('Unknown')
      const entry = map.get(key) ?? {
        model: key,
        count: 0,
        quota: 0,
        tokens: 0,
      }
      entry.count += item.count
      entry.quota += item.quota
      entry.tokens += item.token_used
      map.set(key, entry)
    }
    return [...map.values()].sort((a, b) => b.quota - a.quota)
  }, [data?.items, t])

  const totals = useMemo(
    () =>
      byModel.reduce(
        (acc, row) => ({
          count: acc.count + row.count,
          quota: acc.quota + row.quota,
          tokens: acc.tokens + row.tokens,
        }),
        { count: 0, quota: 0, tokens: 0 }
      ),
    [byModel]
  )

  return (
    <Card size='sm'>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <CardTitle className='flex items-center gap-2 text-sm'>
            <BarChart3 className='text-muted-foreground size-4' />
            {t('Usage (last 30 days)')}
          </CardTitle>
          <StatusBadge
            label={badge.label}
            variant={badge.variant}
            size='sm'
            copyable={false}
          />
        </div>
        <CardDescription>
          {t(
            'Usage is scoped to what your organization role allows you to see.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {usageQuery.isLoading ? (
          <div className='flex flex-col gap-2'>
            <Skeleton className='h-8 w-full' />
            <Skeleton className='h-8 w-full' />
            <Skeleton className='h-8 w-full' />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Model')}</TableHead>
                <TableHead className='text-right'>{t('Requests')}</TableHead>
                <TableHead className='text-right'>{t('Tokens')}</TableHead>
                <TableHead className='text-right'>{t('Spend')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byModel.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className='text-muted-foreground py-8 text-center text-sm'
                  >
                    {t('No usage in this period')}
                  </TableCell>
                </TableRow>
              )}
              {byModel.map((row) => (
                <TableRow key={row.model}>
                  <TableCell className='font-medium'>{row.model}</TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {formatNumber(row.count)}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {formatNumber(row.tokens)}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {formatQuota(row.quota)}
                  </TableCell>
                </TableRow>
              ))}
              {byModel.length > 0 && (
                <TableRow className='border-t-2 font-semibold'>
                  <TableCell>{t('Total')}</TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {formatNumber(totals.count)}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {formatNumber(totals.tokens)}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {formatQuota(totals.quota)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
