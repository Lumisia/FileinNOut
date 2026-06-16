import { test } from 'node:test'
import assert from 'node:assert/strict'
import { removeItemsByKeys, restoreRemovedItems } from './optimisticList.js'

const byId = (item) => item.id

test('removeItemsByKeys removes matching rows and records original indexes', () => {
  const items = [
    { id: 1, name: 'alpha' },
    { id: 2, name: 'beta' },
    { id: 3, name: 'gamma' },
  ]

  const result = removeItemsByKeys(items, [2, 3], byId)

  assert.deepEqual(result.nextItems, [{ id: 1, name: 'alpha' }])
  assert.deepEqual(result.removedEntries, [
    { index: 1, item: { id: 2, name: 'beta' } },
    { index: 2, item: { id: 3, name: 'gamma' } },
  ])
  assert.deepEqual(items.map((item) => item.id), [1, 2, 3], 'original array is not mutated')
})

test('restoreRemovedItems restores rows at their original positions', () => {
  const current = [{ id: 1, name: 'alpha' }]
  const removedEntries = [
    { index: 1, item: { id: 2, name: 'beta' } },
    { index: 2, item: { id: 3, name: 'gamma' } },
  ]

  assert.deepEqual(restoreRemovedItems(current, removedEntries, byId), [
    { id: 1, name: 'alpha' },
    { id: 2, name: 'beta' },
    { id: 3, name: 'gamma' },
  ])
})

test('restoreRemovedItems skips rows already present after a server refresh', () => {
  const current = [
    { id: 1, name: 'alpha' },
    { id: 2, name: 'beta from server' },
  ]
  const removedEntries = [
    { index: 1, item: { id: 2, name: 'beta' } },
    { index: 2, item: { id: 3, name: 'gamma' } },
  ]

  assert.deepEqual(restoreRemovedItems(current, removedEntries, byId), [
    { id: 1, name: 'alpha' },
    { id: 2, name: 'beta from server' },
    { id: 3, name: 'gamma' },
  ])
})
