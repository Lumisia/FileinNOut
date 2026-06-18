export function parseVersionSnapshot(version = {}) {
  let parsed = null
  try {
    parsed = typeof version.contentSnapshot === 'string'
      ? JSON.parse(version.contentSnapshot)
      : version.contentSnapshot
  } catch (_) {
    parsed = null
  }

  return {
    versionNum: version.versionNum ?? null,
    title: version.titleSnapshot || '제목 없음',
    createdAt: version.createdAt ?? null,
    blocks: Array.isArray(parsed?.blocks) ? parsed.blocks : [],
  }
}

export function resolveVersionImageUrl(block, assetUrlById = new Map()) {
  const file = block?.data?.file || {}
  const assetId = file.assetIdx
  const freshUrl = assetId == null
    ? ''
    : (assetUrlById instanceof Map
        ? assetUrlById.get(String(assetId))
        : assetUrlById?.[String(assetId)])

  return freshUrl || file.url || ''
}

export function hydrateVersionImageUrls(blocks = [], assetUrlById = new Map()) {
  return (Array.isArray(blocks) ? blocks : []).map((block) => {
    if (block?.type !== 'image') return block
    const url = resolveVersionImageUrl(block, assetUrlById)
    if (!url) return block

    return {
      ...block,
      data: {
        ...block.data,
        file: {
          ...block.data?.file,
          url,
        },
      },
    }
  })
}
