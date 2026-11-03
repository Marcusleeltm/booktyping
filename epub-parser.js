/* epub-parser.js – minimal EPUB → plain‑text extractor */
window.EPUBParser = (function () {
  async function parseEPUB(file) {
    const zip = await JSZip.loadAsync(file);

    // 1. container.xml → rootfile path
    const containerXml = await zip.file('META-INF/container.xml').async('string');
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, 'application/xml');
    const rootfilePath = containerDoc
      .querySelector('rootfile')
      .getAttribute('full-path');

    // 2. OPF → manifest + spine + metadata
    const opfXml = await zip.file(rootfilePath).async('string');
    const opfDoc = parser.parseFromString(opfXml, 'application/xml');

    const title =
      opfDoc.querySelector('metadata title')?.textContent?.trim() ||
      file.name.replace(/\.epub$/i, '');
    const author =
      opfDoc.querySelector('metadata creator')?.textContent?.trim() || '';

    const manifest = {};
    opfDoc.querySelectorAll('manifest item').forEach((item) => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      const mediaType = item.getAttribute('media-type');
      manifest[id] = { href, mediaType };
    });

    const spineIds = [...opfDoc.querySelectorAll('spine itemref')].map((el) =>
      el.getAttribute('idref')
    );

    // 3. TOC (optional, for better labels)
    const tocMap = {};
    const ncxId = Object.keys(manifest).find(
      (id) => manifest[id].mediaType === 'application/x-dtbncx+xml'
    );
    if (ncxId) {
      try {
        const ncxPath = manifest[ncxId].href;
        const ncxXml = await zip.file(resolvePath(rootfilePath, ncxPath)).async('string');
        const ncxDoc = parser.parseFromString(ncxXml, 'application/xml');
        ncxDoc.querySelectorAll('navPoint').forEach((np) => {
          const src = np.querySelector('content')?.getAttribute('src')?.split('#')[0];
          const label = np.querySelector('navLabel text')?.textContent?.trim();
          if (src && label) tocMap[src] = label;
        });
      } catch (_) { /* ignore TOC errors */ }
    }

    // 4. Extract text from each spine item
    const sections = [];
    for (const id of spineIds) {
      const item = manifest[id];
      if (!item || !item.href) continue;
      if (!/\.x?html?$/i.test(item.href)) continue; // skip non‑HTML
      const fullPath = resolvePath(rootfilePath, item.href);
      const fileInZip = zip.file(fullPath);
      if (!fileInZip) continue;

      const html = await fileInZip.async('string');
      const doc = parser.parseFromString(html, 'text/html');
      doc.querySelectorAll('script,style,nav,svg,img,figure,figcaption').forEach((el) => el.remove());
      let text = doc.body ? doc.body.textContent : doc.documentElement.textContent;
      text = text.replace(/\s+/g, ' ').trim();
      if (!text) continue; // empty section

      const label =
        tocMap[item.href] ||
        doc.querySelector('title')?.textContent?.trim() ||
        item.href.split('/').pop().replace(/\.x?html?$/i, '');
      sections.push({ id, href: item.href, label, text });
    }

    return { title, author, sections };
  }

  function resolvePath(basePath, relative) {
    const baseParts = basePath.split('/').slice(0, -1);
    const relParts = relative.split('/');
    for (const part of relParts) {
      if (part === '..') baseParts.pop();
      else if (part !== '.') baseParts.push(part);
    }
    return baseParts.join('/');
  }

  return { parseEPUB };
})();
