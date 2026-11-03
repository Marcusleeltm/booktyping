/* epub-parser.js – extract plain text from EPUB using JSZip */
window.EPUBParser = (function () {
  async function parseEPUB(file) {
    const zip = await JSZip.loadAsync(file);
    const parser = new DOMParser();

    // container.xml → opf path
    const containerXml = await zip.file('META-INF/container.xml').async('string');
    const containerDoc = parser.parseFromString(containerXml, 'application/xml');
    const rootfilePath = containerDoc.querySelector('rootfile').getAttribute('full-path');

    // opf.xml → manifest, spine, metadata
    const opfXml = await zip.file(rootfilePath).async('string');
    const opf = parser.parseFromString(opfXml, 'application/xml');
    const title = opf.querySelector('metadata title')?.textContent?.trim()
                  || file.name.replace(/\.epub$/i, '');
    const author = opf.querySelector('metadata creator')?.textContent?.trim() || '';

    const manifest = {};
    opf.querySelectorAll('manifest item').forEach((it) => {
      manifest[it.getAttribute('id')] = {
        href: it.getAttribute('href'),
        mediaType: it.getAttribute('media-type'),
      };
    });

    const spineIds = [...opf.querySelectorAll('spine itemref')]
      .map((el) => el.getAttribute('idref'));

    // TOC labels (NCX or NAV)
    const tocMap = {};
    const ncxId = Object.keys(manifest).find(
      (id) => manifest[id].mediaType === 'application/x-dtbncx+xml'
    );
    if (ncxId) {
      try {
        const ncxXml = await zip.file(resolvePath(rootfilePath, manifest[ncxId].href)).async('string');
        const ncxDoc = parser.parseFromString(ncxXml, 'application/xml');
        ncxDoc.querySelectorAll('navPoint').forEach((np) => {
          const src = np.querySelector('content')?.getAttribute('src')?.split('#')[0];
          const label = np.querySelector('navLabel text')?.textContent?.trim();
          if (src && label) tocMap[src] = label;
        });
      } catch (_) {}
    }

    // Walk spine, extract text
    const sections = [];
    for (const id of spineIds) {
      const item = manifest[id];
      if (!item || !item.href || !/\.x?html?$/i.test(item.href)) continue;
      const fullPath = resolvePath(rootfilePath, item.href);
      const f = zip.file(fullPath);
      if (!f) continue;
      const html = await f.async('string');
      const doc = parser.parseFromString(html, 'text/html');
      doc.querySelectorAll('script,style,nav,svg,img,figure,figcaption').forEach((el) => el.remove());
      let text = (doc.body || doc.documentElement).textContent || '';
      text = text.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const label = tocMap[item.href]
                    || doc.querySelector('title')?.textContent?.trim()
                    || item.href.split('/').pop().replace(/\.x?html?$/i, '');
      sections.push({ id, href: item.href, label, text });
    }

    return { title, author, sections };
  }

  function resolvePath(basePath, relative) {
    const base = basePath.split('/').slice(0, -1);
    for (const part of relative.split('/')) {
      if (part === '..') base.pop();
      else if (part !== '.') base.push(part);
    }
    return base.join('/');
  }

  return { parseEPUB };
})();
