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
import { Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getEnabledModels } from '@/features/channels/api'
import { cn } from '@/lib/utils'

import {
  createSmartRouter,
  deleteSmartRouter,
  getSmartRouters,
  updateSmartRouter,
} from './api'
import type { SmartRouter, SmartRouterPayload, SmartRouterStrategy } from './types'

type RouterDraft = SmartRouterPayload

const smartRoutersQueryKey = ['smart-routers'] as const
const enabledModelsQueryKey = ['smart-routers-enabled-models'] as const

const STRATEGY_LABEL_KEYS: Record<SmartRouterStrategy, string> = {
  cost_first: 'Cost first',
  priority: 'Priority order',
}

function blankDraft(): RouterDraft {
  return {
    name: '',
    description: '',
    strategy: 'cost_first',
    models: [],
    enabled: true,
  }
}

function routerToDraft(router: SmartRouter): RouterDraft {
  return {
    id: router.id,
    name: router.name,
    description: router.description ?? '',
    strategy: router.strategy,
    models: Array.isArray(router.models) ? router.models : [],
    enabled: router.enabled,
  }
}

export function SmartRouters() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<RouterDraft | null>(null)
  const [modelFilter, setModelFilter] = useState('')

  const routersQuery = useQuery({
    queryKey: smartRoutersQueryKey,
    queryFn: getSmartRouters,
  })
  const routers = useMemo(
    () => routersQuery.data?.data ?? [],
    [routersQuery.data]
  )

  const modelsQuery = useQuery({
    queryKey: enabledModelsQueryKey,
    queryFn: getEnabledModels,
    staleTime: 60 * 1000,
  })
  const allModels = useMemo(
    () => modelsQuery.data?.data ?? [],
    [modelsQuery.data]
  )

  useEffect(() => {
    if (selectedId !== null || routers.length === 0) {
      return
    }
    setSelectedId(routers[0].id)
    setDraft(routerToDraft(routers[0]))
  }, [routers, selectedId])

  const saveMutation = useMutation({
    mutationFn: async (payload: RouterDraft) => {
      if (payload.id) {
        return updateSmartRouter({ ...payload, id: payload.id })
      }
      return createSmartRouter(payload)
    },
    onSuccess: async (result) => {
      if (!result.success || !result.data) {
        if (result.message) toast.error(result.message)
        return
      }
      toast.success(t('Smart router saved successfully'))
      await queryClient.invalidateQueries({ queryKey: smartRoutersQueryKey })
      setSelectedId(result.data.id)
      setDraft(routerToDraft(result.data))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSmartRouter,
    onSuccess: async (result) => {
      if (!result.success) {
        if (result.message) toast.error(result.message)
        return
      }
      toast.success(t('Smart router deleted successfully'))
      await queryClient.invalidateQueries({ queryKey: smartRoutersQueryKey })
      setSelectedId(null)
      setDraft(null)
    },
  })

  const beginCreate = () => {
    setSelectedId('new')
    setDraft(blankDraft())
  }

  const selectRouter = (router: SmartRouter) => {
    setSelectedId(router.id)
    setDraft(routerToDraft(router))
  }

  const updateDraft = (patch: Partial<RouterDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }

  const toggleModel = (modelName: string, checked: boolean) => {
    if (!draft) return
    if (checked) {
      if (draft.models.includes(modelName)) return
      updateDraft({ models: [...draft.models, modelName] })
      return
    }
    updateDraft({ models: draft.models.filter((m) => m !== modelName) })
  }

  const saveDraft = () => {
    if (!draft) return
    if (!draft.name.trim()) {
      toast.error(t('Router name is required'))
      return
    }
    if (draft.models.length === 0) {
      toast.error(t('Select at least one candidate model'))
      return
    }
    saveMutation.mutate({ ...draft, name: draft.name.trim() })
  }

  const deleteDraft = () => {
    if (!draft?.id) return
    deleteMutation.mutate(draft.id)
  }

  const filteredModels = useMemo(() => {
    const keyword = modelFilter.trim().toLowerCase()
    if (!keyword) return allModels
    return allModels.filter((m) => m.toLowerCase().includes(keyword))
  }, [allModels, modelFilter])

  const isLoading = routersQuery.isLoading

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Smart Routing')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button onClick={beginCreate}>
          <Plus className='size-4' />
          {t('New smart router')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='grid min-h-full gap-4 lg:grid-cols-[340px_minmax(0,1fr)]'>
          <Card className='min-h-0'>
            <CardHeader>
              <CardTitle>{t('Smart Routing')}</CardTitle>
              <CardDescription>
                {t(
                  'Expose a virtual model that automatically routes each request to a candidate model by strategy.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='max-h-[calc(100vh-260px)] overflow-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Router')}</TableHead>
                      <TableHead className='w-24 text-right'>
                        {t('Strategy')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={2}>{t('Loading...')}</TableCell>
                      </TableRow>
                    ) : null}
                    {routers.map((router) => (
                      <TableRow
                        key={router.id}
                        className={cn(
                          'cursor-pointer',
                          selectedId === router.id && 'bg-muted/60'
                        )}
                        onClick={() => selectRouter(router)}
                      >
                        <TableCell className='whitespace-normal'>
                          <div className='flex min-w-0 flex-col gap-1'>
                            <div className='flex items-center gap-2'>
                              <span className='font-medium'>{router.name}</span>
                              {!router.enabled ? (
                                <Badge variant='outline'>{t('Disabled')}</Badge>
                              ) : null}
                            </div>
                            <span className='text-muted-foreground text-xs'>
                              {t('{{count}} candidate models', {
                                count: Array.isArray(router.models)
                                  ? router.models.length
                                  : 0,
                              })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className='text-right'>
                          <Badge variant='secondary'>
                            {t(STRATEGY_LABEL_KEYS[router.strategy])}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className='min-h-0'>
            <CardHeader>
              <CardTitle>
                {draft?.id ? t('Edit smart router') : t('Create smart router')}
              </CardTitle>
              <CardDescription>
                {t(
                  'Requests to this model name will be routed to the first available candidate.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {draft ? (
                <div className='flex flex-col gap-5'>
                  <div className='grid gap-3 md:grid-cols-[240px_1fr_140px]'>
                    <div className='space-y-1.5'>
                      <label
                        className='text-sm font-medium'
                        htmlFor='router-name'
                      >
                        {t('Router name')}
                      </label>
                      <Input
                        id='router-name'
                        value={draft.name}
                        onChange={(event) =>
                          updateDraft({ name: event.target.value })
                        }
                        placeholder='auto-cheap'
                      />
                    </div>
                    <div className='space-y-1.5'>
                      <label
                        className='text-sm font-medium'
                        htmlFor='router-description'
                      >
                        {t('Description')}
                      </label>
                      <Input
                        id='router-description'
                        value={draft.description ?? ''}
                        onChange={(event) =>
                          updateDraft({ description: event.target.value })
                        }
                        placeholder={t('Optional description')}
                      />
                    </div>
                    <div className='space-y-1.5'>
                      <span className='text-sm font-medium'>{t('Enabled')}</span>
                      <div className='flex h-9 items-center'>
                        <Switch
                          checked={draft.enabled}
                          onCheckedChange={(checked) =>
                            updateDraft({ enabled: checked })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className='space-y-1.5'>
                    <span className='text-sm font-medium'>{t('Strategy')}</span>
                    <Select
                      value={draft.strategy}
                      onValueChange={(value) =>
                        value !== null &&
                        updateDraft({ strategy: value as SmartRouterStrategy })
                      }
                    >
                      <SelectTrigger className='w-full md:w-[320px]'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectItem value='cost_first'>
                          {t('Cost first')} —{' '}
                          {t('pick the cheapest available candidate')}
                        </SelectItem>
                        <SelectItem value='priority'>
                          {t('Priority order')} —{' '}
                          {t('pick the first available candidate in list order')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className='space-y-1.5'>
                    <div className='flex items-center justify-between gap-2'>
                      <span className='text-sm font-medium'>
                        {t('Candidate models')}
                        {draft.models.length > 0
                          ? ` (${draft.models.length})`
                          : ''}
                      </span>
                      <Input
                        className='h-8 w-56'
                        value={modelFilter}
                        onChange={(event) => setModelFilter(event.target.value)}
                        placeholder={t('Filter models...')}
                      />
                    </div>
                    {draft.models.length > 0 ? (
                      <div className='flex flex-wrap gap-1.5'>
                        {draft.models.map((modelName) => (
                          <Badge
                            key={modelName}
                            variant='secondary'
                            className='cursor-pointer'
                            onClick={() => toggleModel(modelName, false)}
                          >
                            {modelName} ×
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    <div className='max-h-72 overflow-auto rounded-md border p-2'>
                      {modelsQuery.isLoading ? (
                        <div className='text-muted-foreground p-2 text-sm'>
                          {t('Loading...')}
                        </div>
                      ) : (
                        <div className='grid gap-1 md:grid-cols-2 lg:grid-cols-3'>
                          {filteredModels.map((modelName) => (
                            <label
                              key={modelName}
                              className='hover:bg-muted/60 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm'
                            >
                              <Checkbox
                                checked={draft.models.includes(modelName)}
                                onCheckedChange={(checked) =>
                                  toggleModel(modelName, checked === true)
                                }
                              />
                              <span className='truncate'>{modelName}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className='text-muted-foreground text-xs'>
                      {t(
                        'With cost first, candidates are re-sorted by estimated price on every request; cheaper models are tried first.'
                      )}
                    </p>
                  </div>

                  <div className='flex items-center gap-2'>
                    <Button onClick={saveDraft} disabled={saveMutation.isPending}>
                      <Save className='size-4' />
                      {t('Save')}
                    </Button>
                    {draft.id ? (
                      <Button
                        variant='destructive'
                        onClick={deleteDraft}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className='size-4' />
                        {t('Delete')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className='text-muted-foreground text-sm'>
                  {t('Select a smart router on the left, or create a new one.')}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
