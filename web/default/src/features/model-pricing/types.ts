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

export interface TimedPriceRule {
  start_minute: number
  end_minute: number
  ratio: number
}

/** 页面用到的 option 键 → 解析后的模型价格配置 */
export interface PricingOptionMaps {
  modelRatio: Record<string, number>
  modelPrice: Record<string, number>
  completionRatio: Record<string, number>
  cacheRatio: Record<string, number>
  createCacheRatio: Record<string, number>
  imageRatio: Record<string, number>
  audioRatio: Record<string, number>
  audioCompletionRatio: Record<string, number>
  timedPriceRules: Record<string, TimedPriceRule[]>
  usdExchangeRate: number
  /** 原始 option JSON 串（按键），供复用的系统设置组件使用 */
  rawOptions: Record<string, string>
}

/** 高级选项里的细分价格通道 */
export type PriceLaneKey =
  | 'completion'
  | 'cache'
  | 'createCache'
  | 'image'
  | 'audioInput'
  | 'audioOutput'

export interface LaneDraft {
  enabled: boolean
  priceCny: string
}

export interface TimedRuleDraft {
  id: string // 前端行标识，不入库
  start: string // HH:MM
  end: string // HH:MM
  priceCny: string
}

export interface ModelPricingDraft {
  name: string
  mode: 'per-token' | 'per-request'
  mainPriceCny: string
  perRequestPriceCny: string
  lanes: Record<PriceLaneKey, LaneDraft>
  timedRules: TimedRuleDraft[]
}

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}
