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

import type { TimedPriceRule } from './types'

/**
 * 倍率与人民币价格换算。
 * 系统内部以模型倍率存储（ratio 1 = $2 / 百万 tokens），
 * 人民币仅是展示/录入层：¥/百万tokens = ratio × 2 × 汇率。
 */
export function ratioToCnyPerMillion(ratio: number, usdRate: number): number {
  return ratio * 2 * usdRate
}

export function cnyPerMillionToRatio(cny: number, usdRate: number): number {
  if (usdRate <= 0) return 0
  return cny / 2 / usdRate
}

/** 按次价格换算：内部按美元/次存储 */
export function priceToCnyPerRequest(price: number, usdRate: number): number {
  return price * usdRate
}

export function cnyPerRequestToPrice(cny: number, usdRate: number): number {
  if (usdRate <= 0) return 0
  return cny / usdRate
}

export function formatCny(value: number): string {
  if (!Number.isFinite(value)) return '-'
  const rounded = Number(value.toFixed(6))
  return rounded.toString()
}

export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function hhmmToMinutes(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h < 0 || h > 24 || m < 0 || m > 59 || (h === 24 && m !== 0)) return null
  return h * 60 + m
}

/** 展开为不跨午夜的 [start, end) 分钟区间（与后端 normalizeSegments 语义一致） */
export function ruleSegments(rule: {
  start_minute: number
  end_minute: number
}): Array<[number, number]> {
  if (rule.start_minute === rule.end_minute) return []
  if (rule.start_minute < rule.end_minute) {
    return [[rule.start_minute, rule.end_minute]]
  }
  return [
    [rule.start_minute, 1440],
    [0, rule.end_minute],
  ]
}

/** 返回与其他规则重叠的规则下标集合（含跨午夜环形区间） */
export function findOverlappingRules(
  rules: Array<{ start_minute: number; end_minute: number }>
): Set<number> {
  const overlapping = new Set<number>()
  const occupiedBy: number[] = Array.from({ length: 1440 }, () => -1)
  rules.forEach((rule, index) => {
    for (const [start, end] of ruleSegments(rule)) {
      for (let m = start; m < end; m++) {
        if (occupiedBy[m] >= 0) {
          overlapping.add(occupiedBy[m])
          overlapping.add(index)
        } else {
          occupiedBy[m] = index
        }
      }
    }
  })
  return overlapping
}

/** 当前北京时间的分钟数（0-1439），用于"当前时段"高亮 */
export function beijingMinuteNow(now: Date = new Date()): number {
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + 8 * 60) % 1440
}

export function isRuleActiveAt(rule: TimedPriceRule, minute: number): boolean {
  return ruleSegments(rule).some(([start, end]) => minute >= start && minute < end)
}

/** 时间条着色区段（贵/便宜/中性） */
export type TimelineTone = 'cheap' | 'expensive' | 'neutral'

export type TimelineSegment = {
  start: number
  end: number
  tone: TimelineTone
}

export function buildTimelineSegments(
  parsed: Array<{
    start_minute: number
    end_minute: number
    priceCny: number | null
  }>,
  basePriceCny: number | null
): TimelineSegment[] {
  const segments: TimelineSegment[] = []
  for (const rule of parsed) {
    let tone: TimelineTone = 'neutral'
    if (rule.priceCny !== null && basePriceCny !== null && basePriceCny > 0) {
      if (rule.priceCny < basePriceCny) tone = 'cheap'
      else if (rule.priceCny > basePriceCny) tone = 'expensive'
    }
    for (const [start, end] of ruleSegments(rule)) {
      segments.push({ start, end, tone })
    }
  }
  return segments
}
