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
import { lazy, Suspense, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getUserQuotaDetail } from '@/features/dashboard/api'
import { DEFAULT_TIME_GRANULARITY } from '@/features/dashboard/constants'
import { formatNumber, formatQuota } from '@/lib/format'
import { getRollingDateRange } from '@/lib/time'

const LazyModelCharts = lazy(() =>
  import('../models/model-charts').then((m) => ({ default: m.ModelCharts }))
)

const RANGE_PRESETS = [
  { days: 7, label: 'Last 7 days' },
  { days: 14, label: 'Last 14 days' },
  { days: 30, label: 'Last 30 days' },
]

type UserDetailTarget = {
  id: number
  username?: string
  displayName?: string
}

interface UserDetailDialogProps {
  target: UserDetailTarget | null
  onOpenChange: (open: boolean) => void
  selectedRange: number
  onRangeChange: (days: number) => void
}

function SummaryStat(props: { label: string; value: string }) {
  return (
    <div className='bg-muted/40 flex flex-col gap-1 rounded-lg px-3 py-2'>
      <span className='text-muted-foreground text-xs'>{props.label}</span>
      <span className='font-mono text-lg font-semibold tabular-nums'>
        {props.value}
      </span>
    </div>
  )
}

export function UserDetailDialog(props: UserDetailDialogProps) {
  const { t } = useTranslation()
  const userId = props.target?.id ?? 0

  const timeRange = useMemo(() => {
    const { start, end } = getRollingDateRange(props.selectedRange)
    return {
      start_timestamp: Math.floor(start.getTime() / 1000),
      end_timestamp: Math.floor(end.getTime() / 1000),
    }
  }, [props.selectedRange])

  const detailQuery = useQuery({
    queryKey: ['user-quota-detail', userId, timeRange],
    queryFn: () => getUserQuotaDetail(userId, timeRange),
    enabled: userId > 0,
    staleTime: 60_000,
  })

  const data = detailQuery.data?.data
  const items = useMemo(() => data?.items ?? [], [data?.items])

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, item) => ({
          count: acc.count + (item.count ?? 0),
          quota: acc.quota + (item.quota ?? 0),
          tokens: acc.tokens + (item.token_used ?? 0),
        }),
        { count: 0, quota: 0, tokens: 0 }
      ),
    [items]
  )

  const title =
    props.target?.displayName ||
    props.target?.username ||
    (userId ? `#${userId}` : '')

  let chartArea = null
  if (detailQuery.isLoading) {
    chartArea = <Skeleton className='h-80 w-full' />
  } else if (items.length === 0) {
    chartArea = (
      <div className='text-muted-foreground py-8 text-center text-sm'>
        {t('No usage in this period')}
      </div>
    )
  } else {
    chartArea = (
      <Suspense fallback={<Skeleton className='h-80 w-full' />}>
        <LazyModelCharts
          data={items}
          loading={false}
          timeGranularity={DEFAULT_TIME_GRANULARITY}
        />
      </Suspense>
    )
  }

  return (
    <Dialog
      open={props.target !== null}
      onOpenChange={(open) => {
        if (!open) props.onOpenChange(false)
      }}
    >
      <DialogContent className='max-h-[90vh] gap-4 overflow-y-auto sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>{t('Usage detail: {{name}}', { name: title })}</DialogTitle>
          <DialogDescription>
            {t('Per-model usage for this user within the selected window.')}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={String(props.selectedRange)}
          onValueChange={(value) => props.onRangeChange(Number(value))}
        >
          <TabsList>
            {RANGE_PRESETS.map((preset) => (
              <TabsTrigger
                key={preset.days}
                value={String(preset.days)}
                className='px-2.5 text-xs'
              >
                {t(preset.label)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {detailQuery.isError ? (
          <div className='text-destructive py-6 text-center text-sm'>
            {detailQuery.error instanceof Error
              ? detailQuery.error.message
              : t('Failed to load usage data')}
          </div>
        ) : (
          <>
            <div className='grid grid-cols-3 gap-3'>
              <SummaryStat
                label={t('Spend')}
                value={
                  detailQuery.isLoading ? '—' : formatQuota(totals.quota)
                }
              />
              <SummaryStat
                label={t('Requests')}
                value={
                  detailQuery.isLoading ? '—' : formatNumber(totals.count)
                }
              />
              <SummaryStat
                label={t('Tokens')}
                value={
                  detailQuery.isLoading ? '—' : formatNumber(totals.tokens)
                }
              />
            </div>

            {chartArea}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
