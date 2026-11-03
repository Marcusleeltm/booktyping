/* charts.js – tiny inline SVG bar chart */
window.Charts = (function () {
  function barChart(container, values, opts = {}) {
    container.innerHTML = '';
    if (!values.length) {
      container.innerHTML = '<p class="muted" style="text-align:center;padding:2rem 0">No sessions yet.</p>';
      return;
    }
    const w = container.clientWidth || 600;
    const h = 180;
    const pad = 24;
    const max = Math.max(...values, 10);
    const barW = (w - pad * 2) / values.length - 4;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('preserveAspectRatio', 'none');

    values.forEach((v, i) => {
      const bh = ((h - pad * 2) * v) / max;
      const x = pad + i * (barW + 4);
      const y = h - pad - bh;
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', x);
      r.setAttribute('y', y);
      r.setAttribute('width', barW);
      r.setAttribute('height', bh);
      r.setAttribute('rx', 3);
      r.setAttribute('fill', 'var(--accent)');
      r.setAttribute('opacity', '0.85');
      svg.appendChild(r);

      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', x + barW / 2);
      t.setAttribute('y', h - 6);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', '9');
      t.setAttribute('fill', 'var(--muted)');
      t.textContent = i + 1;
      svg.appendChild(t);
    });

    const maxLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    maxLabel.setAttribute('x', 4);
    maxLabel.setAttribute('y', pad);
    maxLabel.setAttribute('font-size', '10');
    maxLabel.setAttribute('fill', 'var(--muted)');
    maxLabel.textContent = max;
    svg.appendChild(maxLabel);

    container.appendChild(svg);
  }

  return { barChart };
})();
