const mainGreen = '#A1C84D';      // verde novo
const cipteaBlue = '#003c6c';
const cipfPurple = '#7d5b8c';     // roxo novo da CIPF
const barFillOpacity = 0.22;

const faixaOrder = ['0-12', '13-17', '18-29', '30-44', '45-59', '18-59', '60+', '0-17'];
const faixasFixas = ['0-12', '13-17', '18-59', '60+'];
const defaultFaixas = Object.fromEntries(faixaOrder.map((faixa) => [faixa, 0]));
const regioesPadrao = ['Grande Florianópolis', 'Sul', 'Norte', 'Vale do Itajaí', 'Serra', 'Oeste'];
const tiposFixos = ['CIPTEA', 'CIPF', 'Passe Livre'];

/**
 * URL base do backend (Render).
 * - Prioriza buscar os CSV/GeoJSON no mesmo host do frontend (GitHub Pages ou Render).
 * - Em caso de falha, faz fallback para a instância do Render indicada abaixo.
 */
const RENDER_BASE_URL = 'https://painelfcee.onrender.com'; // 🔴 TROQUE SE A URL FOR OUTRA
const API_BASE = window.location.origin;

function withOpacity(hex, alpha) {
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(sanitized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function toNonNegativeInt(value, fallback = 0) {
  const parsed = parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : fallback;
}

function normalizeNumericField(value) {
  return toNonNegativeInt(value, 0);
}

function safeStr(row, key) {
  return (row?.[key] ?? '').trim();
}

function buildDados(rows) {
  const instituicoes = {};
  const todosMunicipios = new Set();
  const municipioRegiao = {};

  rows.forEach((row) => {
    const municipio = safeStr(row, 'municipio');
    if (!municipio) return;
    todosMunicipios.add(municipio);

    const instNome = safeStr(row, 'nome');
    if (!instNome) return;

    const tipoRaw = safeStr(row, 'tipo');
    const tipoNormalizado = tipoRaw.toLowerCase() === 'ambos' ? 'Todos' : tipoRaw;

    const inst = {
      nome: instNome,
      regiao: safeStr(row, 'regiao'),
      municipio,
      tipo: tipoNormalizado,
      endereco: safeStr(row, 'endereco'),
      telefone: safeStr(row, 'telefone'),
      email: safeStr(row, 'email'),
      quantidade_ciptea: String(normalizeNumericField(row.quantidade_ciptea)),
      quantidade_cipf: String(normalizeNumericField(row.quantidade_cipf)),
      quantidade_passe_livre: String(normalizeNumericField(row.quantidade_passe_livre)),
    };

    if (!instituicoes[municipio]) {
      instituicoes[municipio] = [];
    }
    instituicoes[municipio].push(inst);

    if (inst.regiao && !municipioRegiao[municipio]) {
      municipioRegiao[municipio] = inst.regiao;
    }
  });

  const municipiosStatus = {};
  todosMunicipios.forEach((municipio) => {
    const insts = instituicoes[municipio] || [];
    const tipos = [...new Set(insts.map((inst) => inst.tipo).filter(Boolean))];
    municipiosStatus[municipio] = tipos.includes('Todos')
      ? 'Todos'
      : tipos.length
        ? tipos.sort().join(' e ')
        : 'Nenhum';
  });

  return { municipiosStatus, municipiosInstituicoes: instituicoes, municipioRegiao };
}

function buildDemografia(rows) {
  const faixasSet = new Set(faixasFixas);
  const porTipo = Object.fromEntries(
    tiposFixos.map((tipo) => [tipo, Object.fromEntries(faixasFixas.map((faixa) => [faixa, 0]))]),
  );
  const totalPorFaixa = Object.fromEntries(faixasFixas.map((faixa) => [faixa, 0]));

  rows.forEach((row) => {
    const faixa = safeStr(row, 'faixa_etaria') || safeStr(row, 'faixa');
    const tipo = safeStr(row, 'tipo_deficiencia') || safeStr(row, 'tipo');
    const quantidade = normalizeNumericField(row.quantidade);

    if (!faixa || !tipo) return;
    if (!tiposFixos.includes(tipo)) return;

    faixasSet.add(faixa);

    if (!porTipo[tipo]) porTipo[tipo] = Object.fromEntries(faixasFixas.map((fa) => [fa, 0]));
    porTipo[tipo][faixa] = (porTipo[tipo][faixa] || 0) + quantidade;
    totalPorFaixa[faixa] = (totalPorFaixa[faixa] || 0) + quantidade;
  });

  const faixaLabels = [
    ...faixaOrder.filter((faixa) => faixasSet.has(faixa)),
    ...[...faixasSet].filter((faixa) => !faixaOrder.includes(faixa)).sort(),
  ];

  return {
    faixaLabels,
    tipos: tiposFixos,
    porTipo,
    totalPorFaixa,
  };
}

function resumirInstituicoes(instituicoes) {
  const totais = { ciptea: 0, cipf: 0, passe_livre: 0 };
  const regioes = {};
  const municipios = {};

  Object.values(instituicoes).forEach((insts) => {
    insts.forEach((inst) => {
      const qtCiptea = toNonNegativeInt(inst.quantidade_ciptea, 0);
      const qtCipf = toNonNegativeInt(inst.quantidade_cipf, 0);
      const qtPasse = toNonNegativeInt(inst.quantidade_passe_livre, 0);

      totais.ciptea += qtCiptea;
      totais.cipf += qtCipf;
      totais.passe_livre += qtPasse;

      const regiao = (inst.regiao || '').trim();
      if (!regiao || ['não informada', 'nao informada', 'não informado', 'nao informado'].includes(regiao.toLowerCase())) {
        return;
      }

      regioes[regiao] = (regioes[regiao] || 0) + qtCiptea + qtCipf + qtPasse;

      const municipio = inst.municipio;
      if (municipio) {
        if (!municipios[municipio]) {
          municipios[municipio] = { ciptea: 0, cipf: 0, passe_livre: 0 };
        }
        municipios[municipio].ciptea += qtCiptea;
        municipios[municipio].cipf += qtCipf;
        municipios[municipio].passe_livre += qtPasse;
      }
    });
  });

  return { totais, regioes, municipios };
}

function resumirPorMunicipio(instituicoes) {
  const resumo = {};

  Object.entries(instituicoes).forEach(([municipio, insts]) => {
    const dados = {
      regiao: insts.find((inst) => inst.regiao)?.regiao || '',
      instituicoes: insts.length,
      ciptea: 0,
      cipf: 0,
      passe_livre: 0,
    };

    insts.forEach((inst) => {
      dados.ciptea += toNonNegativeInt(inst.quantidade_ciptea, 0);
      dados.cipf += toNonNegativeInt(inst.quantidade_cipf, 0);
      dados.passe_livre += toNonNegativeInt(inst.quantidade_passe_livre, 0);
    });

    resumo[municipio] = dados;
  });

  return resumo;
}

function renderChart(ctxId, labels, data, title, type = 'bar', chartOptions = {}) {
  const ctx = document.getElementById(ctxId);
  if (!ctx) return null;

  const isPrebuiltDataset =
    Array.isArray(data) && data.length && typeof data[0] === 'object' && data[0].data !== undefined;

  const datasets = isPrebuiltDataset
    ? data
    : [
        {
          label: title,
          data,
          borderColor: mainGreen,
          backgroundColor: withOpacity(mainGreen, barFillOpacity),
          borderWidth: 2,
          tension: type === 'line' ? 0.3 : 0,
          fill: type === 'line',
        },
      ];

  datasets.forEach((dataset) => {
    if (!dataset.borderColor) dataset.borderColor = mainGreen;
    if (!dataset.backgroundColor) dataset.backgroundColor = withOpacity(mainGreen, barFillOpacity);
    if (dataset.borderWidth === undefined) dataset.borderWidth = 2;
    if (dataset.tension === undefined) dataset.tension = type === 'line' ? 0.3 : 0;
    if (dataset.fill === undefined) dataset.fill = type === 'line';
  });

  const { plugins: chartPlugins = {}, layout: chartLayout = {}, scales: chartScales = {}, ...restOptions } =
    chartOptions || {};

  const defaultTooltip = {
    backgroundColor: '#ffffff',
    bodyColor: '#0f172a',
    titleColor: '#0f172a',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    padding: 10,
    displayColors: false,
  };

  const mergedOptions = {
    responsive: true,
    plugins: {
      legend: { display: false, ...(chartPlugins.legend || {}) },
      tooltip: { ...defaultTooltip, ...(chartPlugins.tooltip || {}) },
    },
    layout: { padding: { right: 30, top: 10, left: 4, bottom: 6 }, ...chartLayout },
    scales: {
      ...chartScales,
      y: { beginAtZero: true, ...(chartScales.y || {}) },
    },
    indexAxis: 'x',
    ...restOptions,
  };

  return new Chart(ctx, {
    type,
    data: {
      labels,
      datasets,
    },
    options: mergedOptions,
  });
}

function buildTooltipCallbacks({ axis = 'y', labelSource = 'dataset' } = {}) {
  return {
    callbacks: {
      label: (context) => {
        const value = axis === 'x' ? context.parsed.x : context.parsed.y;
        const sourceLabel = labelSource === 'category' ? context.label : context.dataset?.label;
        const label = sourceLabel || context.label || '';
        return [`[]${label}`, `Carteiras emitidas: ${value ?? 0}`];
      },
    },
  };
}

function renderPainel(demografia, instituicoesResumo, municipiosResumo) {
  const demografiaData = demografia || { faixaLabels: [], tipos: [], porTipo: {}, totalPorFaixa: {} };
  const faixaLabels = demografiaData.faixaLabels;

  const tipoColors = {
    CIPTEA: cipteaBlue,
    CIPF: cipfPurple,
    'Passe Livre': mainGreen,
  };

  // Gráfico por faixa etária (barras horizontais empilhadas)
  const datasetsFaixa = demografiaData.tipos.map((tipo) => ({
    label: tipo,
    data: faixaLabels.map((faixa) => demografiaData?.porTipo?.[tipo]?.[faixa] || 0),
    backgroundColor: withOpacity(tipoColors[tipo] || '#0EA5E9', barFillOpacity),
    borderColor: tipoColors[tipo] || '#0EA5E9',
    borderWidth: 2,
  }));

  renderChart('chartFaixa', faixaLabels, datasetsFaixa, 'Por faixa etária', 'bar', {
    plugins: {
      legend: { display: true, position: 'top', labels: { font: { size: 13, weight: '600' } } },
      tooltip: buildTooltipCallbacks({ axis: 'x', labelSource: 'dataset' }).callbacks,
    },
    indexAxis: 'y',
    scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true } },
    layout: { padding: { right: 30, top: 10, left: 4, bottom: 6 } },
  });

  // Gráfico por tipo de carteira
  const totais = instituicoesResumo?.totais || {};
  const tipoLabels = ['CIPTEA', 'CIPF', 'Passe Livre'];
  const tipoValores = [totais.ciptea || 0, totais.cipf || 0, totais.passe_livre || 0];
  const totalTipos = tipoValores.reduce((a, b) => a + b, 0);
  const totalTiposEl = document.getElementById('totalTipos');
  if (totalTiposEl) totalTiposEl.innerText = `Total: ${totalTipos} emissões`;

  renderChart(
    'chartTipos',
    tipoLabels,
    [
      {
        label: 'Distribuição por tipo',
        data: tipoValores,
        backgroundColor: [
          withOpacity(cipteaBlue, barFillOpacity),
          withOpacity(cipfPurple, barFillOpacity),
          withOpacity(mainGreen, barFillOpacity),
        ],
        borderColor: [cipteaBlue, cipfPurple, mainGreen],
        borderWidth: 2,
      },
    ],
    'Por tipo de carteira',
    'bar',
    {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: buildTooltipCallbacks({ axis: 'x', labelSource: 'category' }).callbacks,
      },
      scales: { x: { beginAtZero: true } },
    },
  );

  // Gráfico por região – garante todas as regiões padrão
  const regioes = instituicoesResumo?.regioes || {};
  const regiaoLabels = Array.from(new Set([...regioesPadrao, ...Object.keys(regioes || {})]));
  const regiaoValores = regiaoLabels.map((r) => regioes[r] || 0);

  renderChart(
    'chartRegiao',
    regiaoLabels,
    [
      {
        label: 'Carteiras por região',
        data: regiaoValores,
        backgroundColor: withOpacity(mainGreen, barFillOpacity),
        borderColor: mainGreen,
        borderWidth: 2,
      },
    ],
    'Carteiras por região',
    'bar',
    {
      indexAxis: 'y',
      scales: { x: { beginAtZero: true } },
      plugins: { tooltip: buildTooltipCallbacks({ axis: 'x', labelSource: 'category' }).callbacks },
      layout: { padding: { right: 50, top: 10, left: 4, bottom: 6 } },
    },
  );

  // Resumo por município ainda é útil para cálculos internos se precisar
  if (municipiosResumo) {
    // Se no futuro quiser voltar a exibir algum total, já está pronto aqui.
  }
}

function getColor(status) {
  return status && status !== 'Nenhum' ? mainGreen : '#e5e7eb';
}

function buildPopupHtml(nome, status, municipiosInstituicoes) {
  let adjustedStatus = status;
  if (status === 'Passe Livre' || status === 'CIPTEA e Passe Livre' || status === 'Todos') {
    adjustedStatus = status === 'Passe Livre' ? 'CIPF e Passe Livre' : 'CIPTEA, CIPF e Passe Livre';
  }

  let popupHtml = `<b>${nome}</b><br>Status: ${adjustedStatus}`;

  if (municipiosInstituicoes[nome]) {
    popupHtml += '<br><br><b>Instituições credenciadas:</b><ul>';
    municipiosInstituicoes[nome].forEach((inst) => {
      popupHtml += `
        <li>
          <b>${inst.nome}</b> (${inst.tipo})<br>
          ${inst.endereco}<br>
          Tel: ${inst.telefone}<br>
          Email: ${inst.email}<br>
          Quantidade: CIPTEA: ${inst.quantidade_ciptea || 0}, CIPF: ${inst.quantidade_cipf || 0}, Passe Livre: ${inst.quantidade_passe_livre || 0}
        </li>
      `;
    });
    popupHtml += '</ul>';
  }

  return popupHtml;
}

async function setupMap(municipiosStatus, municipiosInstituicoes) {
  const map = L.map('map').setView([-27.2, -50.5], 7);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);

  async function loadGeoJson() {
    const response = await fetchWithFallback([
      'sc_municipios.geojson',
      `${API_BASE}/sc_municipios.geojson`,
      `${RENDER_BASE_URL}/sc_municipios.geojson`,
    ]);
    return response.json();
  }

  const data = await loadGeoJson();

  const geoLayer = L.geoJson(data, {
    style: (feature) => ({
      color: '#333',
      weight: 1,
      fillColor: getColor(municipiosStatus[feature.properties.name] || 'Nenhum'),
      fillOpacity: 0.65,
    }),
    onEachFeature: (feature, layer) => {
      const nome = feature.properties.name;
      const status = municipiosStatus[nome] || 'Nenhum';
      const popupHtml = buildPopupHtml(nome, status, municipiosInstituicoes);

      layer.bindPopup(popupHtml);
      layer.featureStatus = status;
    },
  }).addTo(map);

  return { map, geoLayer };
}

function setupSearch(map, geoLayer) {
  const searchBox = document.getElementById('searchBox');
  if (!searchBox) return;

  searchBox.addEventListener('keyup', (e) => {
    if (e.key !== 'Enter' || !geoLayer) return;

    const query = searchBox.value.toLowerCase();
    geoLayer.eachLayer((layer) => {
      if (layer.feature?.properties?.name?.toLowerCase() === query) {
        map.fitBounds(layer.getBounds());
        layer.openPopup();
      }
    });
  });
}

function parseCsv(text) {
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: reject,
    });
  });
}

async function fetchWithFallback(urls) {
  const tried = new Set();
  let lastError;

  for (const url of urls) {
    if (!url || tried.has(url)) continue;
    tried.add(url);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        lastError = new Error(`Falha ao buscar ${url}: ${response.status}`);
        continue;
      }
      return response;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Não foi possível carregar o recurso solicitado');
}

async function fetchCsvData(path) {
  // Para dados e demografia, tentamos primeiro a API JSON do backend
  if (path === 'dados.csv' || path === 'demografia.csv') {
    const apiName = path.startsWith('dados') ? 'dados' : 'demografia';
    const candidatesJson = [
      `${API_BASE}/api/${apiName}`,         // quando tudo roda junto no Render
      `${RENDER_BASE_URL}/api/${apiName}`, // quando o front está no GitHub Pages
    ];

    try {
      const responseJson = await fetchWithFallback(candidatesJson);
      return responseJson.json(); // já retorna array de objetos JSON
    } catch (e) {
      console.warn('Falha ao carregar API JSON, tentando CSV estático...', e);
      // cai para o fluxo antigo via CSV
    }
  }

  // 🔙 Fallback antigo: tenta ler o CSV diretamente
  const candidates = [path, `${API_BASE}/${path}`, `${RENDER_BASE_URL}/${path}`];
  const response = await fetchWithFallback(candidates);
  const text = await response.text();
  return parseCsv(text);
}

async function init() {
  try {
    const [dadosRows, demografiaRows] = await Promise.all([
      fetchCsvData('dados.csv'),
      fetchCsvData('demografia.csv').catch(() => []),
    ]);

    const { municipiosStatus, municipiosInstituicoes } = buildDados(dadosRows);
    const municipiosResumo = resumirPorMunicipio(municipiosInstituicoes);
    const demografiaFaixas = buildDemografia(demografiaRows || []);
    const instituicoesResumo = resumirInstituicoes(municipiosInstituicoes);

    renderPainel(demografiaFaixas, instituicoesResumo, municipiosResumo);

    const { map, geoLayer } = await setupMap(municipiosStatus, municipiosInstituicoes);
    setupSearch(map, geoLayer);
  } catch (error) {
    console.error('Erro ao carregar dados', error);
    const existingNotice = document.getElementById('loadError');
    if (!existingNotice) {
      const notice = document.createElement('div');
      notice.id = 'loadError';
      notice.style.position = 'absolute';
      notice.style.top = '20px';
      notice.style.left = '50%';
      notice.style.transform = 'translateX(-50%)';
      notice.style.background = '#fee2e2';
      notice.style.color = '#991b1b';
      notice.style.padding = '12px 16px';
      notice.style.border = '1px solid #fecaca';
      notice.style.borderRadius = '10px';
      notice.style.boxShadow = '0 8px 20px rgba(0,0,0,0.15)';
      notice.style.zIndex = '1200';
      notice.innerHTML = `
        <strong>Erro ao carregar dados.</strong><br>
        Confirme que os arquivos CSV e GeoJSON estão acessíveis pelo backend (Render).
      `;
      document.body.appendChild(notice);
    }
  }
}

window.addEventListener('load', init);
