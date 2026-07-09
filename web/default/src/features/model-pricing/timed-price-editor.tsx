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

import { Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import {
  buildTimelineSegments,
  findOverlappingRules,
  hhmmToMinutes,
  type TimelineSegment,
} from './lib'
import type { TimedRuleDraft } from './types'

type TimedPriceEditorProps = {
  rules: TimedRuleDraft[]
  onChange: (rules: TimedRuleDraft[]) => void
  /** 基准主价格（¥/百万tokens），用于时间条的贵/便宜着色 */
  basePriceCny: number | null
}

type ParsedRule = {
  index: number
  start_minute: number
  end_minute: number
  priceCny: number | null
}

function parseRules(rules: TimedRuleDraft[]): ParsedRule[] {
  const parsed: ParsedRule[] = []
  rules.forEach((rule, index) => {
    const start = hhmmToMinutes(rule.start)
    const end = hhmmToMinutes(rule.end)
    if (start === null || end === null || start === end) return
    const price = Number(rule.priceCny)
    parsed.push({
      index,
      start_minute: start,
      end_minute: end,
      priceCny:
        rule.priceCny !== '' && Number.isFinite(price) && price >= 0
          ? price
          : null,
    })
  })
  return parsed
}

/** 24 小时时间条：直观展示什么时候贵、什么时候便宜 */
export function TimedPriceTimeline(props: {
  segments: TimelineSegment[]
  className?: string
}) {
  return (
    <div className={cn('space-y-1', props.className)}>
      <div className='bg-muted/60 relative h-3 overflow-hidden rounded-full'>
        {props.segments.map((seg) => (
          <div
            key={`${seg.start}:${seg.end}:${seg.tone}`}
            className={cn(
              'absolute top-0 h-full',
              seg.tone === 'cheap' && 'bg-emerald-500/80',
              seg.tone === 'expensive' && 'bg-orange-500/80',
              seg.tone === 'neutral' && 'bg-sky-500/70'
            )}
            style={{
              left: `${(seg.start / 1440) * 100}%`,
              width: `${((seg.end - seg.start) / 1440) * 100}%`,
            }}
          />
        ))}
      </div>
      <div className='text-muted-foreground/60 flex justify-between text-[10px]'>
        {['00:00', '06:00', '12:00', '18:00', '24:00'].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  )
}

export function TimedPriceEditor(props: TimedPriceEditorProps) {
  const { t } = useTranslation()

  const parsed = useMemo(() => parseRules(props.rules), [props.rules])
  const overlapping = useMemo(() => {
    const indexed = findOverlappingRules(parsed)
    const result = new Set<number>()
    for (const parsedIndex of indexed) {
      result.add(parsed[parsedIndex].index)
    }
    return result
  }, [parsed])

  const updateRule = (id: string, patch: Partial<TimedRuleDraft>) => {
    props.onChange(
      props.rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule))
    )
  }

  const removeRule = (id: string) => {
    props.onChange(props.rules.filter((rule) => rule.id !== id))
  }

  const addRule = () => {
    props.onChange([
      ...props.rules,
      { id: crypto.randomUUID(), start: '', end: '', priceCny: '' },
    ])
  }

  return (
    <div className='space-y-3'>
      {props.rules.length > 0 ? (
        <TimedPriceTimeline
          segments={buildTimelineSegments(parsed, props.basePriceCny)}
        />
      ) : null}

      <div className='space-y-2'>
        {props.rules.map((rule, index) => {
          const timesReady =
            hhmmToMinutes(rule.start) !== null &&
            hhmmToMinutes(rule.end) !== null &&
            rule.start !== rule.end
          const isOverlapping = overlapping.has(index)
          return (
            <div
              key={rule.id}
              className={cn(
                'flex flex-wrap items-center gap-2 rounded-md border p-2',
                isOverlapping && 'border-destructive bg-destructive/5'
              )}
            >
              <Input
                type='time'
                className='w-28'
                value={rule.start}
                onChange={(event) =>
                  updateRule(rule.id, { start: event.target.value })
                }
              />
              <span className='text-muted-foreground text-sm'>—</span>
              <Input
                type='time'
                className='w-28'
                value={rule.end}
                onChange={(event) =>
                  updateRule(rule.id, { end: event.target.value })
                }
              />
              <div className='ml-auto flex items-center gap-1.5'>
                <span className='text-muted-foreground text-sm'>¥</span>
                <Input
                  className='w-28'
                  inputMode='decimal'
                  placeholder={
                    timesReady ? t('Price') : t('Select time range first')
                  }
                  disabled={!timesReady}
                  value={rule.priceCny}
                  onChange={(event) =>
                    updateRule(rule.id, { priceCny: event.target.value })
                  }
                />
                <span className='text-muted-foreground text-xs whitespace-nowrap'>
                  / {t('1M tokens')}
                </span>
                <Button
                  variant='ghost'
                  size='icon'
                  className='text-muted-foreground hover:text-destructive'
                  onClick={() => removeRule(rule.id)}
                >
                  <Trash2 className='size-4' />
                </Button>
              </div>
              {isOverlapping ? (
                <p className='text-destructive w-full text-xs'>
                  {t('This time range overlaps another one')}
                </p>
              ) : null}
            </div>
          )
        })}
      </div>

      <Button variant='outline' size='sm' onClick={addRule}>
        <Plus className='size-4' />
        {t('Add price period')}
      </Button>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Periods use Beijing time (UTC+8). Cross-midnight periods like 22:00-06:00 are supported. Time not covered by any period uses the base price.'
        )}
      </p>
    </div>
  )
}
