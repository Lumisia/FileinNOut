const defaultKey = (item) => item?.id ?? item?.idx

const toKeySet = (keys = []) => new Set(
  Array.from(keys)
    .map((key) => String(key))
    .filter((key) => key !== 'undefined' && key !== 'null'),
)

export function removeItemsByKeys(items = [], keys = [], getKey = defaultKey) {
  const keySet = toKeySet(keys)
  const removedEntries = []
  const nextItems = []

  items.forEach((item, index) => {
    const key = String(getKey(item))
    if (keySet.has(key)) {
      removedEntries.push({ index, item })
      return
    }
    nextItems.push(item)
  })

  return { nextItems, removedEntries }
}

export function restoreRemovedItems(items = [], removedEntries = [], getKey = defaultKey) {
  const nextItems = [...items]
  const presentKeys = new Set(
    nextItems
      .map((item) => String(getKey(item)))
      .filter((key) => key !== 'undefined' && key !== 'null'),
  )

  ;[...removedEntries]
    .sort((left, right) => left.index - right.index)
    .forEach(({ index, item }) => {
      const key = String(getKey(item))
      if (presentKeys.has(key)) {
        return
      }
      const insertAt = Math.max(0, Math.min(Number(index) || 0, nextItems.length))
      nextItems.splice(insertAt, 0, item)
      presentKeys.add(key)
    })

  return nextItems
}
