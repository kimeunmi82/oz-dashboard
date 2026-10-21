
(async function () {
  const lx = document.getElementById('top');
  const f0 = d3.format(',');
  const won = (v) => f0(Math.round(v)) + '원';
  const N = (rows, keys) => rows.map((r) => { const o = { ...r }; keys.forEach((k) => { o[k] = +r[k]; }); return o; });
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const tip = h('div', 'lx-tip'); tip.hidden = true; lx.appendChild(tip);
  const showTip = (ev, lines) => {
    tip.replaceChildren(...lines.map((t) => h('div', '', t))); tip.hidden = false;
    const b = lx.getBoundingClientRect();
    tip.style.left = Math.max(4, Math.min(ev.clientX - b.left + 12, b.width - tip.offsetWidth - 4)) + 'px';
    tip.style.top = (ev.clientY - b.top + 14) + 'px';
  };
  const hideTip = () => { tip.hidden = true; };
  const IDS = ['kpi', 'cls_summary', 'dx_cls', 'region', 'monthly', 'inst_outliers', 'rx_class', 'monthly_compare', 'abx_by_cls', 'abx_by_dx'];
  const DATA = {};
  await Promise.all(IDS.map((id) => fetch('data/' + id + '.json').then((r) => { if (!r.ok) throw new Error(id); return r.json(); }).then((d) => { DATA[id] = d; }).catch(() => { DATA[id] = null; })));
  const state = (box, id) => {
    const d = DATA[id];
    if (d) { box.classList.remove('dash-skeleton'); return d; }
    box.classList.remove('dash-skeleton');
    if (box.tagName === 'TABLE') tbody(box).replaceChildren();
    else { const e = h('div', 'lx-err'); e.append(h('i'), h('span', '', 'Failed to load')); box.replaceChildren(e); }
    return null;
  };
  const tbody = (t) => t.querySelector('tbody') || t.appendChild(document.createElement('tbody'));
  const accent = () => 'var(--accent)';

  const rangeChart = (box, rows, labelKey) => {
    const max = d3.max(rows, (r) => r.p75) * 1.1;
    const x = d3.scaleLinear([0, max], [0, 100]);
    const wrap = h('div', 'lx-rchart');
    rows.forEach((r) => {
      const row = h('div', 'lx-rrow');
      const l = h('div', 'lx-rl', r[labelKey]); l.appendChild(h('small', '', 'n=' + f0(r.n)));
      const tr = h('div', 'lx-track');
      const rg = h('i', 'lx-range'); rg.style.left = x(r.p25) + '%'; rg.style.width = (x(r.p75) - x(r.p25)) + '%';
      const md = h('i', 'lx-med'); md.style.left = x(r.median) + '%'; md.style.background = accent();
      tr.append(rg, md);
      if (r.adj_median != null) { const a = h('i', 'lx-adj'); a.style.left = x(r.adj_median) + '%'; tr.appendChild(a); }
      row.append(l, tr, h('div', 'lx-rv', won(r.median)));
      row.addEventListener('mousemove', (ev) => showTip(ev, [r[labelKey] + ' · n=' + f0(r.n), '중앙값 ' + won(r.median), 'P25–P75 ' + f0(r.p25) + ' – ' + f0(r.p75) + '원'].concat(r.adj_median != null ? ['보정 중앙값 ' + won(r.adj_median)] : [])));
      row.addEventListener('mouseleave', hideTip);
      wrap.appendChild(row);
    });
    const ov = h('div', 'lx-ov');
    x.ticks(4).forEach((t) => { const g = h('div', 'lx-gl'); g.style.left = x(t) + '%'; g.appendChild(h('span', 'lx-gt', f0(t))); ov.appendChild(g); });
    wrap.appendChild(ov);
    box.replaceChildren(wrap);
  };

  const barRows = (box, rows, labelKey, valKey, fmt, subKey) => {
    const max = d3.max(rows, (r) => r[valKey]) * 1.1;
    const x = d3.scaleLinear([0, max], [0, 100]);
    const wrap = h('div', 'lx-rchart'); wrap.style.paddingBottom = '0';
    rows.forEach((r) => {
      const row = h('div', 'lx-rrow');
      const l = h('div', 'lx-rl', r[labelKey]); if (subKey) l.appendChild(h('small', '', r[subKey]));
      const tr = h('div', 'lx-track'); const b = h('i', 'lx-bar'); b.style.width = x(r[valKey]) + '%'; b.style.background = accent(); tr.appendChild(b);
      row.append(l, tr, h('div', 'lx-rv', fmt(r[valKey])));
      row.addEventListener('mousemove', (ev) => showTip(ev, [r[labelKey], fmt(r[valKey])]));
      row.addEventListener('mouseleave', hideTip);
      wrap.appendChild(row);
    });
    box.replaceChildren(wrap);
  };

  const heat = (box, rows) => {
    const cls = ['상급종합', '종합병원', '병원', '의원'];
    const dxs = [...new Set(rows.map((r) => r.dx))];
    const mx = d3.max(rows, (r) => r.median);
    const g = h('div', 'lx-heat');
    g.appendChild(h('div'));
    cls.forEach((c) => g.appendChild(h('div', 'lx-hh', c)));
    dxs.forEach((d) => {
      g.appendChild(h('div', 'lx-hl', d));
      cls.forEach((c) => {
        const r = rows.find((q) => q.dx === d && q.cl === c);
        const cell = h('div', 'lx-hc' + (r && r.n < 30 ? ' low' : ''));
        if (r) {
          const pctv = Math.round(10 + 50 * r.median / mx);
          cell.style.background = 'color-mix(in srgb, ' + accent() + ' ' + pctv + '%, transparent)';
          cell.append(h('span', '', f0(r.median)), h('small', '', 'n=' + f0(r.n)));
          cell.addEventListener('mousemove', (ev) => showTip(ev, [d + ' · ' + c, '중앙값 ' + won(r.median), 'n=' + f0(r.n) + (r.n < 30 ? ' (표본 적음)' : '')]));
          cell.addEventListener('mouseleave', hideTip);
        }
        g.appendChild(cell);
      });
    });
    box.replaceChildren(g);
  };

  const svgBase = (box, hgt) => {
    const w = box.clientWidth || 320;
    box.replaceChildren();
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', '0 0 ' + w + ' ' + hgt).style('display', 'block');
    return { svg, w };
  };
  const frame = (svg, x, y, w, hgt, m, labelEvery, xs) => {
    y.ticks(4).forEach((t) => {
      svg.append('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', 'var(--cds-chart-grid)');
      svg.append('text').attr('x', m.l - 6).attr('y', y(t) + 4).attr('text-anchor', 'end').text(f0(t));
    });
    xs.forEach((mo, i) => { if (i % labelEvery === 0) svg.append('text').attr('x', x(mo)).attr('y', hgt - 6).attr('text-anchor', 'middle').text(mo.slice(2).replace('-', '.')); });
  };
  const barChart = (box, rows) => {
    const hgt = 200, m = { l: 48, r: 8, t: 10, b: 26 };
    const { svg, w } = svgBase(box, hgt);
    const xs = rows.map((r) => r.month);
    const x = d3.scaleBand(xs, [m.l, w - m.r]).padding(0.25);
    const y = d3.scaleLinear([0, d3.max(rows, (r) => r.n)], [hgt - m.b, m.t]).nice();
    const xc = (mo) => x(mo) + x.bandwidth() / 2;
    frame(svg, xc, y, w, hgt, m, w < 420 ? 4 : 3, xs);
    rows.forEach((r) => {
      svg.append('rect').attr('x', x(r.month)).attr('width', x.bandwidth()).attr('y', y(r.n)).attr('height', y(0) - y(r.n)).attr('rx', 2).attr('fill', accent())
        .on('mousemove', (ev) => showTip(ev, [r.month, f0(r.n) + '건'])).on('mouseleave', hideTip);
    });
  };
  const lineChart = (box, rows) => {
    const hgt = 200, m = { l: 48, r: 12, t: 10, b: 26 };
    const { svg, w } = svgBase(box, hgt);
    const xs = rows.map((r) => r.month);
    const x = d3.scalePoint(xs, [m.l, w - m.r]);
    const y = d3.scaleLinear([d3.min(rows, (r) => r.median) * 0.9, d3.max(rows, (r) => r.median) * 1.05], [hgt - m.b, m.t]).nice();
    frame(svg, x, y, w, hgt, m, w < 420 ? 4 : 3, xs);
    svg.append('path').datum(rows).attr('d', d3.line().x((r) => x(r.month)).y((r) => y(r.median))).attr('fill', 'none').attr('stroke', accent()).attr('stroke-width', 2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
    const last = rows[rows.length - 1];
    svg.append('circle').attr('cx', x(last.month)).attr('cy', y(last.median)).attr('r', 4).attr('fill', accent()).attr('stroke', 'var(--color-panel)').attr('stroke-width', 2);
    const rule = svg.append('line').attr('y1', m.t).attr('y2', hgt - m.b).attr('stroke', 'var(--cds-chart-axis)').attr('stroke-dasharray', '3 3').attr('visibility', 'hidden');
    const dot = svg.append('circle').attr('r', 4).attr('fill', accent()).attr('stroke', 'var(--color-panel)').attr('stroke-width', 2).attr('visibility', 'hidden');
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', w - m.l - m.r).attr('height', hgt - m.t - m.b).attr('fill', 'transparent')
      .on('mousemove', (ev) => {
        const px = ev.clientX - svg.node().getBoundingClientRect().left;
        const r = rows.reduce((a, b) => (Math.abs(x(b.month) - px) < Math.abs(x(a.month) - px) ? b : a));
        rule.attr('x1', x(r.month)).attr('x2', x(r.month)).attr('visibility', 'visible');
        dot.attr('cx', x(r.month)).attr('cy', y(r.median)).attr('visibility', 'visible');
        showTip(ev, [r.month, '중앙값 ' + won(r.median), 'n=' + f0(r.n)]);
      }).on('mouseleave', () => { rule.attr('visibility', 'hidden'); dot.attr('visibility', 'hidden'); hideTip(); });
  };


  const pctTxt = (v) => (v == null ? '비교 불가' : (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%');
  const flagTxt = (v) => (v >= 0 ? '▲ 증가' : '▼ 감소');
  let chosen = null;
  const renderChange = () => {
    const rows = DATA.monthly_compare; if (!rows) return;
    const sel = document.getElementById('sel-month');
    if (!sel.options.length) {
      rows.slice().reverse().forEach((r) => sel.appendChild(new Option(r.month, r.month)));
      sel.addEventListener('change', () => { chosen = sel.value; renderChange(); });
    }
    chosen = chosen || rows[rows.length - 1].month; sel.value = chosen;
    const r = rows.find((q) => q.month === chosen);
    const tiles = document.getElementById('chg-tiles'); tiles.replaceChildren();
    const tile = (lbl, big, sub, hi) => { const t = h('div', 'lx-kpi lx-chg'); t.append(h('span', 'lbl', lbl)); const v = h('span', 'val' + (hi ? ' hi' : ''), big); t.append(v); if (sub) t.append(h('small', 'lbl', sub)); tiles.appendChild(t); };
    tile(chosen + ' 청구 건수', f0(r.n) + '건');
    tile('전년 동월 대비', pctTxt(r.yoy), r.yoy_n != null ? '전년 ' + f0(r.yoy_n) + '건' + (r.flag ? ' · ' + flagTxt(r.yoy) + ' (±10% 이상)' : ' · 정상 범위') : '전년 값 없음', r.flag === 1);
    tile('전월 대비 (참고)', pctTxt(r.mom), r.mom_n != null ? '전월 ' + f0(r.mom_n) + '건 · 계절 변동 포함' : '전월 값 없음');
    // YoY bars with +/-10% band
    const box = document.getElementById('ch-yoy'); const hgt = 200, m = { l: 48, r: 8, t: 10, b: 26 };
    const { svg, w } = svgBase(box, hgt);
    const xs = rows.map((q) => q.month);
    const x = d3.scaleBand(xs, [m.l, w - m.r]).padding(0.25);
    const lim = Math.max(0.4, d3.max(rows, (q) => Math.abs(q.yoy || 0)) * 1.1);
    const y = d3.scaleLinear([-lim, lim], [hgt - m.b, m.t]);
    svg.append('rect').attr('x', m.l).attr('width', w - m.l - m.r).attr('y', y(0.1)).attr('height', y(-0.1) - y(0.1)).attr('fill', 'var(--cds-chart-grid)');
    [-0.4, -0.2, 0, 0.2, 0.4].filter((t) => Math.abs(t) <= lim).forEach((t) => {
      svg.append('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', t === 0 ? 'var(--cds-chart-axis)' : 'var(--cds-chart-grid)');
      svg.append('text').attr('x', m.l - 6).attr('y', y(t) + 4).attr('text-anchor', 'end').text((t > 0 ? '+' : '') + Math.round(t * 100) + '%');
    });
    xs.forEach((mo, i) => { if (i % (w < 420 ? 4 : 3) === 0) svg.append('text').attr('x', x(mo) + x.bandwidth() / 2).attr('y', hgt - 6).attr('text-anchor', 'middle').text(mo.slice(2).replace('-', '.')); });
    rows.forEach((q) => {
      if (q.yoy == null) return;
      svg.append('rect').attr('x', x(q.month)).attr('width', x.bandwidth()).attr('y', Math.min(y(0), y(q.yoy))).attr('height', Math.max(1, Math.abs(y(q.yoy) - y(0)))).attr('rx', 2)
        .attr('fill', q.flag ? 'var(--cds-chart-status-critical)' : accent()).attr('opacity', q.month === chosen ? 1 : 0.75)
        .attr('stroke', q.month === chosen ? 'var(--color-fg)' : 'none')
        .on('mousemove', (ev) => showTip(ev, [q.month, '전년 대비 ' + pctTxt(q.yoy), f0(q.n) + '건 / 전년 ' + f0(q.yoy_n) + '건'])).on('mouseleave', hideTip)
        .on('click', () => { chosen = q.month; renderChange(); });
    });
    const body = tbody(document.getElementById('tb-change')); body.replaceChildren();
    rows.slice().reverse().forEach((q) => {
      const tr = h('tr'); if (q.month === chosen) tr.style.background = 'var(--cds-chart-grid)';
      [q.month, f0(q.n), q.yoy_n != null ? f0(q.yoy_n) : '—', pctTxt(q.yoy) + (q.flag ? ' ' + flagTxt(q.yoy).slice(0, 1) : ''), pctTxt(q.mom)].forEach((t, i) => {
        const td = h('td', i === 3 && q.flag ? 'hi' : '', t); if (i === 0) td.style.textAlign = 'left'; tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  };

  const render = () => {
    renderChange();
    document.querySelectorAll('.sw-med').forEach((e) => { e.style.background = accent(); });
    document.querySelectorAll('[data-metric]').forEach((el) => {
      if (!DATA.kpi) { el.textContent = '—'; return; }
      const row = DATA.kpi.find((r) => r.metric === el.dataset.metric); if (!row) return;
      const v = +row.value;
      el.textContent = row.metric === 'j_share' ? v.toFixed(1) : row.metric === 'gap_ratio' ? v.toFixed(2) : f0(v);
    });
    let d;
    if ((d = state(document.getElementById('ch-class'), 'cls_summary'))) rangeChart(document.getElementById('ch-class'), N(d, ['n', 'p25', 'median', 'p75', 'adj_median']), 'cl');
    if ((d = state(document.getElementById('ch-dx'), 'dx_cls'))) heat(document.getElementById('ch-dx'), N(d, ['n', 'median']));
    if ((d = state(document.getElementById('ch-region'), 'region'))) rangeChart(document.getElementById('ch-region'), N(d, ['n', 'p25', 'median', 'p75']), 'region');
    const mo = state(document.getElementById('ch-n'), 'monthly');
    state(document.getElementById('ch-med'), 'monthly');
    if (mo) { const rows = N(mo, ['n', 'median']); barChart(document.getElementById('ch-n'), rows); lineChart(document.getElementById('ch-med'), rows); }
    const tb = document.getElementById('tb-inst');
    if ((d = state(tb, 'inst_outliers'))) {
      const body = tbody(tb); body.replaceChildren();
      N(d, ['n', 'median', 'class_median', 'ratio']).forEach((r) => {
        const tr = h('tr'); tr.dataset.key = r.yid;
        const hi = r.ratio >= 1.5;
        [r.yid, r.cl, r.region, f0(r.n) + (r.n < 10 ? ' ⚠' : ''), f0(r.median), f0(r.class_median), (hi ? '▲ ' : '') + r.ratio.toFixed(2) + '배'].forEach((t, i) => {
          const td = h('td', i === 6 && hi ? 'hi' : '', t); tr.appendChild(td);
        });
        body.appendChild(tr);
      });
    }
    if ((d = state(document.getElementById('ch-rxc'), 'rx_class'))) barRows(document.getElementById('ch-rxc'), N(d, ['claims', 'share']).map((r) => ({ ...r, sub: '약효분류 ' + r.class_no + (+r.abx ? ' · 항생제' : '') })), 'name', 'share', (v) => (v * 100).toFixed(1) + '%', 'sub');
    if ((d = state(document.getElementById('ch-abxc'), 'abx_by_cls'))) barRows(document.getElementById('ch-abxc'), N(d, ['n', 'abx_claims', 'rate']).map((r) => ({ ...r, sub: 'n=' + f0(r.n) + ' · 항생제 ' + f0(r.abx_claims) + '건' })), 'cl', 'rate', (v) => v.toFixed(1) + '%', 'sub');
    if (DATA.abx_by_cls && DATA.abx_by_dx) { const r1 = DATA.abx_by_cls.map((q) => +q.rate), r2 = DATA.abx_by_dx.map((q) => +q.rate); document.getElementById('abx-find').textContent = '호흡기 외래 명세서 중 항생제가 처방된 비율. 종별 ' + d3.min(r1).toFixed(1) + '~' + d3.max(r1).toFixed(1) + '%, 상병별 ' + d3.min(r2).toFixed(1) + '~' + d3.max(r2).toFixed(1) + '%로 차이가 크지 않습니다.'; }
    if ((d = state(document.getElementById('ch-abxd'), 'abx_by_dx'))) barRows(document.getElementById('ch-abxd'), N(d, ['n', 'abx_claims', 'rate']).map((r) => ({ ...r, sub: 'n=' + f0(r.n) + ' · 항생제 ' + f0(r.abx_claims) + '건' })), 'dx', 'rate', (v) => v.toFixed(1) + '%', 'sub');
  };
  render();
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(render, 150); });
})();
