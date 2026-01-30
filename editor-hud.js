class EditorHUD {
  async invoke() {
    const obs = require("obsidian");
    const { MarkdownView, Notice } = obs;

    const TOGGLE_KEY = "hud_enabled_v5";
    const RECENT_KEY = "hud_recent_v5";

    // Preview apenas pra desenhar os botões
    const PREVIEW = {
      // text
      "c-red":"#ef4444","c-orange":"#f97316","c-yellow":"#facc15","c-green":"#22c55e","c-cyan":"#06b6d4","c-blue":"#3b82f6","c-purple":"#a855f7","c-pink":"#ec4899","c-gray":"#9ca3af","c-white":"#ffffff",
      // highlight
      "hl-red":"#7f1d1d","hl-orange":"#7c2d12","hl-yellow":"#78350f","hl-green":"#14532d","hl-cyan":"#164e63","hl-blue":"#1e3a8a","hl-purple":"#4c1d95","hl-pink":"#831843","hl-gray":"#374151","hl-white":"#e5e7eb",
      // badge
      "badge-red":"#ef4444","badge-orange":"#f97316","badge-yellow":"#facc15","badge-green":"#22c55e","badge-cyan":"#06b6d4","badge-blue":"#3b82f6","badge-purple":"#a855f7","badge-pink":"#ec4899","badge-gray":"#9ca3af","badge-white":"#ffffff",
    };

    // Ordem das paletas
    const TEXT = ["c-green","c-yellow","c-red","c-blue","c-pink","c-purple","c-gray","c-orange","c-cyan","c-white"];
    const HL   = ["hl-red","hl-blue","hl-green","hl-yellow","hl-orange","hl-purple","hl-pink","hl-cyan","hl-gray","hl-white"];
    const BD   = ["badge-green","badge-yellow","badge-red","badge-blue","badge-pink","badge-purple","badge-gray","badge-orange","badge-cyan","badge-white"];

    const FAIXAS = [
      { cls:"faixa-amarela", color:"#facc15" },
      { cls:"faixa-azul", color:"#3b82f6" },
      { cls:"faixa-verde", color:"#22c55e" },
      { cls:"faixa-vermelha", color:"#ef4444" },
      { cls:"faixa-laranja", color:"#f97316" },
      { cls:"faixa-roxa", color:"#a855f7" },
      { cls:"faixa-rosa", color:"#ec4899" },
      { cls:"faixa-cinza", color:"#9ca3af" },
    ];

    // ===== Utils =====
    const isEnabled = () => (localStorage.getItem(TOGGLE_KEY) ?? "1") === "1";

    // LER RECENTES UNIFICADOS (até 8 itens)
    const readRecent = () => {
      try {
        const data = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
        return Array.isArray(data) ? data.slice(0, 8) : [];
      } catch {
        return [];
      }
    };

    // ADICIONAR RECENTE UNIFICADO
    const pushRecent = (kind, cls) => {
      const recent = readRecent();
      
      const newItem = { 
        kind, 
        cls, 
        time: Date.now(),
        type: kind === "text" ? "texto" : kind === "hl" ? "highlight" : "badge"
      };
      
      const filtered = recent.filter(item => !(item.kind === kind && item.cls === cls));
      filtered.unshift(newItem);
      
      const updated = filtered.slice(0, 8);
      localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
    };

    const getEditor = () => app.workspace.getActiveViewOfType(MarkdownView)?.editor || null;

    const hasSelection = () => {
      const ed = getEditor();
      const s = ed?.getSelection();
      return !!(s && s.trim());
    };

    // Remove spans da paleta (todos)
    const stripAllPaletteSpans = (txt) => txt
      .replace(/<span[^>]*class="[^"]*?\b(c-|hl-|badge-)[^"]*?"[^>]*>/g, "")
      .replace(/<\/span>/g, "");

    // Remove apenas spans do mesmo tipo (pra trocar sem empilhar)
    const stripKind = (txt, kind) => {
      if (kind === "text")  return txt.replace(/<span[^>]*class="[^"]*?\bc-[^"]*?"[^>]*>/g, "").replace(/<\/span>/g, "");
      if (kind === "hl")    return txt.replace(/<span[^>]*class="[^"]*?\bhl-[^"]*?"[^>]*>/g, "").replace(/<\/span>/g, "");
      if (kind === "badge") return txt.replace(/<span[^>]*class="[^"]*?\bbadge-[^"]*?"[^>]*>/g, "").replace(/<\/span>/g, "");
      return txt;
    };

    // PATCH: markdown inline básico -> HTML
    const mdInlineToHtml = (txt) => {
      return txt
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/__(.+?)__/g, "<strong>$1</strong>")
        .replace(/\*(?!\*)(.+?)\*/g, "<em>$1</em>")
        .replace(/_(.+?)_/g, "<em>$1</em>");
    };

    // Wrappers de BLOCO
    const WRAPPERS = [
      { name:"centerDiv", open: /^<div[^>]*style="[^"]*text-align\s*:\s*center[^"]*"[^>]*>/i, close: /<\/div>\s*$/i },
      { name:"centerP",   open: /^<p[^>]*style="[^"]*text-align\s*:\s*center[^"]*"[^>]*>/i,   close: /<\/p>\s*$/i },
      { name:"faixa",     open: /^<div[^>]*class="[^"]*\bfaixa\b[^"]*"[^>]*>/i,               close: /<\/div>\s*$/i },
      { name:"h1",        open: /^<h1[^>]*>/i, close: /<\/h1>\s*$/i },
      { name:"h2",        open: /^<h2[^>]*>/i, close: /<\/h2>\s*$/i },
      { name:"h3",        open: /^<h3[^>]*>/i, close: /<\/h3>\s*$/i },
    ];

    const trySplitOuterWrapper = (sel) => {
      for (const w of WRAPPERS) {
        const mOpen = sel.match(w.open);
        if (mOpen && w.close.test(sel)) {
          const openTag = mOpen[0];
          const closeTag = sel.match(w.close)[0];
          const inner = sel.slice(openTag.length, sel.length - closeTag.length);
          return { matched: true, openTag, inner, closeTag };
        }
      }
      return { matched: false };
    };

    // ===== Aplicar cor/hl/badge =====
    const applyWrap = (cls, kind) => {
      const ed = getEditor(); if (!ed) return;
      const sel = ed.getSelection();
      if (!sel || !sel.trim()) return;

      const split = trySplitOuterWrapper(sel);

      if (split.matched) {
        const innerNoSameKind = stripKind(split.inner, kind);
        const innerNoPalette = stripAllPaletteSpans(innerNoSameKind);
        const innerFinal = mdInlineToHtml(innerNoPalette);

        ed.replaceSelection(`${split.openTag}<span class="${cls}">${innerFinal}</span>${split.closeTag}`);
      } else {
        const noSameKind = stripKind(sel, kind);
        const noPalette = stripAllPaletteSpans(noSameKind);
        const final = mdInlineToHtml(noPalette);

        ed.replaceSelection(`<span class="${cls}">${final}</span>`);
      }

      pushRecent(kind, cls);
    };

    const removeKind = (kind) => {
      const ed = getEditor(); if (!ed) return;
      const sel = ed.getSelection();
      if (!sel || !sel.trim()) return;

      const split = trySplitOuterWrapper(sel);
      if (split.matched) {
        ed.replaceSelection(`${split.openTag}${stripKind(split.inner, kind)}${split.closeTag}`);
        return;
      }
      ed.replaceSelection(stripKind(sel, kind));
    };

    const removeAllPalette = () => {
      const ed = getEditor(); if (!ed) return;
      const sel = ed.getSelection();
      if (!sel || !sel.trim()) return;

      const split = trySplitOuterWrapper(sel);
      if (split.matched) {
        ed.replaceSelection(`${split.openTag}${stripAllPaletteSpans(split.inner)}${split.closeTag}`);
        return;
      }
      ed.replaceSelection(stripAllPaletteSpans(sel));
    };

    // ===== B / I / U =====
    const toggleTag = (open, close) => {
      const ed = getEditor(); if (!ed) return;
      const sel = ed.getSelection(); if (!sel || !sel.trim()) return;

      if (sel.startsWith(open) && sel.endsWith(close)) {
        ed.replaceSelection(sel.slice(open.length, sel.length - close.length));
      } else {
        ed.replaceSelection(open + sel + close);
      }
    };

    // ===== CENTRALIZAR =====
    const toggleCenter = () => {
      const ed = getEditor(); if (!ed) return;
      const sel = ed.getSelection(); if (!sel || !sel.trim()) return;

      const openDiv = /^<div[^>]*style="[^"]*text-align\s*:\s*center[^"]*"[^>]*>/i;
      const closeDiv = /<\/div>\s*$/i;

      if (openDiv.test(sel) && closeDiv.test(sel)) {
        const out = sel.replace(openDiv, "").replace(closeDiv, "");
        ed.replaceSelection(out);
        return;
      }

      ed.replaceSelection(`<div style="white-space: pre; text-align:center;">\n${sel}\n</div>`);
    };

    // ===== TAMANHO =====
    const unwrapOuter = (sel, tag) => {
      const open = new RegExp(`^<${tag}[^>]*>`, "i");
      const close = new RegExp(`</${tag}>\\s*$`, "i");
      if (open.test(sel) && close.test(sel)) {
        return { changed: true, value: sel.replace(open, "").replace(close, "") };
      }
      return { changed: false, value: sel };
    };

    const applyHeading = (level) => {
      const ed = getEditor(); if (!ed) return;
      const sel = ed.getSelection(); if (!sel || !sel.trim()) return;

      if (level === 0) {
        let out = sel;
        for (const t of ["h1","h2","h3"]) {
          const u = unwrapOuter(out, t);
          if (u.changed) out = u.value;
        }
        ed.replaceSelection(out);
        return;
      }

      const tag = `h${level}`;

      const uSame = unwrapOuter(sel, tag);
      if (uSame.changed) { ed.replaceSelection(uSame.value); return; }

      let base = sel;
      for (const t of ["h1","h2","h3"]) {
        const u = unwrapOuter(base, t);
        if (u.changed) base = u.value;
      }
      ed.replaceSelection(`<${tag}>${base}</${tag}>`);
    };

    // ===== FAIXAS =====
    const applyFaixa = (faixaCls) => {
      const ed = getEditor(); if (!ed) return;
      const sel = ed.getSelection(); if (!sel || !sel.trim()) return;

      const openFaixa = /^<div[^>]*class="[^"]*\bfaixa\b[^"]*"[^>]*>/i;
      const closeDiv = /<\/div>\s*$/i;

      let inner = sel;
      if (openFaixa.test(sel) && closeDiv.test(sel)) {
        inner = sel.replace(openFaixa, "").replace(closeDiv, "");
      }

      const clean = stripAllPaletteSpans(inner);
      ed.replaceSelection(`<div class="faixa ${faixaCls}">${clean}</div>`);
    };

    // ===== UI =====
    let bar = null;
    let popA = null;
    let popFaixas = null;
    let popSize = null;
    let debounce = null;
    let lockRerenderUntil = 0;

    const closeAllUI = () => {
      bar?.remove();
      bar = null;
      popA = null;
      popFaixas = null;
      popSize = null;
    };

    const place = () => {
      if (!bar) return;

      let r = null;

      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          r = sel.getRangeAt(0).getBoundingClientRect();
        }
      } catch (_) {}

      const invalidRect = !r || (
        r.width === 0 && r.height === 0 && r.left === 0 && r.top === 0
      );

      if (invalidRect) {
        try {
          const view = app.workspace.getActiveViewOfType(MarkdownView);
          const ed = view?.editor;
          const cm = ed?.cm;
          if (cm?.coordsAtPos && ed?.posToOffset) {
            const pos = ed.posToOffset(ed.getCursor());
            const c = cm.coordsAtPos(pos);
            if (c) {
              r = { left: c.left, right: c.right, top: c.top, bottom: c.bottom, width: (c.right-c.left)||1, height: (c.bottom-c.top)||1 };
            }
          }
        } catch (_) {}
      }

      if (!r) return;

      const x = r.left + (r.width / 2);
      const y = r.top;

      bar.style.left = `${x}px`;
      bar.style.top = `${y}px`;

      const rect = bar.getBoundingClientRect();
      let left = x - rect.width / 2;
      let top = y - rect.height - 10;
      if (top < 10) top = y + 12;

      const m = 10;
      left = Math.max(m, Math.min(left, window.innerWidth - rect.width - m));
      top  = Math.max(m, Math.min(top, window.innerHeight - rect.height - m));
      bar.style.left = `${left}px`;
      bar.style.top  = `${top}px`;

      const fix = (pop) => {
        if (!pop || !pop.classList.contains("open")) return;

        pop.style.left = "0";
        pop.style.right = "auto";
        pop.style.top = "calc(100% + 8px)";
        pop.style.bottom = "auto";

        const barRect = bar.getBoundingClientRect();
        const popRect = pop.getBoundingClientRect();

        const spaceBelow = window.innerHeight - (barRect.bottom + 10);
        if (spaceBelow < popRect.height) {
          pop.style.top = "auto";
          pop.style.bottom = "calc(100% + 8px)";
        }

        const wouldRight = barRect.left + popRect.width;
        if (wouldRight > window.innerWidth - 10) {
          pop.style.left = "auto";
          pop.style.right = "0";
        }
      };

      fix(popA);
      fix(popFaixas);
      fix(popSize);
    };

    const mkBtn = (label, { wide=false, onClick }) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `hudbtn${wide ? " wide" : ""}`;
      b.textContent = label;

      b.addEventListener("mousedown", () => { lockRerenderUntil = Date.now() + 500; });
      b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onClick?.(); });

      return b;
    };

    const sep = () => {
      const s = document.createElement("div");
      s.className = "hudsep";
      return s;
    };

    // Botão para paleta principal
    const mkPalBtn = (kind, cls) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `pbtn ${kind === "text" ? "t" : kind === "hl" ? "hl" : "bd"}`;

      const color = PREVIEW[cls] || "#374151";

      if (kind === "text") {
        b.textContent = "A";
        b.style.color = color;
        b.style.background = "transparent";
      } else {
        b.style.background = color;
      }

      b.addEventListener("mousedown", () => { lockRerenderUntil = Date.now() + 500; });
      b.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        applyWrap(cls, kind);
        closeAllUI();
      });

      return b;
    };

    // Botão para RECENTES
    const mkRecentBtn = (item) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `recente-item ${item.type}`;
      
      const color = PREVIEW[item.cls] || "#374151";
      
      if (item.kind === "text") {
        b.textContent = "A";
        b.style.color = color;
        b.style.background = "transparent";
      } else if (item.kind === "hl") {
        b.style.background = color;
        b.textContent = "";
      } else {
        b.textContent = "";
        b.style.background = color;
        b.style.color = "#000000";
      }
      
      b.title = item.cls;
      b.addEventListener("mousedown", () => { lockRerenderUntil = Date.now() + 500; });
      b.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        applyWrap(item.cls, item.kind);
        closeAllUI();
      });
      
      return b;
    };

    // ===== POPUP A =====
    const renderPaletaA = () => {
      popA.innerHTML = "";

      const title = document.createElement("div");
      title.className = "hudtitle";

      const left = document.createElement("div");
      left.className = "hudtitle-left";
      const dot = document.createElement("div"); dot.className = "hud-dot";
      const txt = document.createElement("div"); txt.textContent = "Paleta";
      left.append(dot, txt);

      const x = document.createElement("button");
      x.type = "button"; x.className = "hud-close"; x.textContent = "×";
      x.addEventListener("click",(e)=>{e.preventDefault();e.stopPropagation();popA.classList.remove("open");});

      title.append(left, x);
      popA.appendChild(title);

      // SECÇÃO DE RECENTES UNIFICADOS
      const recent = readRecent();
      if (recent.length > 0) {
        const secR = document.createElement("div");
        secR.className = "hud-sec";
        
        const rt = document.createElement("div"); 
        rt.className = "hud-sec-title"; 
        rt.textContent = "Recentes";
        secR.appendChild(rt);
        
        const container = document.createElement("div");
        container.className = "hud-recentes-container";
        
        recent.forEach(item => {
          container.appendChild(mkRecentBtn(item));
        });
        
        secR.appendChild(container);
        
        const clearRecent = document.createElement("button");
        clearRecent.className = "hud-clear-recentes";
        clearRecent.textContent = "Limpar recentes";
        clearRecent.addEventListener("click", (e) => {
          e.preventDefault(); e.stopPropagation();
          localStorage.setItem(RECENT_KEY, JSON.stringify([]));
          renderPaletaA();
        });
        
        secR.appendChild(clearRecent);
        popA.appendChild(secR);
      }

      // Cores do texto
      const s1 = document.createElement("div");
      s1.className = "hud-sec";
      const t1 = document.createElement("div"); t1.className="hud-sec-title"; t1.textContent="Cores do texto";
      const r1 = document.createElement("div"); r1.className="hud-row";
      TEXT.forEach(cls => r1.appendChild(mkPalBtn("text", cls)));
      const rr1 = document.createElement("button"); rr1.className="hud-remove-mini"; rr1.textContent="⦸";
      rr1.addEventListener("click",(e)=>{e.preventDefault();e.stopPropagation();removeKind("text");});
      r1.appendChild(rr1);
      s1.append(t1,r1);
      popA.appendChild(s1);

      // Destaques
      const s2 = document.createElement("div");
      s2.className = "hud-sec";
      const t2 = document.createElement("div"); t2.className="hud-sec-title"; t2.textContent="Destaques do texto";
      const r2 = document.createElement("div"); r2.className="hud-row";
      HL.forEach(cls => r2.appendChild(mkPalBtn("hl", cls)));
      const rr2 = document.createElement("button"); rr2.className="hud-remove-mini"; rr2.textContent="⦸";
      rr2.addEventListener("click",(e)=>{e.preventDefault();e.stopPropagation();removeKind("hl");});
      r2.appendChild(rr2);
      s2.append(t2,r2);
      popA.appendChild(s2);

      // Selos
      const s3 = document.createElement("div");
      s3.className = "hud-sec";
      const t3 = document.createElement("div"); t3.className="hud-sec-title"; t3.textContent="Selos";
      const r3 = document.createElement("div"); r3.className="hud-row";
      BD.forEach(cls => r3.appendChild(mkPalBtn("badge", cls)));
      const rr3 = document.createElement("button"); rr3.className="hud-remove-mini"; rr3.textContent="⦸";
      rr3.addEventListener("click",(e)=>{e.preventDefault();e.stopPropagation();removeKind("badge");});
      r3.appendChild(rr3);
      s3.append(t3,r3);
      popA.appendChild(s3);

      // Botão remover todas
      const clear = document.createElement("button");
      clear.className = "hud-clear";
      clear.textContent = "Remover todas as cores";
      clear.addEventListener("click",(e)=>{e.preventDefault();e.stopPropagation();removeAllPalette(); closeAllUI();});
      popA.appendChild(clear);
      
      const help = document.createElement("div");
      help.className = "hud-help";
      help.textContent = "Clique em ⦸ para remover cores do texto selecionado";
      popA.appendChild(help);
    };

    // ===== POPUP FAIXAS =====
    const renderFaixas = () => {
      popFaixas.innerHTML = "";

      const t = document.createElement("div");
      t.className = "hud-sec-title";
      t.textContent = "Faixas";
      popFaixas.appendChild(t);

      const row = document.createElement("div");
      row.className = "hud-row";

      FAIXAS.forEach(f => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "pbtn bd";
        b.style.background = f.color;
        b.title = f.cls;
        b.addEventListener("mousedown", () => { lockRerenderUntil = Date.now() + 500; });
        b.addEventListener("click",(e)=>{e.preventDefault();e.stopPropagation();applyFaixa(f.cls); closeAllUI();});
        row.appendChild(b);
      });

      popFaixas.appendChild(row);
    };

    // ===== POPUP TAMANHO =====
    const renderSize = () => {
      popSize.innerHTML = "";

      const t = document.createElement("div");
      t.className = "hud-sec-title";
      t.textContent = "Tamanho";
      popSize.appendChild(t);

      const row = document.createElement("div");
      row.className = "hud-row";

      const mk = (label, lvl) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "hudbtn wide";
        b.textContent = label;
        b.addEventListener("mousedown", () => { lockRerenderUntil = Date.now() + 500; });
        b.addEventListener("click",(e)=>{e.preventDefault();e.stopPropagation();applyHeading(lvl); closeAllUI();});
        return b;
      };

      row.append(mk("Texto", 0), mk("H1", 1), mk("H2", 2), mk("H3", 3));
      popSize.appendChild(row);
    };

    const renderUI = () => {
      closeAllUI();
      if (!isEnabled()) return;
      if (!hasSelection()) return;

      bar = document.createElement("div");
      bar.className = "hudbar";
      bar.style.position = "fixed";

      const btnA = mkBtn("A", {
        onClick: () => {
          const open = popA.classList.contains("open");
          popA.classList.toggle("open", !open);
          popFaixas.classList.remove("open");
          popSize.classList.remove("open");
          if (!open) renderPaletaA();
          place();
        }
      });

      const bB = mkBtn("B", { onClick: () => toggleTag("<strong>","</strong>") });
      const bI = mkBtn("I", { onClick: () => toggleTag("<em>","</em>") });
      const bU = mkBtn("U", { onClick: () => toggleTag("<u>","</u>") });

          // Botão de centralizar COM IMAGEM (usando Obsidian API)
const bC = document.createElement("button");
bC.type = "button";
bC.className = "hudbtn";
bC.title = "Centralizar texto";

// ✅ TENTA CARREGAR VIA OBSIDIAN API
(async () => {
  try {
    // Lê o arquivo como array de bytes
    const fileData = await app.vault.adapter.read("assets/center-icon.png");
    
    // Converte para blob
    const blob = new Blob([fileData], { type: "image/png" });
    
    // Cria URL do blob
    const blobUrl = URL.createObjectURL(blob);
    
    // Cria imagem
    const img = new Image();
    img.src = blobUrl;
    img.alt = "Centralizar";
    img.style.width = "16px";
    img.style.height = "16px";
    img.style.display = "block";
    img.style.margin = "0 auto";
    img.style.opacity = "0.7";
    
    // Limpa o conteúdo anterior (se houver fallback)
    bC.innerHTML = "";
    bC.appendChild(img);
    
    console.log("✅ Imagem carregada com sucesso!");
    
  } catch (err) {
    console.log("❌ Não conseguiu carregar a imagem, usando fallback");
    // Fallback para SVG
    bC.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        style="display:block;margin:0 auto;opacity:0.7">
        <line x1="6" y1="4" x2="18" y2="4"></line>
        <line x1="8" y1="9" x2="16" y2="9"></line>
        <line x1="6" y1="14" x2="18" y2="14"></line>
        <line x1="8" y1="19" x2="16" y2="19"></line>
      </svg>
    `;
  }
})();

bC.addEventListener("mousedown", () => { lockRerenderUntil = Date.now() + 500; });
bC.addEventListener("click", (e) => {
  e.preventDefault(); e.stopPropagation();
  toggleCenter();
  closeAllUI();
});

      const bF = mkBtn("Faixas", {
        wide:true,
        onClick: () => {
          const open = popFaixas.classList.contains("open");
          popFaixas.classList.toggle("open", !open);
          popA.classList.remove("open");
          popSize.classList.remove("open");
          if (!open) renderFaixas();
          place();
        }
      });

      const bT = mkBtn("Tamanho", {
        wide:true,
        onClick: () => {
          const open = popSize.classList.contains("open");
          popSize.classList.toggle("open", !open);
          popA.classList.remove("open");
          popFaixas.classList.remove("open");
          if (!open) renderSize();
          place();
        }
      });

      // Nova ordem: B I U | Centralizar | A | Faixas | Tamanho
      bar.append(bB, bI, bU, sep(), bC, sep(), btnA, sep(), bF, bT);

      popA = document.createElement("div");      popA.className = "hud-pop";
      popFaixas = document.createElement("div"); popFaixas.className = "hud-pop";
      popSize = document.createElement("div");   popSize.className = "hud-pop";

      bar.append(popA, popFaixas, popSize);

      document.body.appendChild(bar);
      place();
    };

    const schedule = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (Date.now() < lockRerenderUntil) return;
        if (!hasSelection()) closeAllUI();
        else renderUI();
      }, 90);
    };

    // ===== API =====
    window.__HUD_API__ = {
      text: (cls) => applyWrap(cls, "text"),
      hl: (cls) => applyWrap(cls, "hl"),
      badge: (cls) => applyWrap(cls, "badge"),
      removeText: () => removeKind("text"),
      removeHL: () => removeKind("hl"),
      removeBadge: () => removeKind("badge"),
      removeAll: () => removeAllPalette(),
      bold: () => toggleTag("<strong>","</strong>"),
      italic: () => toggleTag("<em>","</em>"),
      underline: () => toggleTag("<u>","</u>"),
      center: () => toggleCenter(),
      h1: () => applyHeading(1),
      h2: () => applyHeading(2),
      h3: () => applyHeading(3),
      textSizeNormal: () => applyHeading(0),
      faixa: (faixaCls) => applyFaixa(faixaCls),
      ping: () => new Notice("HUD API OK"),
    };

    // listeners
    document.addEventListener("selectionchange", schedule, true);
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAllUI(); }, true);
    window.addEventListener("resize", () => place(), true);
    window.addEventListener("scroll", () => place(), true);
    window.addEventListener("mousedown", (e) => { if (bar && !bar.contains(e.target)) closeAllUI(); }, true);

    // MIGRAÇÃO
    try {
      const oldData = localStorage.getItem("hud_recent_v3");
      if (oldData) {
        const old = JSON.parse(oldData);
        const newRecent = [];
        
        if (old.text) old.text.forEach((cls, i) => 
          newRecent.push({ kind: "text", cls, type: "texto", time: Date.now() - i * 1000 }));
        if (old.hl) old.hl.forEach((cls, i) => 
          newRecent.push({ kind: "hl", cls, type: "highlight", time: Date.now() - i * 1000 - 10000 }));
        if (old.badge) old.badge.forEach((cls, i) => 
          newRecent.push({ kind: "badge", cls, type: "badge", time: Date.now() - i * 1000 - 20000 }));
        
        newRecent.sort((a, b) => b.time - a.time);
        localStorage.setItem(RECENT_KEY, JSON.stringify(newRecent.slice(0, 8)));
        localStorage.removeItem("hud_recent_v3");
      }
    } catch (e) {}

    schedule();
  }
}