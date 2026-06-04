const { useEffect, useMemo, useState } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accentColor": "#27D7FF",
  "topologyZoom": 0.66,
  "glowStrength": 1,
  "panelOpacity": 0.74
}/*EDITMODE-END*/;

const rawTree = {
  id: 'systemd', name: 'systemd', pid: 1, user: 'root', cpu: 6, memory: 420, status: 'running', runtime: '19d 08h', threads: 92,
  cpuHistory: [7, 5, 6, 8, 5, 6, 7, 6], memHistory: [395, 404, 409, 410, 414, 418, 421, 420], children: [
    { id:'chrome', name:'chrome', pid:3482, user:'marta', cpu:88, memory:3120, status:'running', runtime:'06h 17m', threads:71, cpuHistory:[42,55,61,74,80,86,91,88], memHistory:[2440,2600,2780,2920,3005,3060,3110,3120], children:[
      { id:'gpu', name:'gpu-process', pid:3522, user:'marta', cpu:46, memory:1180, status:'running', runtime:'06h 15m', threads:18, cpuHistory:[21,30,39,44,41,48,50,46], memHistory:[940,990,1020,1080,1110,1132,1160,1180], children:[] },
      { id:'tab-observability', name:'tab:grafana', pid:3560, user:'marta', cpu:82, memory:940, status:'running', runtime:'02h 11m', threads:11, cpuHistory:[31,46,62,70,76,84,87,82], memHistory:[720,752,786,830,880,910,928,940], children:[] },
      { id:'tab-docs', name:'tab:docs', pid:3568, user:'marta', cpu:14, memory:510, status:'sleeping', runtime:'04h 02m', threads:7, cpuHistory:[9,10,12,13,11,15,16,14], memHistory:[450,462,470,484,492,498,505,510], children:[] }
    ]},
    { id:'vscode', name:'code', pid:4210, user:'marta', cpu:51, memory:2260, status:'running', runtime:'08h 43m', threads:54, cpuHistory:[22,30,44,52,47,55,58,51], memHistory:[1800,1880,1960,2050,2130,2190,2230,2260], children:[
      { id:'tsserver', name:'tsserver', pid:4262, user:'marta', cpu:69, memory:1340, status:'running', runtime:'08h 39m', threads:26, cpuHistory:[38,42,57,63,66,74,70,69], memHistory:[980,1040,1100,1180,1250,1300,1322,1340], children:[] },
      { id:'eslint', name:'eslint', pid:4279, user:'marta', cpu:12, memory:360, status:'sleeping', runtime:'07h 20m', threads:8, cpuHistory:[4,7,11,14,9,13,10,12], memHistory:[330,336,340,348,352,355,358,360], children:[] },
      { id:'pty', name:'zsh', pid:4300, user:'marta', cpu:4, memory:96, status:'running', runtime:'03h 03m', threads:3, cpuHistory:[2,5,4,3,6,4,5,4], memHistory:[82,84,88,90,91,93,95,96], children:[
        { id:'vite', name:'vite-dev', pid:4318, user:'marta', cpu:43, memory:720, status:'running', runtime:'02h 58m', threads:14, cpuHistory:[18,24,31,42,39,47,44,43], memHistory:[590,610,640,672,700,712,718,720], children:[] }
      ]}
    ]},
    { id:'containerd', name:'containerd', pid:812, user:'root', cpu:18, memory:760, status:'running', runtime:'19d 08h', threads:34, cpuHistory:[13,14,16,19,20,17,18,18], memHistory:[710,718,725,736,744,750,756,760], children:[
      { id:'kubelet', name:'kubelet', pid:920, user:'root', cpu:31, memory:870, status:'running', runtime:'19d 07h', threads:42, cpuHistory:[18,21,24,30,33,29,32,31], memHistory:[790,805,818,832,846,858,866,870], children:[] },
      { id:'postgres', name:'postgres', pid:1810, user:'postgres', cpu:76, memory:1840, status:'running', runtime:'12d 16h', threads:36, cpuHistory:[46,52,61,70,74,79,77,76], memHistory:[1500,1560,1630,1700,1760,1800,1822,1840], children:[
        { id:'walwriter', name:'walwriter', pid:1833, user:'postgres', cpu:9, memory:220, status:'sleeping', runtime:'12d 16h', threads:4, cpuHistory:[8,7,9,10,8,9,11,9], memHistory:[190,198,204,210,214,218,219,220], children:[] }
      ]}
    ]},
    { id:'firefox', name:'firefox', pid:2922, user:'marta', cpu:28, memory:1280, status:'running', runtime:'05h 11m', threads:44, cpuHistory:[16,20,25,28,31,27,30,28], memHistory:[980,1040,1100,1160,1210,1248,1270,1280], children:[
      { id:'socket', name:'socket-process', pid:2991, user:'marta', cpu:3, memory:180, status:'sleeping', runtime:'05h 09m', threads:5, cpuHistory:[2,3,4,3,2,5,4,3], memHistory:[148,154,162,168,170,174,178,180], children:[] },
      { id:'media', name:'rdd-media', pid:3008, user:'marta', cpu:41, memory:620, status:'running', runtime:'01h 27m', threads:13, cpuHistory:[20,24,28,34,39,44,42,41], memHistory:[510,530,548,570,594,606,616,620], children:[] }
    ]},
    { id:'sshd', name:'sshd', pid:704, user:'root', cpu:2, memory:120, status:'sleeping', runtime:'19d 08h', threads:5, cpuHistory:[1,2,2,3,1,2,2,2], memHistory:[110,112,115,116,118,119,120,120], children:[
      { id:'ssh-session', name:'ssh:deploy', pid:5132, user:'deploy', cpu:7, memory:145, status:'running', runtime:'00h 42m', threads:4, cpuHistory:[4,6,7,5,8,9,6,7], memHistory:[124,128,132,136,140,142,144,145], children:[] }
    ]}
  ]
};

function flatten(node, parent = null, depth = 0, list = []) {
  list.push({ ...node, parent, depth, childIds: node.children.map(c => c.id) });
  node.children.forEach(child => flatten(child, node, depth + 1, list));
  return list;
}
function apiRowsToTree(rows) {
  if (!Array.isArray(rows) || !rows.length) return rawTree;
  const byPid = new Map();
  function categoryFor(name) {
    const n = String(name || '').toLowerCase();
    if (/(chrome|edge|firefox|opera|brave|browser|msedge)/.test(n)) return 'Navegadores';
    if (/(code|node|npm|python|java|gradle|mvn|git|terminal|powershell|cmd|bash|wsl)/.test(n)) return 'Desarrollo';
    if (/(explorer|dwm|search|start|shellexperience|runtimebroker|widgets|textinput)/.test(n)) return 'Interfaz Windows';
    if (/(svchost|system|registry|services|lsass|csrss|wininit|winlogon|spoolsv|fontdrvhost)/.test(n)) return 'Sistema';
    if (/(defender|security|mpcmd|msmpeng|firewall|antimalware)/.test(n)) return 'Seguridad';
    if (/(sql|postgres|mongo|redis|docker|container|nginx|apache|server)/.test(n)) return 'Servicios';
    return 'Aplicaciones';
  }
  function aggregateNode(id, name, children) {
    const cpu = Number(children.reduce((sum, p) => sum + p.cpu, 0).toFixed(1));
    const memory = children.reduce((sum, p) => sum + p.memory, 0);
    return {
      id,
      name,
      pid: 0,
      user: 'local',
      cpu,
      memory: Math.max(1, memory),
      status: children.some(p => p.status === 'running') ? 'running' : 'sleeping',
      runtime: 'agrupado',
      threads: children.reduce((sum, p) => sum + p.threads, 0),
      cpuHistory: [0, 0, 0, 0, 0, 0, cpu],
      memHistory: [Math.max(1, memory)],
      children,
    };
  }
  function groupedRoots(items) {
    const groups = new Map();
    items.forEach((process) => {
      const category = categoryFor(process.name);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(process);
    });
    return [...groups.entries()].map(([category, processes]) => {
      const chunks = [];
      for (let i = 0; i < processes.length; i += 6) {
        const slice = processes.slice(i, i + 6);
        chunks.push(aggregateNode(
          `group-${category.toLowerCase().replace(/\s+/g, '-')}-${Math.floor(i / 6) + 1}`,
          slice.length === processes.length ? category : `${category} ${Math.floor(i / 6) + 1}`,
          slice
        ));
      }
      return aggregateNode(`category-${category.toLowerCase().replace(/\s+/g, '-')}`, category, chunks);
    });
  }
  const normalized = rows
    .map((row) => {
      const pid = Number(row.pid);
      if (!Number.isFinite(pid)) return null;
      const cpu = Number(row.cpu_percent ?? row.cpu ?? 0);
      const memory = Number(row.memory_mb ?? row.memory ?? 1);
      const name = String(row.name || row.command || `pid-${pid}`);
      return {
        id: `pid-${pid}`,
        name,
        pid,
        ppid: Number(row.ppid || 0),
        user: String(row.user || 'local'),
        cpu: Math.max(0, Number(cpu.toFixed ? cpu.toFixed(1) : cpu)),
        memory: Math.max(1, Math.round(memory)),
        status: row.status === 'activo' || row.status === 'running' ? 'running' : 'sleeping',
        runtime: String(row.runtime || row.time || 'n/d'),
        threads: Number(row.threads || 1),
        cpuHistory: [0, 0, 0, 0, 0, 0, Math.max(0, Number(cpu || 0))],
        memHistory: [Math.max(1, Math.round(memory))],
        children: [],
      };
    })
    .filter(Boolean);

  normalized.forEach((process) => byPid.set(process.pid, process));
  const roots = [];
  normalized.forEach((process) => {
    const parent = byPid.get(process.ppid);
    if (parent && parent !== process) parent.children.push(process);
    else roots.push(process);
  });
  const treeChildren = roots.length > 10 ? groupedRoots(roots) : roots;

  const root = {
    id: 'system-local',
    name: 'mi-pc',
    pid: 0,
    user: 'local',
    cpu: Number(normalized.reduce((sum, p) => sum + p.cpu, 0).toFixed(1)),
    memory: normalized.reduce((sum, p) => sum + p.memory, 0),
    status: 'running',
    runtime: 'muestra actual',
    threads: normalized.reduce((sum, p) => sum + p.threads, 0),
    cpuHistory: [0, 0, 0, 0, 0, 0, Number(normalized.reduce((sum, p) => sum + p.cpu, 0).toFixed(1))],
    memHistory: [normalized.reduce((sum, p) => sum + p.memory, 0)],
    children: treeChildren,
  };
  return root.children.length ? root : rawTree;
}
function cpuColor(p) { if (p.status !== 'running') return '#666666'; if (p.cpu >= 80) return '#ff0000'; if (p.cpu >= 40) return '#ff9800'; return '#00ff88'; }
function radius(memory) { return Math.max(21, Math.min(58, 15 + Math.sqrt(memory) * .72)); }
const MIN_NODE_GAP = 12; // 0.1cm+ at default zoom, measured in graph world units.
function subtreeSpan(node) {
  const ownWidth = radius(node.memory) * 2 + MIN_NODE_GAP;
  if (!node.children.length) return ownWidth;
  const childWidth = node.children.reduce((sum, child) => sum + subtreeSpan(child), 0);
  const childGaps = Math.max(0, node.children.length - 1) * MIN_NODE_GAP;
  return Math.max(ownWidth, childWidth + childGaps);
}
function layout(node, x0 = 70, x1 = 1210, y = 82, depth = 0, out = [], parentId = null) {
  const x = (x0 + x1) / 2 + Math.sin(depth * 1.9 + node.pid * .01) * 10;
  out.push({ id: node.id, parentId, x, y });
  if (!node.children.length) return out;

  const childSpans = node.children.map(child => subtreeSpan(child));
  const required = childSpans.reduce((sum, span) => sum + span, 0) + Math.max(0, node.children.length - 1) * MIN_NODE_GAP;
  let left = x0;
  let right = x1;
  if (required > right - left) {
    const center = (left + right) / 2;
    left = center - required / 2;
    right = center + required / 2;
  }

  let cursor = left;
  node.children.forEach((child, i) => {
    const width = childSpans[i];
    layout(child, cursor, cursor + width, y + 146 + (i % 2) * 18, depth + 1, out, node.id);
    cursor += width + MIN_NODE_GAP;
  });
  return out;
}
const stateText = { running:'En ejecución', sleeping:'En reposo', inactive:'Inactivo' };

function Spark({ data, color, label }) {
  const w = 156, h = 48, max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => `${(i/(data.length-1))*w},${h - ((v-min)/Math.max(1,max-min))*(h-12)-6}`).join(' ');
  return <svg className="spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}><polyline points={pts} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/><polygon points={`0,${h} ${pts} ${w},${h}`} fill={color} opacity=".13"/></svg>;
}
function Stat({ label, value, note, tone }) { return <article className="stat"><i className={tone}></i><span>{label}</span><b>{value}</b><small>{note}</small></article>; }
function Bars({ data, color }) { const max = Math.max(...data); return <div className="bars">{data.map((v,i)=><span key={i} style={{height:`${Math.max(12,v/max*100)}%`, background:color}} />)}</div>; }

function ViewScreen({ section, processes, selected, totals, openNode }) {
  const topCpu = [...processes].sort((a,b)=>b.cpu-a.cpu).slice(0,6);
  const topMem = [...processes].sort((a,b)=>b.memory-a.memory).slice(0,6);
  const risky = processes.filter(p => p.cpu >= 80 || p.memory >= 1800);
  const users = [...new Set(processes.map(p => p.user))].map(user => ({ user, count: processes.filter(p=>p.user===user).length, cpu: processes.filter(p=>p.user===user).reduce((s,p)=>s+p.cpu,0), mem: processes.filter(p=>p.user===user).reduce((s,p)=>s+p.memory,0) }));
  if (section === 'Métricas') return <section className="screen"><div className="screen-hero"><p>Métricas</p><h2>Capacidad, presión y procesos dominantes</h2><span>Esta vista separa análisis de recursos del lienzo de topología para comparar sin perder contexto.</span></div><div className="screen-grid"><article className="card wide"><header><b>Top RSS por proceso</b><small>{totals.mem} GB observados</small></header>{topMem.map(p=><button className="rank" key={p.id} onClick={()=>openNode(p.id)}><span>{p.name}<small>{p.user} · {p.childIds.length ? `${p.childIds.length} hijos` : 'proceso hoja'}</small></span><b>{p.memory} MB</b><i style={{width:`${Math.min(100,p.memory/32)}%`, background:cpuColor(p)}} /></button>)}</article><article className="card"><header><b>Muestras de CPU</b><small>top 6</small></header><Bars data={topCpu.map(p=>p.cpu)} color="#ff9800"/><p className="note">Pico actual: {topCpu[0].name} con {topCpu[0].cpu}%.</p></article><article className="card"><header><b>Proceso seleccionado</b><small>lectura rápida</small></header><strong className="mega">{selected.memory} MB</strong><p className="note">{selected.name} · {selected.cpu}% CPU · {selected.threads} hilos</p></article></div></section>;
  if (section === 'Alertas') return <section className="screen"><div className="screen-hero danger"><p>Alertas</p><h2>Incidentes priorizados por impacto operativo</h2><span>CPU crítica, RSS elevada y linajes que requieren inspección inmediata.</span></div><div className="alert-stack">{risky.map(p=><button className="alert" key={p.id} onClick={()=>openNode(p.id)}><i style={{background:cpuColor(p)}}/><span><b>{p.cpu >= 80 ? 'CPU crítica' : 'Memoria elevada'} · {p.name}</b><small>usuario {p.user} · padre {p.parent ? p.parent.name : 'ninguno'}</small></span><em>Inspeccionar</em></button>)}</div></section>;
  if (section === 'Auditoría') return <section className="screen"><div className="screen-hero"><p>Auditoría</p><h2>Usuarios, linaje y procesos revisables</h2><span>Tabla operacional para detectar procesos no-root, sesiones y descendientes con exposición.</span></div><div className="audit"><div className="audit-head"><span>Usuario</span><span>Procesos</span><span>CPU total</span><span>RSS</span><span>Acción</span></div>{users.map(u=><button className="audit-row" key={u.user} onClick={()=>openNode(processes.find(p=>p.user===u.user).id)}><span>{u.user}</span><span>{u.count}</span><span>{u.cpu.toFixed(1)}%</span><span>{u.mem} MB</span><b>Ver linaje</b></button>)}</div></section>;
  return <section className="screen"><div className="screen-hero"><p>Ajustes</p><h2>Preferencias del observatorio</h2><span>Configuración preparada para pasar de mock estático a telemetría real sin romper el lenguaje visual.</span></div><div className="settings"><article><span>Refresco</span><b>Simulado · 5 s</b><small>Listo para conectar a un stream local.</small></article><article><span>Umbral crítico</span><b>CPU ≥ 80%</b><small>Semántica fija de la leyenda.</small></article><article><span>Escalado de nodos</span><b>Raíz cuadrada de RSS</b><small>Evita solapamientos extremos.</small></article><article><span>Idioma</span><b>Español</b><small>Nombres técnicos preservados.</small></article></div></section>;
}

function App() {
  const [tree, setTree] = useState(rawTree);
  const processes = useMemo(() => flatten(tree), [tree]);
  const positions = useMemo(() => layout(tree), [tree]);
  const processMap = useMemo(() => Object.fromEntries(processes.map(p => [p.id, p])), [processes]);
  const positionMap = useMemo(() => Object.fromEntries(positions.map(p => [p.id, p])), [positions]);
  const [active, setActive] = useState('Topología');
  const [selectedId, setSelectedId] = useState('systemd');
  const [hovered, setHovered] = useState(null);
  const [notice, setNotice] = useState('Topología lista · navega con el rail izquierdo');
  const [view, setView] = useState({ x: 18, y: 82, scale: TWEAK_DEFAULTS.topologyZoom });
  const [drag, setDrag] = useState(null);
  const selected = processMap[selectedId] || processes[0];
  const totals = { count: processes.length, active: processes.filter(p=>p.status==='running').length, sleeping: processes.filter(p=>p.status!=='running').length, cpu: processes.reduce((s,p)=>s+p.cpu,0).toFixed(1), mem: (processes.reduce((s,p)=>s+p.memory,0)/1024).toFixed(1) };
  const titles = { Topología:'Topología jerárquica en tiempo de ejecución', Métricas:'Interfaz de métricas de capacidad', Alertas:'Centro de alertas de procesos', Auditoría:'Auditoría de usuarios y linaje', Ajustes:'Ajustes del observatorio' };
  const nav = ['Topología','Métricas','Alertas','Auditoría','Ajustes'];
  useEffect(() => {
    let cancelled = false;
    async function loadProcesses() {
      try {
        const response = await fetch('/api/processes', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        const nextTree = apiRowsToTree(payload.processes);
        if (!cancelled) {
          setTree(nextTree);
          setSelectedId((current) => current in Object.fromEntries(flatten(nextTree).map(p => [p.id, true])) ? current : nextTree.id);
          setNotice(`Procesos reales cargados · ${payload.source || 'api'} · ${nextTree.children.length} ramas`);
        }
      } catch (error) {
        if (!cancelled) setNotice('No se pudo leer /api/processes · usando datos demo');
      }
    }
    loadProcesses();
    const timer = setInterval(loadProcesses, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);
  function reset() { setView({ x:18, y:82, scale:TWEAK_DEFAULTS.topologyZoom }); }
  function openNode(id) { setSelectedId(id); setActive('Topología'); setNotice(`Foco aplicado sobre ${processMap[id].name}`); }
  function go(section) {
    setActive(section);
    if (section === 'Topología') { reset(); setNotice('Vista de topología restablecida'); }
    if (section === 'Métricas') setNotice('Métricas abiertas · compara CPU, memoria e hilos');
    if (section === 'Alertas') setNotice('Alertas abiertas · incidentes priorizados');
    if (section === 'Auditoría') setNotice('Auditoría abierta · revisa usuarios y linaje');
    if (section === 'Ajustes') setNotice('Ajustes abiertos · preferencias del observatorio');
  }
  function onWheel(e) { e.preventDefault(); const next = Math.min(1.18, Math.max(.46, view.scale - e.deltaY * .001)); setView(v => ({...v, scale: next})); }
  function onDown(e) { e.currentTarget.setPointerCapture(e.pointerId); setDrag({ x:e.clientX, y:e.clientY, vx:view.x, vy:view.y }); }
  function onMove(e) { if (!drag) return; setView(v => ({...v, x:drag.vx + e.clientX - drag.x, y:drag.vy + e.clientY - drag.y})); }
  return <>
    <style>{css}</style>
    <div className="app">
      <nav className="rail" aria-label="Navegación principal"><div className="mark">⌁</div>{nav.map((n,i)=><button key={n} className={`rail-btn ${active===n?'active':''}`} aria-label={`Abrir ${n}`} aria-pressed={active===n} title={n} onClick={()=>go(n)}>{['◌','▤','!','⌘','⚙'][i]}</button>)}</nav>
      <main className="main">
        <header className="top"><div><p>Observatorio de procesos · prod-eu-west-03</p><h1>{titles[active]}</h1><span className="notice"><i/> {notice}</span></div><div className="actions"><input aria-label="Buscar proceso" placeholder="Buscar proceso, usuario, estado…"/><button onClick={()=>{reset();setActive('Topología');setNotice('Vista restablecida desde el control superior');}}>Restablecer vista</button></div></header>
        <section className="stats" aria-label="Resumen"><Stat label="Uso total CPU" value={`${totals.cpu}%`} note="muestra agregada" tone="orange"/><Stat label="Uso total memoria" value={`${totals.mem} GB`} note="RSS acumulado" tone="green"/><Stat label="Activos" value={totals.active} note="running/listos" tone="cyan"/><Stat label="En reposo" value={totals.sleeping} note="sleeping/inactivos" tone="gray"/><Stat label="Total procesos" value={totals.count} note="árbol completo" tone="red"/></section>
        {active === 'Topología' ? <section className="workspace">
          <div className={`graph ${drag?'dragging':''}`} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={()=>setDrag(null)} onPointerLeave={()=>setDrag(null)}>
            <div className="aurora"/><div className="particles"><i/><i/><i/><i/><i/></div>
            <div className="viewport" style={{transform:`translate(${view.x}px,${view.y}px) scale(${view.scale})`}}>
              <svg className="topology" viewBox="0 0 1280 830" aria-hidden="true">
                {[1,2,3,4].map(d=><ellipse key={d} className="ring" cx="640" cy={86+d*158} rx={245+d*82} ry={40+d*7}/>)}
                <path className="lane" d="M640 92 C440 205 330 308 230 490 C180 580 140 646 92 742"/><path className="lane" d="M640 92 C800 210 910 320 1040 486 C1100 560 1160 646 1214 742"/><path className="lane" d="M640 92 C628 230 650 360 648 520 C646 616 642 688 640 768"/>
                {positions.filter(p=>p.parentId).map(pos=>{ const parent=positionMap[pos.parentId], child=processMap[pos.id], parentProc=processMap[pos.parentId]; const mid=(parent.y+pos.y)/2; const d=`M ${parent.x} ${parent.y+radius(parentProc.memory)} C ${parent.x} ${mid-24}, ${pos.x} ${mid+24}, ${pos.x} ${pos.y-radius(child.memory)}`; const hot = hovered===pos.id || hovered===pos.parentId || selectedId===pos.id || selectedId===pos.parentId; return <path key={pos.id} className={`edge ${hot?'hot':''}`} style={{'--c':cpuColor(child)}} d={d}/>; })}
              </svg>
              {positions.map(pos=>{ const p=processMap[pos.id], r=radius(p.memory), c=cpuColor(p); return <div key={p.id} className="node-wrap" style={{left:`calc(50% - 640px + ${pos.x}px)`, top:`calc(50% - 415px + ${pos.y}px)`}} onMouseEnter={()=>setHovered(p.id)} onMouseLeave={()=>setHovered(null)}><button className={`node ${selectedId===p.id?'selected':''}`} style={{width:r*2, height:r*2, '--c':c}} onClick={(e)=>{e.stopPropagation();setSelectedId(p.id);setNotice(`Seleccionado ${p.name}`);}}><span>{p.name}</span><em>{p.cpu}% · {p.memory}M</em></button>{hovered===p.id && <div className="tip"><b>{p.name}</b><span>{p.childIds.length ? `${p.childIds.length} procesos hijos` : 'proceso hoja'}</span><span>{p.cpu}% CPU</span><span>{p.memory} MB RSS</span><span>{stateText[p.status]}</span></div>}</div>; })}
            </div>
            <div className="hud"><span>Rueda: zoom · arrastrar: paneo</span><b>{Math.round(view.scale*100)}%</b></div>
          </div>
          <aside className="legend"><div><h2>Leyenda de señales</h2>{[['CPU alta 80%+','#ff0000'],['CPU media 40–80%','#ff9800'],['CPU baja <40%','#00ff88'],['En reposo / inactivo','#666666']].map(([l,c])=><p key={l}><i style={{background:c}}/>{l}</p>)}</div><div><h2>Tamaño por memoria</h2><div className="sizes"><i/><i/><i/><b>RSS define el diámetro del círculo</b></div></div><div><h2>Distribución</h2><small>Rutas curvas desde systemd hacia ramas descendientes equilibradas. Los halos brillantes indican selección o cursor.</small></div></aside>
        </section> : <ViewScreen section={active} processes={processes} selected={selected} totals={totals} openNode={openNode}/>} 
      </main>
      <aside className="panel" aria-label="Detalles del proceso seleccionado"><header><div><h2>{selected.name}</h2><p>padre {selected.parent ? selected.parent.name : 'ninguno'}</p></div><span className={selected.status}>{stateText[selected.status]}</span></header><div className="details"><p><span>Usuario</span><b>{selected.user}</b></p><p><span>CPU</span><b>{selected.cpu}%</b></p><p><span>Memoria</span><b>{selected.memory} MB</b></p><p><span>Tiempo</span><b>{selected.runtime}</b></p><p><span>Hilos</span><b>{selected.threads}</b></p><p><span>ID técnico</span><b>{selected.pid}</b></p></div><article className="chart"><header><b>Historial CPU</b><small>últimas 8 muestras</small></header><Spark data={selected.cpuHistory} color={cpuColor(selected)} label="historial de CPU"/></article><article className="chart"><header><b>Historial memoria</b><small>RSS · MB</small></header><Spark data={selected.memHistory} color="#27D7FF" label="historial de memoria"/></article><h3>Procesos hijos</h3><div className="chips">{selected.childIds.length ? selected.childIds.map(id=><button key={id} onClick={()=>setSelectedId(id)}>{processMap[id].name}</button>) : <span>proceso hoja</span>}</div><div className="insight"><b>Nota:</b> {selected.cpu >= 80 ? 'CPU sobre umbral crítico; revisa descendientes y contención.' : selected.memory > 1800 ? 'RSS elevado frente a procesos hermanos; vigila tendencia.' : 'Perfil dentro de márgenes operativos esperados.'}</div></aside>
    </div>
  </>;
}

const css = `
:root{--accent:var(--ocd-tweak-accent-color,#27D7FF);--panel:rgba(18,30,52,var(--ocd-tweak-panel-opacity,.74));--glow:var(--ocd-tweak-glow-strength,1)}*{box-sizing:border-box}body{margin:0;background:#07111f;color:#e6edf7;font-family:Manrope, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;overflow:hidden}.app{min-height:100vh;display:grid;grid-template-columns:76px minmax(720px,1fr) 360px;gap:18px;padding:18px;background:radial-gradient(circle at 22% 12%,rgba(39,215,255,.15),transparent 34%),radial-gradient(circle at 84% 18%,rgba(0,255,136,.08),transparent 28%),linear-gradient(135deg,#0f172a,#07111f 70%)}.rail,.main,.panel,.stat,.legend,.card,.alert,.audit,.settings article{background:var(--panel);border:1px solid rgba(142,163,189,.18);box-shadow:0 24px 70px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.06);backdrop-filter:blur(18px)}.rail{border-radius:28px;display:flex;align-items:center;flex-direction:column;padding:14px 10px;gap:14px}.mark{width:44px;height:44px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(135deg,rgba(39,215,255,.28),rgba(0,255,136,.1));color:var(--accent);font-size:26px}.rail-btn{width:46px;height:46px;border:0;border-radius:17px;background:rgba(255,255,255,.04);color:#8ea3bd;font-size:18px;cursor:pointer;transition:.25s}.rail-btn:hover,.rail-btn.active{color:#e6edf7;background:rgba(39,215,255,.13);box-shadow:0 0 calc(26px * var(--glow)) rgba(39,215,255,.35)}.main{border-radius:28px;padding:18px;min-width:0;display:flex;flex-direction:column;gap:14px;overflow:hidden}.top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.top p,.screen-hero p{margin:0 0 6px;color:#27d7ff;text-transform:uppercase;letter-spacing:.14em;font-size:11px;font-weight:900}.top h1{margin:0;font-size:clamp(25px,3vw,38px);line-height:1.04}.notice{display:inline-flex;gap:8px;align-items:center;margin-top:10px;color:#aac0d8;border:1px solid rgba(142,163,189,.16);background:rgba(7,17,31,.5);padding:7px 11px;border-radius:999px;font-size:12px}.notice i{width:8px;height:8px;border-radius:50%;background:#00ff88;box-shadow:0 0 18px #00ff88}.actions{display:flex;gap:10px}.actions input,.actions button{border:1px solid rgba(142,163,189,.18);border-radius:999px;background:rgba(7,17,31,.55);color:#e6edf7;padding:12px 15px}.actions button{cursor:pointer}.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.stat{border-radius:22px;padding:14px;position:relative;overflow:hidden}.stat i{width:10px;height:10px;border-radius:50%;display:block;margin-bottom:10px;box-shadow:0 0 18px currentColor}.orange{color:#ff9800}.green{color:#00ff88}.cyan{color:#27d7ff}.gray{color:#666}.red{color:#ff0000}.stat span{display:block;color:#8ea3bd;font-size:12px}.stat b{display:block;font-size:24px;margin:2px 0}.stat small{color:#8ea3bd}.workspace{display:grid;grid-template-rows:minmax(420px,1fr) auto;gap:12px;min-height:0;flex:1}.graph{position:relative;min-height:0;border-radius:28px;overflow:hidden;background:linear-gradient(180deg,rgba(15,23,42,.72),rgba(7,17,31,.94));border:1px solid rgba(142,163,189,.15);cursor:grab}.graph.dragging{cursor:grabbing}.aurora{position:absolute;inset:-20%;background:radial-gradient(circle at 44% 8%,rgba(39,215,255,.18),transparent 30%),radial-gradient(circle at 54% 76%,rgba(0,255,136,.08),transparent 28%);filter:blur(6px)}.particles i{position:absolute;width:3px;height:3px;border-radius:50%;background:#27d7ff;opacity:.45;animation:float 7s infinite ease-in-out}.particles i:nth-child(1){left:12%;top:20%}.particles i:nth-child(2){left:34%;top:65%;animation-delay:-2s}.particles i:nth-child(3){left:61%;top:24%;animation-delay:-4s}.particles i:nth-child(4){left:82%;top:58%;animation-delay:-1s}.particles i:nth-child(5){left:50%;top:82%;animation-delay:-3s}.viewport{position:absolute;left:50%;top:0;width:1280px;height:830px;transform-origin:top left}.topology{position:absolute;inset:0;width:1280px;height:830px;overflow:visible}.ring{fill:none;stroke:rgba(142,163,189,.12);stroke-dasharray:4 10}.lane{fill:none;stroke:rgba(39,215,255,.11);stroke-width:18;stroke-linecap:round}.edge{fill:none;stroke:var(--c);stroke-width:1.55;opacity:.48;stroke-dasharray:8 10;filter:drop-shadow(0 0 6px var(--c));animation:dash 18s linear infinite}.edge.hot{opacity:.95;stroke-width:2.7;filter:drop-shadow(0 0 calc(18px * var(--glow)) var(--c))}.node-wrap{position:absolute;transform:translate(-50%,-50%);z-index:3}.node{border:1px solid rgba(255,255,255,.58);border-radius:50%;background:radial-gradient(circle at 34% 28%,rgba(255,255,255,.28),transparent 22%),color-mix(in srgb,var(--c),#0f172a 54%);color:#e6edf7;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;cursor:pointer;box-shadow:0 0 calc(23px * var(--glow)) color-mix(in srgb,var(--c),transparent 52%),inset 0 0 20px rgba(255,255,255,.08);transition:.22s}.node:hover,.node.selected{transform:scale(1.1);box-shadow:0 0 calc(42px * var(--glow)) var(--c),0 0 0 8px color-mix(in srgb,var(--c),transparent 84%)}.node span{font-size:12px;font-weight:900;max-width:86%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.node small,.node em{font:700 10px ui-monospace,SFMono-Regular,Menlo,monospace;color:#d9f4ff}.tip{position:absolute;left:70%;top:-10px;min-width:150px;padding:10px;border-radius:15px;background:rgba(7,17,31,.9);border:1px solid rgba(142,163,189,.25);box-shadow:0 20px 60px rgba(0,0,0,.4);z-index:8}.tip span{display:flex;color:#8ea3bd;font-size:12px}.hud{position:absolute;left:16px;bottom:16px;display:flex;gap:10px}.hud span,.hud b{border-radius:999px;padding:8px 11px;background:rgba(7,17,31,.7);border:1px solid rgba(142,163,189,.18);font-size:12px}.legend{border-radius:22px;padding:12px;display:grid;grid-template-columns:1.1fr 1fr 1.7fr;gap:12px}.legend h2{font-size:12px;margin:0 0 8px}.legend p{margin:6px 0;color:#c5d5e7;font-size:12px}.legend p i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:8px}.legend small{color:#8ea3bd}.sizes{display:flex;align-items:center;gap:9px}.sizes i{border-radius:50%;background:rgba(39,215,255,.32);border:1px solid #27d7ff}.sizes i:nth-child(1){width:16px;height:16px}.sizes i:nth-child(2){width:30px;height:30px}.sizes i:nth-child(3){width:46px;height:46px}.sizes b{font-size:12px}.panel{border-radius:28px;padding:18px;overflow:auto}.panel header{display:flex;justify-content:space-between;gap:12px}.panel h2{margin:0;font-size:24px}.panel p{margin:4px 0 0;color:#8ea3bd}.panel header span{height:max-content;border-radius:999px;padding:7px 10px;background:rgba(39,215,255,.12);font-size:12px}.details{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0}.details p,.chart{margin:0;border:1px solid rgba(142,163,189,.16);border-radius:18px;padding:12px;background:rgba(7,17,31,.42)}.details span{display:block;color:#8ea3bd;font-size:12px}.details b{font-size:16px}.chart{margin-bottom:12px}.chart header,.card header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.spark{width:100%;height:54px}.chips{display:flex;flex-wrap:wrap;gap:8px}.chips button,.chips span{border:1px solid rgba(142,163,189,.18);background:rgba(39,215,255,.08);color:#e6edf7;border-radius:999px;padding:8px 10px}.insight{margin-top:16px;padding:14px;border-radius:18px;background:linear-gradient(135deg,rgba(39,215,255,.11),rgba(0,255,136,.06));color:#c5d5e7}.screen{flex:1;overflow:auto}.screen-hero{padding:24px;border-radius:28px;background:linear-gradient(135deg,rgba(39,215,255,.14),rgba(18,30,52,.62));border:1px solid rgba(142,163,189,.16);margin-bottom:14px}.screen-hero.danger{background:linear-gradient(135deg,rgba(255,0,0,.12),rgba(255,152,0,.08))}.screen-hero h2{margin:0;font-size:31px}.screen-hero span,.note{color:#8ea3bd}.screen-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:14px}.wide{grid-row:span 2}.card{border-radius:24px;padding:18px}.rank,.alert,.audit-row{width:100%;text-align:left;color:#e6edf7;border:1px solid rgba(142,163,189,.14);background:rgba(7,17,31,.35);border-radius:17px;padding:12px;margin-top:9px;cursor:pointer;position:relative;overflow:hidden}.rank{display:flex;justify-content:space-between}.rank small{display:block;color:#8ea3bd}.rank i{position:absolute;height:2px;left:12px;bottom:0}.mega{font-size:44px}.bars{height:170px;display:flex;align-items:end;gap:10px}.bars span{flex:1;border-radius:999px 999px 4px 4px;box-shadow:0 0 18px currentColor}.alert-stack{display:grid;gap:10px}.alert{display:grid;grid-template-columns:12px 1fr auto;align-items:center;gap:14px}.alert i{width:12px;height:42px;border-radius:999px;box-shadow:0 0 18px currentColor}.alert small{display:block;color:#8ea3bd}.alert em{color:#27d7ff;font-style:normal}.audit{border-radius:24px;border:1px solid rgba(142,163,189,.16);overflow:hidden}.audit-head,.audit-row{display:grid;grid-template-columns:1.1fr .8fr .9fr 1fr .9fr;gap:12px;align-items:center}.audit-head{padding:13px 14px;color:#8ea3bd;background:rgba(7,17,31,.55);font-size:12px}.audit-row{border-radius:0;margin:0;border-width:1px 0 0}.settings{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.settings article{border-radius:24px;padding:20px}.settings span{color:#8ea3bd}.settings b{display:block;font-size:24px;margin:8px 0}.settings small{color:#8ea3bd}@keyframes dash{to{stroke-dashoffset:-180}}@keyframes float{50%{transform:translateY(-24px);opacity:.9}}@media (max-width:1180px){body{overflow:auto}.app{grid-template-columns:64px 1fr}.panel{grid-column:2}.stats{grid-template-columns:repeat(2,1fr)}.legend{grid-template-columns:1fr}.screen-grid,.settings{grid-template-columns:1fr}}@media (prefers-reduced-motion:reduce){*,.edge,.particles i{animation:none!important;transition:none!important}}
`;

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
