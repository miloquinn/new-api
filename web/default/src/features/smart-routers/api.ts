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

import type { ApiResponse, SmartRouter, SmartRouterPayload } from './types'

export async function getSmartRouters(): Promise<ApiResponse<SmartRouter[]>> {
  const res = await api.get('/api/smart_router/')
  return res.data
}

export async function createSmartRouter(
  payload: SmartRouterPayload
): Promise<ApiResponse<SmartRouter>> {
  const res = await api.post('/api/smart_router/', payload)
  return res.data
}

export async function updateSmartRouter(
  payload: SmartRouterPayload & { id: number }
): Promise<ApiResponse<SmartRouter>> {
  const res = await api.put('/api/smart_router/', payload)
  return res.data
}

export async function deleteSmartRouter(id: number): Promise<ApiResponse> {
  const res = await api.delete(`/api/smart_router/${id}`)
  return res.data
}
