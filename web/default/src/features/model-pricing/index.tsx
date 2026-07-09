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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Clock, Plus, Save, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToolPriceSettings } from '@/features/system-settings/models/tool-price-settings'
import { UpstreamRatioSync } from '@/features/system-settings/models/upstream-ratio-sync'
import { cn } from '@/lib/utils'

import { getPricingCatalog, getPricingOptionMaps, updatePricingOption } from './api'
import {
  cnyPerMillionToRatio,
  cnyPerRequestToPrice,
  findOverlappingRules,
  formatCny,
  hhmmToMinutes,
  minutesToHHMM,
  priceToCnyPerRequest,
  ratioToCnyPerMillion,
} from './lib'
import { TimedPriceEditor } from './timed-price-editor'
import type {
  ModelPricingDraft,
  PriceLaneKey,
  PricingOptionMaps,
  TimedPriceRule,
} from './types'

const optionMapsQueryKey = ['model-pricing-options'] as const
const pricingCatalogQueryKey = ['model-pricing-catalog'] as const

type PricingTab = 'pricing' | 'tool-prices' | 'upstream-sync'

type LaneMapKey =
  | 'completionRatio'
  | 'cacheRatio'
  | 'createCacheRatio'
  | 'imageRatio'
  | 'audioRatio'
  | 'audioCompletionRatio'

const LANES: Array<{
  key: PriceLaneKey
  mapKey: LaneMapKey
  labelKey: string
  relativeTo: 'main' | 'audioInput'
}> = [
  { key: 'completion', mapKey: 'completionRatio', labelKey: 'Output price', relativeTo: 'main' },
  { key: 'cache', mapKey: 'cacheRatio', labelKey: 'Cache read price', relativeTo: 'main' },
  { key: 'createCache', mapKey: 'createCacheRatio', labelKey: 'Cache write price', relativeTo: 'main' },
  { key: 'image', mapKey: 'imageRatio', labelKey: 'Image input price', relativeTo: 'main' },
  { key: 'audioInput', mapKey: 'audioRatio', labelKey: 'Audio input price', relativeTo: 'main' },
  { key: 'audioOutput', mapKey: 'audioCompletionRatio', labelKey: 'Audio output price', relativeTo: 'audioInput' },
]

function emptyLanes(): ModelPricingDraft['lanes'] {
  return {
    completion: { enabled: false, priceCny: '' },
    cache: { enabled: false, priceCny: '' },
    createCache: { enabled: false, priceCny: '' },
    image: { enabled: false, priceCny: '' },
    audioInput: { enabled: false, priceCny: '' },
    audioOutput: { enabled: false, priceCny: '' },
  }
}

function buildDraft(
  name: string,
  maps: PricingOptionMaps
): ModelPricingDraft {
  const rate = maps.usdExchangeRate
  const isPerRequest = name in maps.modelPrice
  const mainRatio = maps.modelRatio[name]
  const mainCny =
    mainRatio !== undefined ? ratioToCnyPerMillion(mainRatio, rate) : null

  const lanes = emptyLanes()
  const audioInputRel = maps.audioRatio[name]
  for (const lane of LANES) {
    const rel = maps[lane.mapKey][name]
    if (rel === undefined) continue
    let base: number | null = mainCny
    if (lane.relativeTo === 'audioInput') {
      base =
        audioInputRel !== undefined && mainCny !== null
          ? audioInputRel * mainCny
          : null
    }
    lanes[lane.key] = {
      enabled: true,
      priceCny: base !== null ? formatCny(rel * base) : '',
    }
  }

  return {
    name,
    mode: isPerRequest ? 'per-request' : 'per-token',
    mainPriceCny: mainCny !== null ? formatCny(mainCny) : '',
    perRequestPriceCny:
      isPerRequest && maps.modelPrice[name] !== undefined
        ? formatCny(priceToCnyPerRequest(maps.modelPrice[name], rate))
        : '',
    lanes,
    timedRules: (maps.timedPriceRules[name] ?? []).map((rule) => ({
      id: crypto.randomUUID(),
      start: minutesToHHMM(rule.start_minute),
      end: minutesToHHMM(rule.end_minute % 1440),
      priceCny: formatCny(ratioToCnyPerMillion(rule.ratio, rate)),
    })),
  }
}

// applyDraft 把编辑器草稿写回各 option map（在副本上操作），返回受影响的 option 键。
// 抛出 Error 表示校验失败（信息为 i18n key）。
function applyDraft(
  maps: PricingOptionMaps,
  draft: ModelPricingDraft
): { updated: PricingOptionMaps; dirtyKeys: string[] } {
  const rate = maps.usdExchangeRate
  const name = draft.name.trim()
  if (!name) throw new Error('Model name is required')

  const updated: PricingOptionMaps = {
    ...maps,
    modelRatio: { ...maps.modelRatio },
    modelPrice: { ...maps.modelPrice },
    completionRatio: { ...maps.completionRatio },
    cacheRatio: { ...maps.cacheRatio },
    createCacheRatio: { ...maps.createCacheRatio },
    imageRatio: { ...maps.imageRatio },
    audioRatio: { ...maps.audioRatio },
    audioCompletionRatio: { ...maps.audioCompletionRatio },
    timedPriceRules: { ...maps.timedPriceRules },
  }
  const dirty = new Set<string>()
  const laneKeyToOption: Record<LaneMapKey, string> = {
    completionRatio: 'CompletionRatio',
    cacheRatio: 'CacheRatio',
    createCacheRatio: 'CreateCacheRatio',
    imageRatio: 'ImageRatio',
    audioRatio: 'AudioRatio',
    audioCompletionRatio: 'AudioCompletionRatio',
  }
  const removeLane = (mapKey: LaneMapKey) => {
    if (name in updated[mapKey]) {
      delete updated[mapKey][name]
      dirty.add(laneKeyToOption[mapKey])
    }
  }

  if (draft.mode === 'per-request') {
    const cny = Number(draft.perRequestPriceCny)
    if (draft.perRequestPriceCny === '' || !Number.isFinite(cny) || cny < 0) {
      throw new Error('Please enter a valid price')
    }
    updated.modelPrice[name] = cnyPerRequestToPrice(cny, rate)
    dirty.add('ModelPrice')
    if (name in updated.modelRatio) {
      delete updated.modelRatio[name]
      dirty.add('ModelRatio')
    }
    for (const lane of LANES) removeLane(lane.mapKey)
    if (name in updated.timedPriceRules) {
      delete updated.timedPriceRules[name]
      dirty.add('TimedPriceRules')
    }
    return { updated, dirtyKeys: [...dirty] }
  }

  // 按量计费
  const mainCny = Number(draft.mainPriceCny)
  if (draft.mainPriceCny === '' || !Number.isFinite(mainCny) || mainCny < 0) {
    throw new Error('Please enter a valid price')
  }
  updated.modelRatio[name] = cnyPerMillionToRatio(mainCny, rate)
  dirty.add('ModelRatio')
  if (name in updated.modelPrice) {
    delete updated.modelPrice[name]
    dirty.add('ModelPrice')
  }

  // 高级选项：手动开启的通道按主价格换算为相对倍率，未开启的通道回归自动（删除条目）
  const audioInCny = Number(draft.lanes.audioInput.priceCny)
  for (const lane of LANES) {
    const laneDraft = draft.lanes[lane.key]
    if (!laneDraft.enabled) {
      removeLane(lane.mapKey)
      continue
    }
    const laneCny = Number(laneDraft.priceCny)
    if (laneDraft.priceCny === '' || !Number.isFinite(laneCny) || laneCny < 0) {
      throw new Error('Please enter a valid price')
    }
    let base = mainCny
    if (lane.relativeTo === 'audioInput') {
      if (!draft.lanes.audioInput.enabled || !(audioInCny > 0)) {
        throw new Error('Audio output price requires a manual audio input price')
      }
      base = audioInCny
    }
    if (!(base > 0)) {
      throw new Error('Advanced prices require a non-zero base price')
    }
    updated[lane.mapKey][name] = laneCny / base
    dirty.add(laneKeyToOption[lane.mapKey])
  }

  // 时段价格
  const parsedRules: TimedPriceRule[] = []
  for (const rule of draft.timedRules) {
    const start = hhmmToMinutes(rule.start)
    const end = hhmmToMinutes(rule.end)
    const cny = Number(rule.priceCny)
    if (start === null || end === null || start === end) {
      throw new Error('Please complete all price periods')
    }
    if (rule.priceCny === '' || !Number.isFinite(cny) || cny < 0) {
      throw new Error('Please enter a valid price')
    }
    parsedRules.push({
      start_minute: start,
      end_minute: end,
      ratio: cnyPerMillionToRatio(cny, rate),
    })
  }
  if (findOverlappingRules(parsedRules).size > 0) {
    throw new Error('Price periods must not overlap')
  }
  const hadRules = name in updated.timedPriceRules
  if (parsedRules.length > 0) {
    updated.timedPriceRules[name] = parsedRules
    dirty.add('TimedPriceRules')
  } else if (hadRules) {
    delete updated.timedPriceRules[name]
    dirty.add('TimedPriceRules')
  }

  return { updated, dirtyKeys: [...dirty] }
}

function optionValueForKey(maps: PricingOptionMaps, key: string): string {
  switch (key) {
    case 'ModelRatio':
      return JSON.stringify(maps.modelRatio, null, 2)
    case 'ModelPrice':
      return JSON.stringify(maps.modelPrice, null, 2)
    case 'CompletionRatio':
      return JSON.stringify(maps.completionRatio, null, 2)
    case 'CacheRatio':
      return JSON.stringify(maps.cacheRatio, null, 2)
    case 'CreateCacheRatio':
      return JSON.stringify(maps.createCacheRatio, null, 2)
    case 'ImageRatio':
      return JSON.stringify(maps.imageRatio, null, 2)
    case 'AudioRatio':
      return JSON.stringify(maps.audioRatio, null, 2)
    case 'AudioCompletionRatio':
      return JSON.stringify(maps.audioCompletionRatio, null, 2)
    case 'TimedPriceRules':
      return JSON.stringify(maps.timedPriceRules)
    default:
      return ''
  }
}

export function ModelPricing() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [draft, setDraft] = useState<ModelPricingDraft | null>(null)
  const [search, setSearch] = useState('')
  const [rateDraft, setRateDraft] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<
    'channel' | 'all' | 'priced' | 'unpriced'
  >('channel')
  const [vendorFilter, setVendorFilter] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<PricingTab>('pricing')

  const mapsQuery = useQuery({
    queryKey: optionMapsQueryKey,
    queryFn: getPricingOptionMaps,
  })
  const maps = mapsQuery.data

  const catalogQuery = useQuery({
    queryKey: pricingCatalogQueryKey,
    queryFn: getPricingCatalog,
    staleTime: 60 * 1000,
  })
  const vendors = useMemo(
    () => catalogQuery.data?.vendors ?? [],
    [catalogQuery.data]
  )
  const modelVendorMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of catalogQuery.data?.models ?? []) {
      if (m.vendor_id) map.set(m.model_name, m.vendor_id)
    }
    return map
  }, [catalogQuery.data])

  const isPriced = (name: string): boolean =>
    !!maps && (name in maps.modelRatio || name in maps.modelPrice)

  // 「有渠道」= 存在已启用渠道的模型（来自 /api/pricing 的 catalog）。
  // 与「已定价」区分：内置默认价会让大量无渠道模型也计入已定价。
  const channelModelNames = useMemo(() => {
    const names = new Set<string>()
    for (const m of catalogQuery.data?.models ?? []) {
      names.add(m.model_name)
    }
    return names
  }, [catalogQuery.data])

  // 模型全集 = 已配置定价的模型 ∪ 渠道已启用的模型（后者可能未定价）
  const allNames = useMemo(() => {
    if (!maps) return []
    const names = new Set<string>([
      ...Object.keys(maps.modelRatio),
      ...Object.keys(maps.modelPrice),
    ])
    for (const m of catalogQuery.data?.models ?? []) {
      names.add(m.model_name)
    }
    return [...names].sort()
  }, [maps, catalogQuery.data])

  const statusCounts = useMemo(() => {
    let priced = 0
    let channel = 0
    for (const name of allNames) {
      if (maps && (name in maps.modelRatio || name in maps.modelPrice)) {
        priced++
      }
      if (channelModelNames.has(name)) {
        channel++
      }
    }
    return {
      all: allNames.length,
      priced,
      unpriced: allNames.length - priced,
      channel,
    }
  }, [allNames, maps, channelModelNames])

  const modelNames = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return allNames.filter((name) => {
      if (keyword && !name.toLowerCase().includes(keyword)) return false
      const priced =
        !!maps && (name in maps.modelRatio || name in maps.modelPrice)
      if (statusFilter === 'channel' && !channelModelNames.has(name)) {
        return false
      }
      if (statusFilter === 'priced' && !priced) return false
      if (statusFilter === 'unpriced' && priced) return false
      if (vendorFilter !== null && modelVendorMap.get(name) !== vendorFilter) {
        return false
      }
      return true
    })
  }, [
    allNames,
    search,
    statusFilter,
    vendorFilter,
    modelVendorMap,
    maps,
    channelModelNames,
  ])

  const saveMutation = useMutation({
    mutationFn: async (payload: { maps: PricingOptionMaps; keys: string[] }) => {
      for (const key of payload.keys) {
        const res = await updatePricingOption(
          key,
          optionValueForKey(payload.maps, key)
        )
        if (!res.success) {
          throw new Error(res.message || key)
        }
      }
    },
    onSuccess: async () => {
      toast.success(t('Model pricing saved'))
      await queryClient.invalidateQueries({ queryKey: optionMapsQueryKey })
    },
    onError: (error: Error) => {
      toast.error(t(error.message))
    },
  })

  const rateMutation = useMutation({
    mutationFn: async (rate: number) => {
      const res = await updatePricingOption('USDExchangeRate', String(rate))
      if (!res.success) throw new Error(res.message || 'USDExchangeRate')
    },
    onSuccess: async () => {
      toast.success(t('Exchange rate saved'))
      setRateDraft(null)
      await queryClient.invalidateQueries({ queryKey: optionMapsQueryKey })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const selectModel = (name: string) => {
    if (!maps) return
    setSelectedName(name)
    setIsCreating(false)
    setDraft(buildDraft(name, maps))
    setAdvancedOpen(false)
  }

  const beginCreate = () => {
    setSelectedName(null)
    setIsCreating(true)
    setDraft({
      name: '',
      mode: 'per-token',
      mainPriceCny: '',
      perRequestPriceCny: '',
      lanes: emptyLanes(),
      timedRules: [],
    })
    setAdvancedOpen(false)
  }

  const updateDraft = (patch: Partial<ModelPricingDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }

  const saveDraft = () => {
    if (!maps || !draft) return
    try {
      const { updated, dirtyKeys } = applyDraft(maps, draft)
      if (dirtyKeys.length === 0) {
        toast.info(t('Nothing to save'))
        return
      }
      saveMutation.mutate({ maps: updated, keys: dirtyKeys })
      if (isCreating) {
        setIsCreating(false)
        setSelectedName(draft.name.trim())
      }
    } catch (error) {
      toast.error(t((error as Error).message))
    }
  }

  const deleteModelPricing = () => {
    if (!maps || !selectedName) return
    const updated: PricingOptionMaps = {
      ...maps,
      modelRatio: { ...maps.modelRatio },
      modelPrice: { ...maps.modelPrice },
      completionRatio: { ...maps.completionRatio },
      cacheRatio: { ...maps.cacheRatio },
      createCacheRatio: { ...maps.createCacheRatio },
      imageRatio: { ...maps.imageRatio },
      audioRatio: { ...maps.audioRatio },
      audioCompletionRatio: { ...maps.audioCompletionRatio },
      timedPriceRules: { ...maps.timedPriceRules },
    }
    const keys: string[] = []
    const mapEntries: Array<[keyof PricingOptionMaps, string]> = [
      ['modelRatio', 'ModelRatio'],
      ['modelPrice', 'ModelPrice'],
      ['completionRatio', 'CompletionRatio'],
      ['cacheRatio', 'CacheRatio'],
      ['createCacheRatio', 'CreateCacheRatio'],
      ['imageRatio', 'ImageRatio'],
      ['audioRatio', 'AudioRatio'],
      ['audioCompletionRatio', 'AudioCompletionRatio'],
      ['timedPriceRules', 'TimedPriceRules'],
    ]
    for (const [mapKey, optionKey] of mapEntries) {
      const record = updated[mapKey] as Record<string, unknown>
      if (selectedName in record) {
        delete record[selectedName]
        keys.push(optionKey)
      }
    }
    if (keys.length === 0) return
    saveMutation.mutate({ maps: updated, keys })
    setSelectedName(null)
    setDraft(null)
  }

  const rate = maps?.usdExchangeRate ?? 7.3
  const mainCnyNumber = draft ? Number(draft.mainPriceCny) : Number.NaN
  const manualLaneCount = draft
    ? Object.values(draft.lanes).filter((lane) => lane.enabled).length
    : 0

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Model Pricing')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        {activeTab === 'pricing' ? (
          <div className='flex items-center gap-2'>
            <span className='text-muted-foreground text-sm whitespace-nowrap'>
              {t('Exchange rate')} 1 USD = ¥
            </span>
            <Input
              className='h-8 w-20'
              inputMode='decimal'
              value={rateDraft ?? String(rate)}
              onChange={(event) => setRateDraft(event.target.value)}
            />
            {rateDraft !== null && rateDraft !== String(rate) ? (
              <Button
                size='sm'
                variant='outline'
                disabled={rateMutation.isPending}
                onClick={() => {
                  const parsed = Number(rateDraft)
                  if (!Number.isFinite(parsed) || parsed <= 0) {
                    toast.error(t('Please enter a valid exchange rate'))
                    return
                  }
                  rateMutation.mutate(parsed)
                }}
              >
                {t('Save')}
              </Button>
            ) : null}
            <Button onClick={beginCreate}>
              <Plus className='size-4' />
              {t('Add model pricing')}
            </Button>
          </div>
        ) : null}
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex min-h-full flex-col gap-4'>
          <Tabs
            value={activeTab}
            onValueChange={(value) => value && setActiveTab(value as PricingTab)}
          >
            <TabsList className='w-fit'>
              <TabsTrigger value='pricing'>{t('Model Pricing')}</TabsTrigger>
              <TabsTrigger value='tool-prices'>{t('Tool prices')}</TabsTrigger>
              <TabsTrigger value='upstream-sync'>
                {t('Upstream price sync')}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {activeTab === 'tool-prices' && maps ? (
            <ToolPriceSettings
              defaultValue={maps.rawOptions['tool_price_setting.prices'] ?? ''}
            />
          ) : null}

          {activeTab === 'upstream-sync' && maps ? (
            <UpstreamRatioSync
              modelRatios={{
                ModelPrice: maps.rawOptions['ModelPrice'] ?? '{}',
                ModelRatio: maps.rawOptions['ModelRatio'] ?? '{}',
                CompletionRatio: maps.rawOptions['CompletionRatio'] ?? '{}',
                CacheRatio: maps.rawOptions['CacheRatio'] ?? '{}',
                CreateCacheRatio: maps.rawOptions['CreateCacheRatio'] ?? '{}',
                ImageRatio: maps.rawOptions['ImageRatio'] ?? '{}',
                AudioRatio: maps.rawOptions['AudioRatio'] ?? '{}',
                AudioCompletionRatio:
                  maps.rawOptions['AudioCompletionRatio'] ?? '{}',
                'billing_setting.billing_mode':
                  maps.rawOptions['billing_setting.billing_mode'] ?? '',
                'billing_setting.billing_expr':
                  maps.rawOptions['billing_setting.billing_expr'] ?? '',
              }}
            />
          ) : null}

          {activeTab === 'pricing' ? (
        <div className='grid min-h-full gap-4 lg:grid-cols-[340px_minmax(0,1fr)]'>
          <Card className='min-h-0'>
            <CardHeader>
              <CardTitle>{t('Models')}</CardTitle>
              <CardDescription>
                {t('All prices are in CNY per 1M tokens.')}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <Input
                placeholder={t('Filter models...')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className='flex flex-wrap gap-1.5'>
                {(
                  [
                    {
                      key: 'channel',
                      label: t('With Channel'),
                      count: statusCounts.channel,
                    },
                    { key: 'all', label: t('All'), count: statusCounts.all },
                    {
                      key: 'priced',
                      label: t('Priced'),
                      count: statusCounts.priced,
                    },
                    {
                      key: 'unpriced',
                      label: t('Unpriced'),
                      count: statusCounts.unpriced,
                    },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type='button'
                    onClick={() => setStatusFilter(item.key)}
                    className={cn(
                      'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                      statusFilter === item.key
                        ? 'border-foreground bg-foreground text-background'
                        : 'text-muted-foreground hover:bg-muted/60'
                    )}
                  >
                    {item.label} {item.count}
                  </button>
                ))}
              </div>
              {vendors.length > 0 ? (
                <div className='flex flex-wrap gap-1.5'>
                  {vendors.map((vendor) => (
                    <button
                      key={vendor.id}
                      type='button'
                      onClick={() =>
                        setVendorFilter(
                          vendorFilter === vendor.id ? null : vendor.id
                        )
                      }
                      className={cn(
                        'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                        vendorFilter === vendor.id
                          ? 'border-sky-600 bg-sky-600 text-white'
                          : 'text-muted-foreground hover:bg-muted/60'
                      )}
                    >
                      {vendor.name}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className='max-h-[calc(100vh-380px)] space-y-1 overflow-auto'>
                {mapsQuery.isLoading ? (
                  <p className='text-muted-foreground p-2 text-sm'>
                    {t('Loading...')}
                  </p>
                ) : null}
                {modelNames.map((name) => {
                  const isPerRequest = maps ? name in maps.modelPrice : false
                  const ratio = maps?.modelRatio[name]
                  const timedCount = maps?.timedPriceRules[name]?.length ?? 0
                  let priceLabel: React.ReactNode = '-'
                  if (!isPriced(name)) {
                    priceLabel = (
                      <span className='font-sans text-amber-600 dark:text-amber-400'>
                        {t('Unpriced')}
                      </span>
                    )
                  } else if (isPerRequest) {
                    priceLabel = `¥${formatCny(priceToCnyPerRequest(maps?.modelPrice[name] ?? 0, rate))}/${t('req')}`
                  } else if (ratio !== undefined) {
                    priceLabel = `¥${formatCny(ratioToCnyPerMillion(ratio, rate))}/1M`
                  }
                  return (
                    <button
                      key={name}
                      type='button'
                      onClick={() => selectModel(name)}
                      className={cn(
                        'hover:bg-muted/60 flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                        selectedName === name && 'bg-muted/60'
                      )}
                    >
                      <span className='min-w-0 truncate font-medium'>
                        {name}
                      </span>
                      <span className='text-muted-foreground flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums'>
                        {timedCount > 0 ? (
                          <Clock className='size-3 text-sky-500' />
                        ) : null}
                        {priceLabel}
                      </span>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card className='min-h-0'>
            <CardHeader>
              <CardTitle>
                {isCreating
                  ? t('Add model pricing')
                  : (selectedName ?? t('Model Pricing'))}
              </CardTitle>
              <CardDescription>
                {t(
                  'Set the main price in CNY per 1M tokens. Other prices are derived automatically unless overridden in advanced options.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {draft ? (
                <div className='flex flex-col gap-5'>
                  {isCreating ? (
                    <div className='space-y-1.5'>
                      <label
                        className='text-sm font-medium'
                        htmlFor='pricing-model-name'
                      >
                        {t('Model name')}
                      </label>
                      <Input
                        id='pricing-model-name'
                        className='md:w-[320px]'
                        value={draft.name}
                        onChange={(event) =>
                          updateDraft({ name: event.target.value })
                        }
                        placeholder='gpt-4o-mini'
                      />
                    </div>
                  ) : null}

                  <div className='space-y-1.5'>
                    <span className='text-sm font-medium'>
                      {t('Billing type')}
                    </span>
                    <Select
                      value={draft.mode}
                      onValueChange={(value) =>
                        value !== null &&
                        updateDraft({
                          mode: value as ModelPricingDraft['mode'],
                        })
                      }
                    >
                      <SelectTrigger className='w-full md:w-[320px]'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectItem value='per-token'>
                          {t('Pay per token')}
                        </SelectItem>
                        <SelectItem value='per-request'>
                          {t('Pay per request')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {draft.mode === 'per-request' ? (
                    <div className='space-y-1.5'>
                      <span className='text-sm font-medium'>{t('Price')}</span>
                      <div className='flex items-center gap-1.5'>
                        <span className='text-muted-foreground'>¥</span>
                        <Input
                          className='w-40'
                          inputMode='decimal'
                          value={draft.perRequestPriceCny}
                          onChange={(event) =>
                            updateDraft({
                              perRequestPriceCny: event.target.value,
                            })
                          }
                        />
                        <span className='text-muted-foreground text-sm'>
                          / {t('request')}
                        </span>
                      </div>
                      <p className='text-muted-foreground max-w-xl text-xs'>
                        {t(
                          'Per-request models charge a flat price per call and have no input/output/cache breakdown. Switch to pay-per-token to configure advanced prices and timed prices.'
                        )}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className='space-y-1.5'>
                        <span className='text-sm font-medium'>
                          {t('Main price (input)')}
                        </span>
                        <div className='flex items-center gap-1.5'>
                          <span className='text-muted-foreground'>¥</span>
                          <Input
                            className='w-40'
                            inputMode='decimal'
                            value={draft.mainPriceCny}
                            onChange={(event) =>
                              updateDraft({ mainPriceCny: event.target.value })
                            }
                          />
                          <span className='text-muted-foreground text-sm'>
                            / {t('1M tokens')}
                          </span>
                        </div>
                      </div>

                      <div className='rounded-md border'>
                        <button
                          type='button'
                          onClick={() => setAdvancedOpen(!advancedOpen)}
                          className='hover:bg-muted/40 flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2.5 text-left'
                        >
                          <div className='flex min-w-0 flex-wrap items-baseline gap-x-2'>
                            <span className='text-sm font-medium'>
                              {t('Advanced options')}
                            </span>
                            <span className='text-muted-foreground text-xs'>
                              {t('Output / cache / image / audio prices')}
                            </span>
                            {manualLaneCount > 0 ? (
                              <span className='text-xs font-medium text-sky-600 dark:text-sky-400'>
                                {t('{{count}} manual', {
                                  count: manualLaneCount,
                                })}
                              </span>
                            ) : (
                              <span className='text-muted-foreground/70 text-xs'>
                                {t('All auto')}
                              </span>
                            )}
                          </div>
                          <ChevronDown
                            className={cn(
                              'text-muted-foreground size-4 shrink-0 transition-transform',
                              advancedOpen && 'rotate-180'
                            )}
                          />
                        </button>
                        {advancedOpen ? (
                          <div className='space-y-2 border-t p-3'>
                            <p className='text-muted-foreground text-xs'>
                              {t(
                                'Prices left on auto follow the main price with default multipliers. Enable a switch to set a manual price.'
                              )}
                            </p>
                            {LANES.map((lane) => {
                              const laneDraft = draft.lanes[lane.key]
                              return (
                                <div
                                  key={lane.key}
                                  className='flex items-center gap-3'
                                >
                                  <Switch
                                    checked={laneDraft.enabled}
                                    onCheckedChange={(checked) =>
                                      updateDraft({
                                        lanes: {
                                          ...draft.lanes,
                                          [lane.key]: {
                                            ...laneDraft,
                                            enabled: checked === true,
                                          },
                                        },
                                      })
                                    }
                                  />
                                  <span className='w-32 text-sm'>
                                    {t(lane.labelKey)}
                                  </span>
                                  {laneDraft.enabled ? (
                                    <div className='flex items-center gap-1.5'>
                                      <span className='text-muted-foreground'>
                                        ¥
                                      </span>
                                      <Input
                                        className='w-32'
                                        inputMode='decimal'
                                        value={laneDraft.priceCny}
                                        onChange={(event) =>
                                          updateDraft({
                                            lanes: {
                                              ...draft.lanes,
                                              [lane.key]: {
                                                ...laneDraft,
                                                priceCny: event.target.value,
                                              },
                                            },
                                          })
                                        }
                                      />
                                      <span className='text-muted-foreground text-xs'>
                                        / {t('1M tokens')}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className='text-muted-foreground text-sm'>
                                      {t('Auto')}
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>

                      <div className='space-y-1.5'>
                        <span className='text-sm font-medium'>
                          {t('Timed prices')}
                        </span>
                        <TimedPriceEditor
                          rules={draft.timedRules}
                          onChange={(timedRules) => updateDraft({ timedRules })}
                          basePriceCny={
                            Number.isFinite(mainCnyNumber)
                              ? mainCnyNumber
                              : null
                          }
                        />
                      </div>
                    </>
                  )}

                  <div className='flex items-center gap-2'>
                    <Button
                      onClick={saveDraft}
                      disabled={saveMutation.isPending}
                    >
                      <Save className='size-4' />
                      {t('Save')}
                    </Button>
                    {!isCreating && selectedName ? (
                      <Button
                        variant='destructive'
                        onClick={deleteModelPricing}
                        disabled={saveMutation.isPending}
                      >
                        <Trash2 className='size-4' />
                        {t('Delete pricing')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className='text-muted-foreground text-sm'>
                  {t('Select a model on the left, or add a new pricing entry.')}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
          ) : null}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
