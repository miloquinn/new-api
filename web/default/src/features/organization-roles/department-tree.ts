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

import type { OrganizationDepartment } from './types'

export const UNASSIGNED_DEPARTMENT_ID = 0

export type DepartmentTreeNode = OrganizationDepartment & {
  children: DepartmentTreeNode[]
}

export function buildDepartmentTree(
  departments: OrganizationDepartment[]
): DepartmentTreeNode[] {
  const nodes = new Map<number, DepartmentTreeNode>()
  for (const dept of departments) {
    nodes.set(dept.id, { ...dept, children: [] })
  }
  const roots: DepartmentTreeNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parent_id === 0 ? null : nodes.get(node.parent_id)
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  const sortNodes = (list: DepartmentTreeNode[]) => {
    list.sort((a, b) => a.sort - b.sort || a.id - b.id)
    for (const item of list) {
      sortNodes(item.children)
    }
  }
  sortNodes(roots)
  return roots
}

/** Collect a department id plus all of its descendants' ids. */
export function collectSubtreeIds(node: DepartmentTreeNode): number[] {
  const ids = [node.id]
  for (const child of node.children) {
    ids.push(...collectSubtreeIds(child))
  }
  return ids
}
