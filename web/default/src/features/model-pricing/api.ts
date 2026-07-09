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

import { api } from '@/lib/api'

import type { ApiResponse, PricingOptionMaps, TimedPriceRule } from './types'

const OPTION_KEYS = [
  'ModelRatio',
  'ModelPrice',
  'CompletionRatio',
  'CacheRatio',
  'CreateCacheRatio',
  'ImageRatio',
  'AudioRatio',
  'AudioCompletionRatio',
  'TimedPriceRules',
  'USDExchangeRate',
  'tool_price_setting.prices',
  'billing_setting.billing_mode',
  'billing_setting.billing_expr',
] as const

function parseJsonMap<T>(value: string | undefined): Record<string, T> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, T>
    }
  } catch {
    // 配置损坏时按空处理，保存会覆盖
  }
  return {}
}

export async function getPricingOptionMaps(): Promise<PricingOptionMaps> {
  const res = await api.get<
    ApiResponse<Array<{ key: string; value: string }>>
  >('/api/option/')
  const raw: Record<string, string> = {}
  for (const item of res.data?.data ?? []) {
    if ((OPTION_KEYS as readonly string[]).includes(item.key)) {
      raw[item.key] = item.value
    }
  }
  const usdExchangeRate = Number(raw['USDExchangeRate'])
  return {
    modelRatio: parseJsonMap<number>(raw['ModelRatio']),
    modelPrice: parseJsonMap<number>(raw['ModelPrice']),
    completionRatio: parseJsonMap<number>(raw['CompletionRatio']),
    cacheRatio: parseJsonMap<number>(raw['CacheRatio']),
    createCacheRatio: parseJsonMap<number>(raw['CreateCacheRatio']),
    imageRatio: parseJsonMap<number>(raw['ImageRatio']),
    audioRatio: parseJsonMap<number>(raw['AudioRatio']),
    audioCompletionRatio: parseJsonMap<number>(raw['AudioCompletionRatio']),
    timedPriceRules: parseJsonMap<TimedPriceRule[]>(raw['TimedPriceRules']),
    usdExchangeRate:
      Number.isFinite(usdExchangeRate) && usdExchangeRate > 0
        ? usdExchangeRate
        : 7.3,
    // 原始 option JSON 串，供复用的工具价格/上游同步组件使用
    rawOptions: raw,
  }
}

export async function updatePricingOption(
  key: string,
  value: string
): Promise<ApiResponse> {
  const res = await api.put('/api/option/', { key, value })
  return res.data
}

export interface PricingCatalog {
  /** 渠道已启用的模型及其厂商归属（来自模型元数据） */
  models: Array<{ model_name: string; vendor_id?: number }>
  vendors: Array<{ id: number; name: string }>
}

export async function getPricingCatalog(): Promise<PricingCatalog> {
  const res = await api.get('/api/pricing')
  return {
    models: res.data?.data ?? [],
    vendors: res.data?.vendors ?? [],
  }
}
