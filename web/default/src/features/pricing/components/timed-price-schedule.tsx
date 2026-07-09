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

import { Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import { formatGroupPrice } from '../lib/price'
import type { PricingModel, TimedPriceWindow, TokenUnit } from '../types'

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function windowSegments(w: TimedPriceWindow): Array<[number, number]> {
  if (w.start_minute === w.end_minute) return []
  if (w.start_minute < w.end_minute) return [[w.start_minute, w.end_minute]]
  return [
    [w.start_minute, 1440],
    [0, w.end_minute],
  ]
}

/** 当前北京时间的分钟数（0-1439） */
function beijingMinuteNow(): number {
  const now = new Date()
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + 8 * 60) % 1440
}

function isWindowActive(w: TimedPriceWindow, minute: number): boolean {
  return windowSegments(w).some(([start, end]) => minute >= start && minute < end)
}

function formatWindowLabel(w: TimedPriceWindow): string {
  const end = w.end_minute === 0 ? 1440 : w.end_minute
  return `${minutesToHHMM(w.start_minute)}-${minutesToHHMM(end)}`
}

function windowTone(
  w: TimedPriceWindow,
  baseRatio: number
): 'cheap' | 'expensive' | 'base' {
  if (w.ratio < baseRatio) return 'cheap'
  if (w.ratio > baseRatio) return 'expensive'
  return 'base'
}

type TimedPriceScheduleProps = {
  model: PricingModel
  tokenUnit: TokenUnit
  showRechargePrice: boolean
  priceRate: number
  usdExchangeRate: number
}

// 分时价格表：让用户直观看到什么时候贵、什么时候便宜。
// 每个时段用该时段的主倍率替换 model_ratio 后复用统一的价格格式化逻辑，
// 输入/输出价格随时段主价格等比联动，货币单位跟随站点额度展示设置。
export function TimedPriceSchedule(props: TimedPriceScheduleProps) {
  const { t } = useTranslation()
  const windows = props.model.timed_prices ?? []
  if (windows.length === 0) return null

  const tokenUnitLabel = props.tokenUnit === 'K' ? '1K' : '1M'
  const baseGroupKey = '_base'
  const baseGroupRatioMap = { [baseGroupKey]: 1 }
  const nowMinute = beijingMinuteNow()
  const baseActive = !windows.some((w) => isWindowActive(w, nowMinute))

  const renderRow = (
    key: string,
    label: string,
    model: PricingModel,
    active: boolean,
    tone: 'cheap' | 'expensive' | 'base'
  ) => (
    <div
      key={key}
      className={cn(
        'flex items-center justify-between gap-3 rounded-md px-2 py-1.5',
        active && 'bg-muted/60'
      )}
    >
      <div className='flex items-center gap-2'>
        <span
          className={cn(
            'inline-block size-2 rounded-full',
            tone === 'cheap' && 'bg-emerald-500',
            tone === 'expensive' && 'bg-orange-500',
            tone === 'base' && 'bg-muted-foreground/40'
          )}
        />
        <span className='font-mono text-sm tabular-nums'>{label}</span>
        {active ? (
          <Badge variant='secondary' className='h-5 px-1.5 text-[10px]'>
            {t('Now')}
          </Badge>
        ) : null}
      </div>
      <div className='text-muted-foreground flex items-baseline gap-3 font-mono text-sm tabular-nums'>
        <span>
          {t('Input')}{' '}
          <span className='text-foreground'>
            {formatGroupPrice(
              model,
              baseGroupKey,
              'input',
              props.tokenUnit,
              props.showRechargePrice,
              props.priceRate,
              props.usdExchangeRate,
              baseGroupRatioMap
            )}
          </span>
          <span className='text-muted-foreground/40 text-xs'>
            /{tokenUnitLabel}
          </span>
        </span>
        <span>
          {t('Output')}{' '}
          <span className='text-foreground'>
            {formatGroupPrice(
              model,
              baseGroupKey,
              'output',
              props.tokenUnit,
              props.showRechargePrice,
              props.priceRate,
              props.usdExchangeRate,
              baseGroupRatioMap
            )}
          </span>
          <span className='text-muted-foreground/40 text-xs'>
            /{tokenUnitLabel}
          </span>
        </span>
      </div>
    </div>
  )

  return (
    <section>
      <div className='mb-2 flex items-center gap-1.5'>
        <Clock className='text-muted-foreground size-3.5' />
        <h3 className='text-muted-foreground text-[11px] font-medium tracking-wider uppercase'>
          {t('Timed prices')}
        </h3>
        <span className='text-muted-foreground/60 text-[10px]'>
          {t('Beijing time (UTC+8)')}
        </span>
      </div>
      <div className='bg-muted/20 space-y-0.5 rounded-lg border px-1.5 py-1.5'>
        {renderRow(
          '_base',
          t('Standard'),
          props.model,
          baseActive,
          'base'
        )}
        {windows.map((w) =>
          renderRow(
            `${w.start_minute}-${w.end_minute}`,
            formatWindowLabel(w),
            { ...props.model, timed_prices: undefined, model_ratio: w.ratio },
            isWindowActive(w, nowMinute),
            windowTone(w, props.model.model_ratio)
          )
        )}
      </div>
    </section>
  )
}
