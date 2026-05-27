import { marked } from 'marked'

const themeCSS = `
  .mp-content { max-width: 100%; word-wrap: break-word; }
  .mp-content h1 { font-size: 1.4em; font-weight: 700; margin: 0.8em 0 0.4em; text-align: center; }
  .mp-content h2 { font-size: 1.2em; font-weight: 600; margin: 0.7em 0 0.3em; }
  .mp-content h3 { font-size: 1.05em; font-weight: 600; margin: 0.6em 0 0.2em; }
  .mp-content p { margin: 0.5em 0; line-height: 1.8; letter-spacing: 0.5px; }
  .mp-content strong { color: #3d3929; }
  .mp-content blockquote { border-left: 3px solid #b8956a; padding-left: 0.8em; color: #888; margin: 0.5em 0; }
  .mp-content code { background: #f0f0f0; padding: 0.15em 0.3em; border-radius: 3px; font-size: 0.9em; }
  .mp-content pre { background: #f5f5f5; padding: 0.8em 1em; border-radius: 6px; overflow-x: auto; margin: 0.5em 0; font-size: 0.85em; line-height: 1.6; }
  .mp-content pre code { background: none; padding: 0; }
  .mp-content ul, .mp-content ol { padding-left: 1.5em; margin: 0.4em 0; }
  .mp-content li { margin: 0.2em 0; line-height: 1.7; }
  .mp-content a { color: #5b7b6f; }
  .mp-content img { max-width: 100%; border-radius: 6px; }
  .mp-content table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
  .mp-content th, .mp-content td { border: 1px solid #ddd; padding: 0.4em 0.6em; text-align: left; font-size: 0.9em; }
  .mp-content th { background: #f5f5f5; font-weight: 600; }
  .mp-content hr { border: none; border-top: 1px solid #e0e0e0; margin: 1.2em 0; }
`

async function inlineCSS(html: string, css: string): Promise<string> {
  const juice = await import('juice')
  const juiceFn = juice.default
  return juiceFn(html, { extraCss: css })
}

export async function markdownToWechatHTML(markdown: string): Promise<string> {
  const rawHTML = marked.parse(markdown) as string
  const wrapped = `<div class="mp-content">${rawHTML}</div>`
  const inlined = await inlineCSS(wrapped, themeCSS)
  const match = inlined.match(/<div class="mp-content"[^>]*>([\s\S]*)<\/div>/i)
  return match ? match[0] : inlined
}
