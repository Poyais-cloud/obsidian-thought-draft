export interface BlogTypeConfig {
  key: string
  label: string
  folder: string
  tags: string[]
  categoryPath: string[]
  mathjax?: boolean
  cover: string
  topImg: string
}

export const BLOG_TYPES: BlogTypeConfig[] = [
  {
    key: 'clawtime',
    label: 'ClawTime',
    folder: 'clawtime',
    tags: ['ClawTime'],
    categoryPath: ['ClawTime', '2026-广州南沙'],
    cover: 'false',
    topImg: 'false',
  },
  {
    key: 'compiler',
    label: '编译原理',
    folder: 'compiler',
    tags: ['编译原理'],
    categoryPath: ['SCNU期末试卷', '编译原理'],
    mathjax: true,
    cover: 'false',
    topImg: '/img/compiler-top.jpg',
  },
  {
    key: 'physics',
    label: '大学物理',
    folder: 'physics',
    tags: ['大学物理'],
    categoryPath: ['SCNU期末试卷', '大学物理'],
    mathjax: true,
    cover: 'false',
    topImg: '/img/physics-top.jpg',
  },
  {
    key: 'os',
    label: '操作系统',
    folder: 'os',
    tags: ['操作系统'],
    categoryPath: ['操作系统'],
    cover: 'false',
    topImg: 'false',
  },
  {
    key: 'frontend',
    label: '前端',
    folder: 'frontend',
    tags: ['前端面试'],
    categoryPath: ['前端面试'],
    cover: 'false',
    topImg: 'false',
  },
  {
    key: 'math',
    label: '数学',
    folder: 'math',
    tags: ['数学'],
    categoryPath: ['数学'],
    mathjax: true,
    cover: 'false',
    topImg: 'false',
  },
  {
    key: 'blog',
    label: '博客维护',
    folder: 'blog',
    tags: ['博客', 'Hexo'],
    categoryPath: ['博客维护'],
    cover: 'false',
    topImg: 'false',
  },
]

export function getBlogTypeConfig(key: string): BlogTypeConfig | undefined {
  return BLOG_TYPES.find(type => type.key === key)
}

export function formatCategoryPath(path: string[]): string {
  return path.join(' > ')
}
