import _ from 'lodash'
import sanitizeHtml from 'sanitize-html'
import * as nomos from 'nomos-client'
import { parseLink, loadHtml, syncScrapedToExistingDocument, generateDocumentActions } from 'nomos-client/lib/scraper'
import { amap } from 'nomos-client/lib/utils'

function cleanContent (html) {
  return html && sanitizeHtml(html, {
    // exclusiveFilter doesn't work if allowedTags has already stripped the tag
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1','h2']),
    exclusiveFilter: frame => ['h1','h2'].includes(frame.tag) || (frame.tag !== 'br' && !frame.text.trim())
  }).trim()
}

function getLinks ($, selector) {
  return $(selector).map((i, a) =>
    parseLink(a, { $, baseUrl: 'http://www.seattle.gov/police-manual' })
  ).get()
}

function getTitleAndContent ($el) {
  const contentEl = $el.find('.MainColumnXHTMLCopyComponent').length > 1 ?
    $el.find('.MainColumnXHTMLCopyComponent').first() :
    $el.find('div.span')

  return {
    title: $el.find('h1').text(),
    contents: cleanContent(contentEl.html())
  }
}

async function scrapeSection (link) {
  const { $ } = await loadHtml({ url: link.url })
  const section = getTitleAndContent($('main'))
  const subsections = getLinks($, '.mainColNav .navlist a')
  const children = await amap(subsections, scrapeSection)
  return {
    ...section,
    children
  }
}

async function scrapeSeattlePolicePolicy (policyRoot) {
  const { $ } = await loadHtml({ url: policyRoot.metadata.url })
  const sidebarLinks = getLinks($, '#primaryTier > li > a')
  const policy = {
    ...policyRoot,
    children: await amap(sidebarLinks, scrapeSection)
  }
  return policy
}

async function main ({ existingDocumentId } = {}) {
  try {
    console.log('scraping seattle pd policy...')
    const scrapedPolicy = await scrapeSeattlePolicePolicy({
      title: 'Seattle Police Department Manual',
      contents: 'This is an unofficial copy of the Seattle PD manual. The official manual can be found at <a href="http://www.seattle.gov/police-manual">http://www.seattle.gov/police-manual</a>.',
      metadata: { url: 'http://www.seattle.gov/police-manual' },
      syncKey: 'Seattle Police Department Manual'
    })

    console.log('scrape finished, syncing with nomos...')
    const syncActions = generateDocumentActions(nomos, { type: 'policy', subtype: 'department_policy', locale: 'seattle', })
    await syncScrapedToExistingDocument(scrapedPolicy, existingDocumentId, {
      'keep': syncActions.keepDocument,
      'update': syncActions.updateDocument,
      'create': syncActions.createDocument,
      'delete': syncActions.removeDocument,
    })

    return { status: 'ok' }
  } catch (err) {
    console.error(err)
  }
}
main({ existingDocumentId: 'b6d62275-e05a-427c-94e9-a436bbaa8ed5' })

