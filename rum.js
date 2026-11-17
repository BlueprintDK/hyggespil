/* Hyggespil web-udgave: SPIL SAMMEN FRA HVER SIN TELEFON (v2).
 *
 * Erstatter originalens rum.js (som kørte via Home Assistant). Her forbindes telefonerne
 * direkte med PeerJS (WebRTC). Værtens telefon er «serveren»: den holder rummet, trækker
 * spørgsmål/ord, kender de rigtige svar og sender hver spiller sin egen visning – så
 * hemmelige ting (svar, Hangman-ordet, kortet i Forklar ordet) kun når den, der må se dem.
 *
 * Flow: Startvalg (én skærm / hver sin telefon) → navn + alder → Opret rum / Deltag med kode
 *       → lobby (værten vælger spil) → spil → tilbage til lobby.
 * Fællesspil: Quiz (alle svarer), Hangman, Hellere end, Mest sandsynlig til…, Jeg har aldrig…,
 *             Forklar ordet, Gæt og vis, Samtalekort.
 */
(function () {
  if (window.__mp) return; window.__mp = true;

  /* ---------------- småting ---------------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const rnd = n => Math.floor(Math.random() * n);
  const bland = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const vib = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
  function toast(t) {
    const b = document.createElement('div'); b.textContent = t;
    b.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:140;padding:10px 18px;max-width:90vw;text-align:center;'
      + 'border-radius:20px;background:#2ec4b6;color:#06221f;font-weight:900;box-shadow:0 8px 26px rgba(0,0,0,.4)';
    document.body.appendChild(b); setTimeout(() => b.remove(), 2600);
  }

  let enhed = lsGet('hs_enhed2', '');
  if (!enhed) { enhed = 'e' + Math.random().toString(36).slice(2, 10); lsSet('hs_enhed2', enhed); }

  /* ---------------- indhold (bruges kun af værten) ---------------- */
  const D = k => (window.DATA && Array.isArray(window.DATA[k])) ? window.DATA[k] : [];
  const QP = [
    ['blandet', '🎲 Blandet – lidt af hvert'], ['tf', 'Sandt eller falsk'], ['odd', 'Find løgnen'],
    ['city', 'I hvilket land ligger byen?'], ['zip', 'Postnummer-quiz'], ['weird', 'Mærkelige ord'], ['lang', 'Hvilket sprog?'],
    ['prov', 'Ordsprog'], ['law', 'Danske love & regler'], ['ftl_bil', 'Færdselsloven: bil'], ['ftl_cykel', 'Færdselsloven: cykel'],
    ['fb_dk', 'Dansk fodbold'], ['fb_int', 'International fodbold'], ['reality', 'Dansk reality'],
    ['mus60', 'Musik – 60’erne'], ['mus70', 'Musik – 70’erne'], ['mus80', 'Musik – 80’erne'], ['mus90', 'Musik – 90’erne'],
    ['mus00', 'Musik – 00’erne'], ['mus10', 'Musik – 10’erne'], ['musdk', 'Musik – kun dansk'], ['mgp', 'MGP'], ['bmgp', 'Børne-MGP'],
    ['film80', 'Film – 80’erne'], ['film90', 'Film – 90’erne'], ['film00', 'Film – 00’erne'], ['film10', 'Film – 10’erne'],
    ['filmdk', 'Dansk film'], ['harry', 'Harry Potter'], ['kpop', 'K-pop Demon Hunters'], ['disney', 'Disney'], ['serier', 'Serier'],
    ['roller', 'Hvem spillede rollen?'], ['julequiz', 'Julequiz'], ['julefilm', 'Julefilm'], ['julesange', 'Julesange'],
    ['gamingquiz', 'Gamingquiz'], ['spilnavn', 'Hvilket spil?'],
    ['ktf', '🧒 Børn: Sandt eller falsk'], ['kquiz', '🧒 Børn: Børnequiz'], ['kodd', '🧒 Børn: Hvad hører ikke til?'],
  ];
  const quizPuljer = () => QP.filter(([k]) => k === 'blandet' || D(k).length >= 5);
  const SPIL = {
    quiz: { t: 'Quiz – alle svarer', e: '🧠', d: 'Alle svarer på sin egen telefon. Point for rigtigt svar – og et ekstra til den hurtigste.' },
    hangman: { t: 'Hangman', e: '🪢', d: 'På skift gætter I et bogstav. Rigtigt = point, og du fortsætter.' },
    rather: { t: 'Hellere end', e: '🤔', d: 'Alle vælger A eller B. Flertallet får et point.' },
    likely: { t: 'Mest sandsynlig til…', e: '👉', d: 'Stem på en af jer. Dem, der stemte som flertallet, får et point.',
      puljer: [['likely', 'Voksne'], ['klik', '🧒 Børn & unge']] },
    never: { t: 'Jeg har aldrig…', e: '🙋', d: 'Alle svarer «det har jeg» eller «aldrig» – og så ser I, hvem der har.' },
    taboo: { t: 'Forklar ordet', e: '🗣️', d: 'Én ser ordet på sin telefon og forklarer uden de forbudte ord. De andre gætter højt.' },
    char: { t: 'Gæt og vis', e: '🎭', d: 'Én ser opgaven og viser den uden lyd. De andre gætter.',
      puljer: [['char', 'Voksne'], ['kchar', '🧒 Børn']] },
    deep: { t: 'Samtalekort', e: '💬', d: 'Et godt spørgsmål at snakke om. Ingen point – bare hygge.' },
  };
  const bags = {};
  function træk(key) {
    const list = D(key); if (!list.length) return null;
    let b = bags[key];
    if (!b || !b.length) b = bags[key] = bland(list.map((_, i) => i));
    return list[b.pop()];
  }
  const udenAlder = s => String(s || '').replace(/^\d+\|/, '');
  function mcFra(it, key) {
    let q, o, a, e;
    if (Array.isArray(it)) { q = it[0]; o = it[1]; a = it[2]; e = it[3] || ''; }
    else if (it && typeof it.s === 'string' && typeof it.t === 'boolean') return { q: it.s, o: ['Sandt', 'Falsk'], a: it.t ? 0 : 1, e: it.e || '' };
    else if (it) { q = it.q || (key === 'odd' ? 'Hvilken af disse er løgnen?' : key === 'kodd' ? 'Hvad hører ikke til?' : 'Hvad er rigtigt?'); o = it.o; a = it.a; e = it.e || ''; }
    if (!Array.isArray(o) || o.length < 2 || typeof a !== 'number') return null;
    const idx = bland(o.map((_, i) => i));
    return { q: String(q), o: idx.map(i => String(o[i])), a: idx.indexOf(a), e: String(e || '') };
  }
  const HORD = [
    ['ELEFANT', 'Dyr'], ['KOMPAS', 'Ting'], ['JORDBÆR', 'Frugt'], ['TROMPET', 'Musikinstrument'], ['SNEBOLD', 'Vinter'],
    ['KAFFE', 'Drik'], ['CYKEL', 'Transport'], ['REGNBUE', 'Vejr'], ['SKILDPADDE', 'Dyr'], ['PANDEKAGE', 'Mad'],
    ['GUITAR', 'Musikinstrument'], ['FYRTÅRN', 'Bygning'], ['PINGVIN', 'Dyr'], ['BLÆKSPRUTTE', 'Dyr'], ['SOMMERFUGL', 'Insekt'],
    ['VANDFALD', 'Natur'], ['MOTORCYKEL', 'Transport'], ['HELIKOPTER', 'Transport'], ['PARAPLY', 'Ting'], ['KÆLDER', 'I huset'],
    ['TANDBØRSTE', 'Ting'], ['FODBOLD', 'Sport'], ['KÆNGURU', 'Dyr'], ['VULKAN', 'Natur'], ['PIZZA', 'Mad'],
    ['FLÆSKESTEG', 'Mad'], ['JULEMAND', 'Jul'], ['SNEMAND', 'Vinter'], ['GIRAF', 'Dyr'], ['ASTRONAUT', 'Job'],
    ['BRANDMAND', 'Job'], ['TRAMPOLIN', 'Leg'], ['SLIKKEPIND', 'Slik'], ['SKOVSNEGL', 'Dyr'], ['LYGTEPÆL', 'Ting'],
    ['KØLESKAB', 'I huset'], ['SØRØVER', 'Eventyr'], ['DRAGE', 'Eventyr'], ['ISBJØRN', 'Dyr'], ['STRAND', 'Sted'],
  ];
  function hangOrd() {
    const tab = D('taboo').map(x => String((x && (x.w || x[0])) || '').toUpperCase()).filter(w => /^[A-ZÆØÅ]{4,12}$/.test(w)).map(w => [w, 'Et almindeligt ord']);
    const alle = HORD.concat(tab);
    return alle[rnd(alle.length)];
  }

  /* ---------------- værtens «server» ---------------- */
  let server = null;
  const find = e => server.spillere.find(p => p.enhed === e);
  const online = () => server.spillere.filter(p => p.online);
  function næsteOnline(i) {
    const n = server.spillere.length; if (!n) return 0;
    for (let k = 1; k <= n; k++) { const j = ((i == null ? -1 : i) + k) % n; if (server.spillere[j].online) return j; }
    return 0;
  }
  function startSpil(type, pulje) {
    if (!SPIL[type]) return;
    server.fase = 'spil';
    server.spil = { type, pulje: pulje || (SPIL[type].puljer ? SPIL[type].puljer[0][0] : (type === 'quiz' ? 'blandet' : '')), nr: 0, tur: null };
    nytEmne();
  }
  function nytKort(S) {
    if (S.type === 'taboo') { const it = træk('taboo') || { w: 'Kaffe', f: ['drik', 'bønne', 'kop'] }; S.kort = { w: it.w || it[0], f: it.f || [] }; }
    else S.kort = { w: udenAlder(træk(S.pulje || 'char') || 'En kat der jager en mus'), f: [] };
  }
  function nytEmne() {
    const S = server.spil; if (!S) return;
    S.nr++; S.afsl = false; S.stem = {};
    if (S.type === 'quiz') {
      let key = S.pulje, mc = null;
      for (let f = 0; f < 20 && !mc; f++) {
        key = S.pulje === 'blandet' ? (() => { const l = quizPuljer().filter(([k]) => k !== 'blandet' && k[0] !== 'k'); return l[rnd(l.length)][0]; })() : S.pulje;
        mc = mcFra(træk(key), key);
      }
      if (!mc) { server.fase = 'lobby'; server.spil = null; return; }
      const navn = (QP.find(x => x[0] === key) || [key, key])[1];
      Object.assign(S, { q: { q: mc.q, o: mc.o }, a: mc.a, e: mc.e, kilde: navn, svar: {}, start: Date.now(), hurtigst: null });
    } else if (S.type === 'hangman') {
      const [ord, hint] = hangOrd();
      Object.assign(S, { ord, hint, gaet: [], fejl: 0, slut: false, vandt: false, sidst: null, tur: næsteOnline(S.tur) });
    } else if (S.type === 'rather') {
      const it = træk('rather') || { a: 'Kunne flyve', b: 'Kunne blive usynlig' };
      Object.assign(S, { a: it.a, b: it.b });
    } else if (S.type === 'likely' || S.type === 'never' || S.type === 'deep') {
      S.q = udenAlder(træk(S.type === 'likely' ? S.pulje : S.type) || '');
    } else if (S.type === 'taboo' || S.type === 'char') {
      if (S.tur == null) S.tur = næsteOnline(null);
      S.start = Date.now(); S.gaettet = 0; nytKort(S);
    }
  }
  function afslør() {
    const S = server.spil; if (!S || S.afsl) return; S.afsl = true;
    if (S.type === 'quiz') {
      const rigtige = Object.entries(S.svar).filter(([, s]) => s.v === S.a);
      rigtige.forEach(([e]) => { const p = find(e); if (p) p.point++; });
      if (rigtige.length && online().length > 1) {
        const [e] = rigtige.sort((x, y) => x[1].t - y[1].t)[0]; S.hurtigst = e; const p = find(e); if (p) p.point++;
      }
    } else if (S.type === 'rather' || S.type === 'likely') {
      const tal = {}; Object.values(S.stem).forEach(v => { tal[v] = (tal[v] || 0) + 1; });
      const max = Math.max(0, ...Object.values(tal));
      if (max > 0) Object.entries(S.stem).forEach(([e, v]) => { if (tal[v] === max) { const p = find(e); if (p) p.point++; } });
      S.flest = Object.keys(tal).filter(k => tal[k] === max);
    }
  }
  function alleHarSvaret(obj) { const on = online(); return on.length > 0 && on.every(p => obj[p.enhed] != null); }
  function serverKald(e, c) {
    const r = server; if (!r || !c) return;
    const p = find(e), erV = e === r.vaert, S = r.spil;
    const forklarer = S && S.tur != null && r.spillere[S.tur] && r.spillere[S.tur].enhed === e;
    switch (c.h) {
      case 'deltag': {
        const navn = String(c.navn || '').trim().slice(0, 16) || 'Spiller';
        const alder = parseInt(c.alder, 10) || null;
        if (p) { p.online = true; if (alder) p.alder = alder; break; }
        /* samme navn, der er faldet ud (fx ny browser/privat fane): overtag pladsen og pointene */
        const gammel = r.spillere.find(x => !x.online && x.navn.toLowerCase() === navn.toLowerCase());
        if (gammel) {
          const S0 = r.spil;
          if (S0) ['svar', 'stem'].forEach(k => { if (S0[k] && S0[k][gammel.enhed] != null) { S0[k][e] = S0[k][gammel.enhed]; delete S0[k][gammel.enhed]; } });
          gammel.enhed = e; gammel.online = true; if (alder) gammel.alder = alder; break;
        }
        if (r.spillere.length >= 12) break;
        const brugte = new Set(r.spillere.map(x => x.navn)); let u = navn, k = 2;
        while (brugte.has(u)) u = navn + ' ' + (k++);
        r.spillere.push({ enhed: e, navn: u, alder, point: 0, online: true });
        break;
      }
      case 'forlad':
        r.spillere = r.spillere.filter(x => x.enhed !== e);
        if (S && S.tur != null && S.tur >= r.spillere.length) S.tur = 0;
        break;
      case 'start': if (erV) startSpil(c.type, c.pulje); break;
      case 'lobby': if (erV) { r.fase = 'lobby'; r.spil = null; } break;
      case 'nulstil': if (erV) r.spillere.forEach(x => { x.point = 0; }); break;
      case 'afslor': if (erV) afslør(); break;
      case 'naeste':
        if (!S) break;
        if ((S.type === 'taboo' || S.type === 'char')) { if (erV || forklarer) { S.tur = næsteOnline(S.tur); nytEmne(); } }
        else if (erV) nytEmne();
        break;
      case 'svar': {
        if (!S || !p || S.afsl) break;
        if (S.type === 'quiz') {
          const v = parseInt(c.v, 10); if (S.svar[e] || !(v >= 0 && v < S.q.o.length)) break;
          S.svar[e] = { v, t: Date.now() - S.start };
          if (alleHarSvaret(S.svar)) afslør();
        } else if (S.type === 'rather' || S.type === 'never') {
          if (c.v !== 0 && c.v !== 1) break; S.stem[e] = c.v; if (alleHarSvaret(S.stem)) afslør();
        } else if (S.type === 'likely') {
          if (!find(c.v)) break; S.stem[e] = c.v; if (alleHarSvaret(S.stem)) afslør();
        }
        break;
      }
      case 'bogstav': {
        if (!S || S.type !== 'hangman' || S.slut || !p || r.spillere[S.tur] !== p) break;
        const b = String(c.c || '').toUpperCase(); if (!/^[A-ZÆØÅ]$/.test(b) || S.gaet.includes(b)) break;
        S.gaet.push(b);
        if (S.ord.includes(b)) {
          p.point++; S.sidst = { navn: p.navn, b, ok: true };
          if ([...S.ord].every(ch => ch === ' ' || S.gaet.includes(ch))) { S.slut = true; S.vandt = true; p.point += 3; }
        } else {
          S.fejl++; S.sidst = { navn: p.navn, b, ok: false };
          if (S.fejl >= 6) { S.slut = true; S.vandt = false; } else S.tur = næsteOnline(S.tur);
        }
        break;
      }
      case 'gaettet': {
        if (!S || !(S.type === 'taboo' || S.type === 'char') || !(forklarer || erV)) break;
        const g = find(c.hvem); const fk = r.spillere[S.tur];
        if (g && g !== fk) g.point++; if (fk) fk.point++;
        S.gaettet++; nytKort(S);
        break;
      }
      case 'spring': if (S && (S.type === 'taboo' || S.type === 'char') && (forklarer || erV)) nytKort(S); break;
    }
  }
  function visningFor(e) {
    const r = server;
    const v = { kode: r.kode, vaert: r.vaert, mig: e, fase: r.fase, spil: null,
      spillere: r.spillere.map(p => ({ navn: p.navn, alder: p.alder, point: p.point, enhed: p.enhed, online: p.online })) };
    const S = r.spil; if (!S) return v;
    const o = { type: S.type, pulje: S.pulje, nr: S.nr, afsl: !!S.afsl };
    if (S.type === 'quiz') {
      Object.assign(o, { q: S.q, kilde: S.kilde, besvaret: Object.keys(S.svar), mit: S.svar[e] ? S.svar[e].v : null });
      if (S.afsl) { o.a = S.a; o.e = S.e; o.hurtigst = S.hurtigst; o.svar = {}; Object.entries(S.svar).forEach(([k, s]) => { o.svar[k] = s.v; }); }
    } else if (S.type === 'hangman') {
      Object.assign(o, { maske: [...S.ord].map(ch => (ch === ' ' || S.gaet.includes(ch) ? ch : '_')), gaet: S.gaet, fejl: S.fejl,
        tur: S.tur, slut: S.slut, vandt: S.vandt, hint: S.hint, sidst: S.sidst });
      if (S.slut) o.ord = S.ord;
    } else if (S.type === 'rather' || S.type === 'likely' || S.type === 'never') {
      Object.assign(o, { a: S.a, b: S.b, q: S.q, antal: Object.keys(S.stem).length, mit: S.stem[e] == null ? null : S.stem[e] });
      if (S.afsl) { o.stem = S.stem; o.flest = S.flest || []; }
    } else if (S.type === 'taboo' || S.type === 'char') {
      Object.assign(o, { tur: S.tur, gaettet: S.gaettet, rest: Math.max(0, 60 - Math.floor((Date.now() - S.start) / 1000)) });
      if (r.spillere[S.tur] && r.spillere[S.tur].enhed === e) o.kort = S.kort;
    } else if (S.type === 'deep') o.q = S.q;
    v.spil = o; return v;
  }

  /* ---------------- netværk (PeerJS) ---------------- */
  const PFX = 'hyggespil-bpdk-v2-';
  let peer = null, conns = [], tilVaert = null, visning = null;
  function udsend() {
    if (!server) return;
    conns.forEach(cn => { if (cn.open && cn.enhed) { try { cn.send({ t: 'v', v: visningFor(cn.enhed) }); } catch (e) {} } });
    vis(visningFor(enhed));
  }
  function lukNet() {
    conns.forEach(cn => { try { cn.close(); } catch (e) {} }); conns = [];
    try { tilVaert && tilVaert.close(); } catch (e) {} tilVaert = null;
    try { peer && peer.destroy(); } catch (e) {} peer = null;
    server = null;
  }
  const ingenNet = () => new Error('Netværksdelen kunne ikke hentes – tjek internettet');
  function opretRum(mig) {
    return new Promise((res, rej) => {
      if (typeof Peer === 'undefined') return rej(ingenNet());
      lukNet();
      const kode = String(1000 + rnd(9000));
      const p = new Peer(PFX + kode); peer = p; let klar = false;
      p.on('open', () => {
        klar = true;
        server = { kode, vaert: enhed, fase: 'lobby', spillere: [], spil: null };
        serverKald(enhed, { h: 'deltag', navn: mig.navn, alder: mig.alder });
        lsSet('hs_mp_rum', null);
        udsend(); res();
      });
      p.on('connection', cn => {
        cn.on('data', m => {
          if (!m || m.t !== 'k' || !server) return;
          if (!cn.enhed) {
            cn.enhed = String(m.e || '').slice(0, 24) || ('x' + rnd(1e6));
            conns.filter(x => x !== cn && x.enhed === cn.enhed).forEach(x => { try { x.close(); } catch (e) {} });
            conns = conns.filter(x => x.enhed !== cn.enhed); conns.push(cn);
          }
          try { serverKald(cn.enhed, m.c); } catch (e) { console.warn('rum', e); }
          udsend();
        });
        cn.on('close', () => {
          conns = conns.filter(x => x !== cn);
          if (server && cn.enhed && !conns.some(x => x.enhed === cn.enhed)) {
            const sp = find(cn.enhed); if (sp) sp.online = false;
            const S = server.spil;
            if (S && !S.afsl && (S.type === 'quiz' ? alleHarSvaret(S.svar) : ['rather', 'likely', 'never'].includes(S.type) && alleHarSvaret(S.stem))) afslør();
            udsend();
          }
        });
      });
      p.on('error', e => { if (!klar) { lukNet(); rej(new Error(e.type === 'unavailable-id' ? 'Prøv igen – koden var optaget' : 'Netværksfejl (' + e.type + ')')); } });
      p.on('disconnected', () => { try { p.reconnect(); } catch (e) {} });
    });
  }
  function deltagRum(kode, mig) {
    return new Promise((res, rej) => {
      if (typeof Peer === 'undefined') return rej(ingenNet());
      lukNet();
      const p = new Peer(); peer = p; let ok = false;
      const fejl = t => { if (!ok) { ok = true; lukNet(); rej(new Error(t)); } };
      p.on('open', () => {
        const cn = p.connect(PFX + kode, { reliable: true }); tilVaert = cn;
        cn.on('open', () => {
          cn.send({ t: 'k', e: enhed, c: { h: 'deltag', navn: mig.navn, alder: mig.alder } });
          lsSet('hs_mp_rum', kode);
          if (!ok) { ok = true; res(); }
        });
        cn.on('data', m => { if (m && m.t === 'v') vis(m.v); });
        cn.on('close', () => {
          if (tilVaert !== cn) return;
          tilVaert = null; lsSet('hs_mp_rum', null); vis(null);
          toast('Forbindelsen til rummet er lukket');
        });
      });
      p.on('error', e => fejl(e.type === 'peer-unavailable' ? 'Fandt ikke rummet – tjek koden' : 'Netværksfejl (' + e.type + ')'));
      setTimeout(() => fejl('Kunne ikke forbinde – prøv igen'), 15000);
    });
  }
  function kald(c) {
    if (server) { serverKald(enhed, c); udsend(); return; }
    if (tilVaert && tilVaert.open) { try { tilVaert.send({ t: 'k', e: enhed, c }); } catch (e) { toast('Kunne ikke sende'); } }
  }
  function forlad() {
    if (server) { lukNet(); }
    else { kald({ h: 'forlad' }); setTimeout(lukNet, 300); lsSet('hs_mp_rum', null); }
    vis(null);
  }

  /* ---------------- skærmene ---------------- */
  const CSS = `
#mp{position:fixed;inset:0;z-index:120;display:none;overflow:auto;background:rgba(12,8,32,.985);padding:calc(10px + env(safe-area-inset-top)) 14px calc(24px + env(safe-area-inset-bottom))}
#mp .mpw{max-width:620px;margin:0 auto}
#mp .mptop{display:flex;align-items:center;gap:8px;margin-bottom:12px}
#mp .mptop .tt{flex:1;font-weight:900;font-size:18px}
#mp label{display:block;font-weight:800;margin:12px 0 6px;text-align:left}
#mp .in{width:100%;text-align:left}
#mp .mpor{text-align:center;opacity:.7;margin:18px 0 8px;font-weight:700}
#mp .kode{font-size:clamp(46px,15vw,80px);font-weight:900;letter-spacing:.16em;text-align:center;padding:8px 0;border-radius:18px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2)}
#mp .sp{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
#mp .sp span{padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.09);font-weight:800}
#mp .sp span.mig{outline:2px solid #ffb703}
#mp .sp span.off{opacity:.4}
#mp .spil{display:grid;grid-template-columns:1fr;gap:10px;margin-top:10px}
@media(min-width:560px){#mp .spil{grid-template-columns:1fr 1fr}}
#mp .sk{display:block;text-align:left;padding:14px;border-radius:18px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);color:#fff;font:inherit;cursor:pointer}
#mp .sk b{font-size:18px}#mp .sk small{display:block;opacity:.75;margin-top:4px;line-height:1.35}
#mp .sk select{margin-top:8px;width:100%;padding:8px;border-radius:10px;background:#2a2060;color:#fff;border:1px solid rgba(255,255,255,.25);font:inherit}
#mp .tur{font-weight:900;font-size:clamp(17px,4.5vw,22px);padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.08);text-align:center;margin:8px 0}
#mp .tur.min{background:#2ec4b6;color:#062a26}
#mp .qq{font-size:clamp(21px,5.4vw,32px);font-weight:900;text-align:center;margin:12px 0 14px;line-height:1.25}
#mp .ops{display:grid;grid-template-columns:1fr;gap:10px}
#mp .ops button{display:flex;gap:10px;align-items:center;padding:15px;border-radius:16px;font:inherit;font-weight:800;font-size:17px;color:#fff;
 background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);text-align:left}
#mp .ops button .k{width:32px;height:32px;flex:0 0 32px;border-radius:50%;display:grid;place-items:center;background:#8f6bff}
#mp .ops button.valgt{outline:3px solid #ffb703}
#mp .ops button.ret{background:rgba(46,196,182,.3);border-color:#2ec4b6}
#mp .ops button.forkert{background:rgba(230,57,70,.3);border-color:#e63946}
#mp .ops button[disabled]{opacity:.85}
#mp .ops button .n{margin-left:auto;font-size:14px;opacity:.85}
#mp .bar2{height:8px;border-radius:6px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:6px}#mp .bar2 i{display:block;height:100%;background:#ffb703}
#mp .ab{display:grid;grid-template-columns:1fr;gap:12px}
#mp .ab button{padding:20px 14px;border-radius:20px;font:inherit;font-weight:900;font-size:19px;color:#fff;border:0;text-align:center}
#mp .ab .A{background:linear-gradient(135deg,#4361ee,#4cc9f0)}#mp .ab .B{background:linear-gradient(135deg,#f72585,#ff8fab)}
#mp .ab button.valgt{outline:4px solid #ffb703}
#mp .maske{font-size:clamp(26px,8vw,44px);font-weight:900;letter-spacing:.22em;text-align:center;margin:8px 0;word-break:break-all}
#mp .abc{display:grid;grid-template-columns:repeat(8,1fr);gap:6px;margin-top:10px}
#mp .abc button{padding:10px 0;border-radius:10px;font:inherit;font-weight:900;font-size:16px;background:#8f6bff;color:#fff;border:0}
#mp .abc button[disabled]{opacity:.25}
#mp .kort{font-size:clamp(30px,10vw,58px);font-weight:900;text-align:center;margin:14px 0;line-height:1.15}
#mp .forbud{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
#mp .forbud span{padding:6px 12px;border-radius:999px;background:rgba(230,57,70,.25);border:1px solid #e63946;font-weight:800}
#mp .tid{font-size:34px;font-weight:900;text-align:center}
#mp .host{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:16px}
#mp .stilling{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:18px;padding-top:12px;border-top:1px solid rgba(255,255,255,.12)}
#mp .stilling span{padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.08);font-weight:800;font-size:14px}
#mpvalg{position:fixed;inset:0;z-index:130;display:grid;place-items:center;padding:16px;background:rgba(12,8,32,.96)}
#mpvalg .mbox{max-width:460px;width:100%;text-align:center}
#mpvalg button{width:100%;margin-top:12px;padding:18px;font-size:19px}
.mpbanner{display:flex;align-items:center;gap:12px;width:100%;margin:0 0 14px;padding:16px;border-radius:20px;border:0;font:inherit;color:#fff;text-align:left;cursor:pointer;
 background:linear-gradient(135deg,#7b2ff7,#2ec4b6);box-shadow:0 10px 30px rgba(46,196,182,.25)}
.mpbanner .e{font-size:34px}.mpbanner b{font-size:18px;display:block}.mpbanner small{opacity:.9}`;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  function el() { let d = document.getElementById('mp'); if (!d) { d = document.createElement('div'); d.id = 'mp'; document.body.appendChild(d); } return d; }
  let åben = false, valgtSpil = lsGet('hs_mp_puljer', {}), slutTid = 0, ur = null, forrigeTur = '';
  function åbn() { åben = true; el().style.display = 'block'; document.body.style.overflow = 'hidden'; tegn(); }
  function luk() { åben = false; el().style.display = 'none'; document.body.style.overflow = ''; try { window.render && window.render(); } catch (e) {} if (!lsGet('hs_mp_valgt', false) || (window.hsSpil && window.hsSpil.players.length < 2)) visValg(); }
  function vis(v) {
    const før = visning; visning = v;
    if (v && !åben) åbn();
    if (v && v.spil && v.spil.rest != null) slutTid = Date.now() + v.spil.rest * 1000;
    /* lille summen, når det bliver din tur */
    const tur = minTurNøgle(v); if (tur && tur !== forrigeTur) vib(40); forrigeTur = tur;
    if (åben) tegn(før);
  }
  function minTurNøgle(v) {
    if (!v || !v.spil) return '';
    const S = v.spil, i = v.spillere.findIndex(p => p.enhed === v.mig);
    if ((S.type === 'hangman' && !S.slut) || S.type === 'taboo' || S.type === 'char') return S.tur === i ? S.type + S.nr + ':' + S.tur : '';
    return '';
  }
  const navnPå = (v, e) => { const p = v.spillere.find(x => x.enhed === e); return p ? p.navn : '?'; };
  const erVært = v => v && v.vaert === v.mig;

  function tegn() {
    const d = el();
    if (ur) { clearInterval(ur); ur = null; }
    if (!visning) return tegnStart(d);
    if (visning.fase !== 'spil' || !visning.spil) return tegnLobby(d, visning);
    return tegnSpil(d, visning);
  }

  function tegnStart(d) {
    const mig = lsGet('hs_mp_mig', { navn: '', alder: '' });
    d.innerHTML = '<div class="mpw"><div class="mptop"><div class="tt">📱 Spil sammen – hver sin telefon</div><button class="btn ghost" id="mp-luk">✕</button></div>'
      + '<p class="hint" style="text-align:left">Hver spiller bruger sin egen telefon. Én opretter rummet, de andre deltager med koden. Det virker mellem iPhone og Android.</p>'
      + '<label for="mp-navn">Dit navn</label><input class="in" id="mp-navn" maxlength="16" autocomplete="off" value="' + esc(mig.navn) + '">'
      + '<label for="mp-alder">Alder <span style="opacity:.6;font-weight:600">(valgfri)</span></label><input class="in" id="mp-alder" inputmode="numeric" maxlength="2" value="' + esc(mig.alder || '') + '">'
      + '<div style="height:14px"></div><button class="btn big green" id="mp-opret" style="width:100%">➕ Opret nyt rum</button>'
      + '<div class="mpor">– eller deltag i en vens rum –</div>'
      + '<div class="row" style="flex-wrap:nowrap"><input class="in" id="mp-kode" inputmode="numeric" maxlength="4" placeholder="Kode (4 tal)" style="text-align:center;font-size:20px;letter-spacing:.2em">'
      + '<button class="btn big" id="mp-deltag">Deltag</button></div>'
      + '<p class="hint" id="mp-msg" style="min-height:1.4em;color:#ffb703"></p></div>';
    const $ = id => d.querySelector('#' + id);
    const hentMig = () => {
      const navn = $('mp-navn').value.trim(), alder = $('mp-alder').value.trim();
      if (!navn) { $('mp-msg').textContent = 'Skriv dit navn først.'; $('mp-navn').focus(); return null; }
      const m = { navn: navn.slice(0, 16), alder: /^\d{1,2}$/.test(alder) ? alder : '' }; lsSet('hs_mp_mig', m); return m;
    };
    const travl = (knap, t) => { ['mp-opret', 'mp-deltag'].forEach(id => { $(id).disabled = !!t; }); if (t) knap.textContent = t; };
    $('mp-luk').onclick = luk;
    $('mp-opret').onclick = () => {
      const m = hentMig(); if (!m) return; travl($('mp-opret'), 'Opretter…');
      opretRum(m).catch(e => { tegn(); toast(e.message); });
    };
    const deltag = () => {
      const m = hentMig(); if (!m) return;
      const kode = $('mp-kode').value.trim();
      if (!/^\d{4}$/.test(kode)) { $('mp-msg').textContent = 'Skriv den 4-cifrede kode fra værten.'; return; }
      travl($('mp-deltag'), 'Forbinder…');
      deltagRum(kode, m).catch(e => { tegn(); toast(e.message); });
    };
    $('mp-deltag').onclick = deltag;
    $('mp-kode').onkeydown = e => { if (e.key === 'Enter') deltag(); };
  }

  function top(v, titel) {
    return '<div class="mptop"><div class="tt">' + titel + '</div><span style="opacity:.75;font-weight:800">Rum ' + esc(v.kode) + '</span>'
      + (erVært(v) && v.fase === 'spil' ? '<button class="btn ghost" data-a="lobby">🏠 Lobby</button>' : '')
      + '<button class="btn ghost" id="mp-forlad">' + (erVært(v) ? 'Luk rum' : 'Forlad') + '</button></div>';
  }
  function spillereHTML(v, medPoint) {
    return '<div class="sp">' + v.spillere.map(p => '<span class="' + (p.enhed === v.mig ? 'mig ' : '') + (p.online ? '' : 'off') + '">'
      + (p.enhed === v.vaert ? '👑 ' : '') + esc(p.navn) + (p.alder ? ' <small style="opacity:.6">' + esc(p.alder) + ' år</small>' : '')
      + (medPoint ? ' · ' + p.point : '') + '</span>').join('') + '</div>';
  }
  function stilling(v) {
    return '<div class="stilling">' + v.spillere.slice().sort((a, b) => b.point - a.point)
      .map(p => '<span' + (p.enhed === v.mig ? ' style="outline:2px solid #ffb703"' : '') + '>' + esc(p.navn) + ': ' + p.point + '</span>').join('') + '</div>';
  }
  function bindFælles(d, v) {
    const f = d.querySelector('#mp-forlad');
    if (f) f.onclick = () => {
      const t = erVært(v) ? 'Luk rummet for alle?' : 'Forlad rummet?';
      if (typeof window.ask === 'function') window.ask(t, forlad); else if (confirm(t)) forlad();
    };
    d.querySelectorAll('[data-a]').forEach(b => { b.onclick = () => kald({ h: b.dataset.a }); });
  }

  function tegnLobby(d, v) {
    const vært = erVært(v), værtNavn = navnPå(v, v.vaert);
    let h = '<div class="mpw">' + top(v, '🎲 Lobby');
    if (vært) h += '<p class="hint" style="text-align:center;margin:4px 0">Del koden – de andre trykker <b>📱 Spil sammen</b> og skriver den:</p><div class="kode">' + esc(v.kode) + '</div>';
    h += '<h3 style="margin:16px 0 4px">Spillere (' + v.spillere.filter(p => p.online).length + ')</h3>' + spillereHTML(v, true);
    if (vært) {
      h += '<h3 style="margin:16px 0 4px">Vælg et spil</h3><div class="spil">';
      Object.entries(SPIL).forEach(([k, s]) => {
        const p = k === 'quiz' ? quizPuljer() : s.puljer;
        h += '<div class="sk" data-start="' + k + '" role="button" tabindex="0"><b>' + s.e + ' ' + esc(s.t) + '</b><small>' + esc(s.d) + '</small>'
          + (p ? '<select data-pulje="' + k + '">' + p.map(([pk, pt]) => '<option value="' + pk + '"' + (valgtSpil[k] === pk ? ' selected' : '') + '>' + esc(pt) + '</option>').join('') + '</select>' : '')
          + '</div>';
      });
      h += '</div><div class="host"><button class="btn ghost" data-a="nulstil">↺ Nulstil point</button></div>';
      if (v.spillere.filter(p => p.online).length < 2) h += '<p class="hint" style="text-align:center">Tip: vent til de andre er med, før I starter.</p>';
    } else {
      h += '<div class="tur" style="margin-top:18px">⏳ Venter på, at ' + esc(værtNavn) + ' vælger et spil…</div>';
    }
    d.innerHTML = h + '</div>';
    bindFælles(d, v);
    d.querySelectorAll('[data-pulje]').forEach(s => {
      s.onclick = e => e.stopPropagation();
      s.onchange = () => { valgtSpil[s.dataset.pulje] = s.value; lsSet('hs_mp_puljer', valgtSpil); };
    });
    d.querySelectorAll('[data-start]').forEach(c => {
      c.onclick = () => { const k = c.dataset.start, s = c.querySelector('select'); kald({ h: 'start', type: k, pulje: s ? s.value : undefined }); };
    });
  }

  function hostKnapper(v, knapper) {
    if (!erVært(v)) return '';
    return '<div class="host">' + knapper.map(([a, t, cls]) => '<button class="btn ' + (cls || '') + '" data-a="' + a + '">' + t + '</button>').join('') + '</div>';
  }

  function tegnSpil(d, v) {
    const S = v.spil, s = SPIL[S.type], vært = erVært(v);
    const mi = v.spillere.findIndex(p => p.enhed === v.mig);
    let h = '<div class="mpw">' + top(v, s.e + ' ' + esc(s.t));
    const ventVært = '<p class="hint" style="text-align:center">' + esc(navnPå(v, v.vaert)) + ' går videre.</p>';

    if (S.type === 'quiz') {
      h += '<p class="hint" style="text-align:center;margin:0">' + esc(S.kilde || '') + ' · spørgsmål ' + S.nr + '</p><div class="qq">' + esc(S.q.q) + '</div><div class="ops">';
      h += S.q.o.map((t, i) => {
        let cls = S.mit === i ? 'valgt ' : '';
        if (S.afsl && i === S.a) cls += 'ret'; else if (S.afsl && S.mit === i) cls += 'forkert';
        const hvem = S.afsl ? Object.entries(S.svar || {}).filter(([, x]) => x === i).map(([e]) => navnPå(v, e)) : [];
        return '<button data-svar="' + i + '" class="' + cls + '"' + (S.mit != null || S.afsl ? ' disabled' : '') + '><span class="k">' + (S.afsl && i === S.a ? '✓' : 'ABCDEF'[i]) + '</span><span>' + esc(t) + '</span>'
          + (hvem.length ? '<span class="n">' + esc(hvem.join(', ')) + '</span>' : '') + '</button>';
      }).join('') + '</div>';
      if (!S.afsl) {
        h += '<div class="tur">' + (S.mit != null ? '✅ Svar sendt · ' : '') + S.besvaret.length + ' af ' + v.spillere.filter(p => p.online).length + ' har svaret</div>';
        h += hostKnapper(v, [['afslor', 'Vis svaret nu']]);
      } else {
        const ret = S.mit === S.a;
        h += '<div class="tur ' + (ret ? 'min' : '') + '">' + (S.mit == null ? 'Du nåede ikke at svare' : ret ? '🎉 Rigtigt! +1' : '❌ Forkert') + (S.hurtigst === v.mig ? ' · ⚡ hurtigst +1' : '') + '</div>';
        if (S.hurtigst) h += '<p class="hint" style="text-align:center">⚡ Hurtigst med rigtigt svar: <b>' + esc(navnPå(v, S.hurtigst)) + '</b></p>';
        if (S.e) h += '<p class="hint" style="text-align:center">' + esc(S.e) + '</p>';
        h += vært ? hostKnapper(v, [['naeste', 'Næste spørgsmål →', 'big green']]) : ventVært;
      }
    }

    else if (S.type === 'hangman') {
      const minTur = S.tur === mi && !S.slut;
      h += '<p class="hint" style="text-align:center;margin:0">Kategori: <b>' + esc(S.hint) + '</b> · ' + (6 - S.fejl) + ' liv tilbage</p>' + galge(S.fejl, S.slut && !S.vandt);
      h += '<div class="maske">' + esc((S.slut ? [...S.ord] : S.maske).join('')) + '</div>';
      if (S.sidst) h += '<p class="hint" style="text-align:center">' + esc(S.sidst.navn) + ' gættede <b>' + esc(S.sidst.b) + '</b> ' + (S.sidst.ok ? '✅' : '❌') + '</p>';
      if (S.slut) {
        h += '<div class="tur ' + (S.vandt ? 'min' : '') + '">' + (S.vandt ? '🎉 ' + esc(S.sidst ? S.sidst.navn : '') + ' løste ordet! +3' : '💀 Hængt! Ordet var ' + esc(S.ord)) + '</div>';
        h += vært ? hostKnapper(v, [['naeste', 'Nyt ord →', 'big green']]) : ventVært;
      } else {
        h += '<div class="tur ' + (minTur ? 'min' : '') + '">' + (minTur ? '🎯 Din tur – vælg et bogstav' : '⏳ ' + esc((v.spillere[S.tur] || {}).navn || '') + 's tur') + '</div>';
        h += '<div class="abc">' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ'.split('').map(c => '<button data-b="' + c + '"' + (!minTur || S.gaet.includes(c) ? ' disabled' : '') + '>' + c + '</button>').join('') + '</div>';
        h += '<p class="hint" style="text-align:center">Rigtigt bogstav: +1 og du fortsætter. Løser du ordet: +3.</p>';
      }
    }

    else if (S.type === 'rather' || S.type === 'never') {
      const A = S.type === 'rather' ? S.a : '🙋 Det har jeg', B = S.type === 'rather' ? S.b : '🙅 Aldrig';
      h += S.type === 'rather' ? '<div class="qq">Hvad vil du helst?</div>' : '<div class="qq">' + esc(S.q) + '</div>';
      const tal = [0, 0]; if (S.afsl) Object.values(S.stem).forEach(x => { tal[x]++; });
      const sum = tal[0] + tal[1] || 1;
      const hvem = i => S.afsl ? Object.entries(S.stem).filter(([, x]) => x === i).map(([e]) => navnPå(v, e)) : [];
      h += '<div class="ab">' + [A, B].map((t, i) => '<button class="' + 'AB'[i] + (S.mit === i ? ' valgt' : '') + '" data-svar="' + i + '"' + (S.mit != null || S.afsl ? ' disabled' : '') + '>'
        + (S.type === 'rather' ? '<span style="opacity:.8">' + 'AB'[i] + ':</span> ' : '') + esc(t)
        + (S.afsl ? '<div class="bar2"><i style="width:' + Math.round(tal[i] / sum * 100) + '%"></i></div><div style="font-size:14px;margin-top:6px;opacity:.95">' + Math.round(tal[i] / sum * 100) + ' % · ' + esc(hvem(i).join(', ') || 'ingen') + '</div>' : '')
        + '</button>').join('') + '</div>';
      if (!S.afsl) {
        h += '<div class="tur">' + (S.mit != null ? '✅ Valgt · ' : '') + S.antal + ' af ' + v.spillere.filter(p => p.online).length + ' har valgt</div>';
        h += hostKnapper(v, [['afslor', 'Vis resultatet nu']]);
      } else {
        if (S.type === 'rather') h += '<p class="hint" style="text-align:center">Flertallet får et point.</p>';
        h += vært ? hostKnapper(v, [['naeste', 'Næste →', 'big green']]) : ventVært;
      }
    }

    else if (S.type === 'likely') {
      h += '<div class="qq">' + esc(S.q) + '</div>';
      const tal = {}; if (S.afsl) Object.values(S.stem).forEach(x => { tal[x] = (tal[x] || 0) + 1; });
      const max = Math.max(1, ...Object.values(tal).concat([0]));
      h += '<div class="ops">' + v.spillere.filter(p => p.online || tal[p.enhed]).map(p => '<button data-stem="' + esc(p.enhed) + '" class="' + (S.mit === p.enhed ? 'valgt ' : '') + (S.afsl && (S.flest || []).includes(p.enhed) ? 'ret' : '') + '"'
        + (S.mit != null || S.afsl ? ' disabled' : '') + '><span class="k">👉</span><span>' + esc(p.navn) + '</span>'
        + (S.afsl ? '<span class="n">' + (tal[p.enhed] || 0) + ' stemmer</span>' : '') + '</button>'
        + (S.afsl ? '<div class="bar2" style="margin:-4px 0 4px"><i style="width:' + Math.round((tal[p.enhed] || 0) / max * 100) + '%"></i></div>' : '')).join('') + '</div>';
      if (!S.afsl) {
        h += '<div class="tur">' + (S.mit != null ? '✅ Stemt · ' : '') + S.antal + ' af ' + v.spillere.filter(p => p.online).length + ' har stemt</div>';
        h += hostKnapper(v, [['afslor', 'Vis resultatet nu']]);
      } else {
        h += '<p class="hint" style="text-align:center">Dem, der stemte på flest-stemmer-personen, får et point.</p>';
        h += vært ? hostKnapper(v, [['naeste', 'Næste →', 'big green']]) : ventVært;
      }
    }

    else if (S.type === 'taboo' || S.type === 'char') {
      const fk = v.spillere[S.tur] || {}, minTur = S.tur === mi;
      h += '<div class="tid" id="mp-tid">' + S.rest + '</div>';
      if (minTur && S.kort) {
        h += '<div class="tur min">' + (S.type === 'taboo' ? '🗣️ Du forklarer – vis ikke skærmen!' : '🎭 Du viser – uden lyd!') + '</div>';
        h += '<div class="kort">' + esc(S.kort.w) + '</div>';
        if (S.kort.f && S.kort.f.length) h += '<p class="hint" style="text-align:center;margin-bottom:6px">Du må ikke sige:</p><div class="forbud">' + S.kort.f.map(f => '<span>' + esc(f) + '</span>').join('') + '</div>';
        h += '<p class="hint" style="text-align:center;margin-top:16px">Hvem gættede det? (I får begge et point)</p><div class="ops">'
          + v.spillere.filter(p => p.enhed !== v.mig && p.online).map(p => '<button data-gaet="' + esc(p.enhed) + '"><span class="k">✓</span><span>' + esc(p.navn) + '</span></button>').join('') + '</div>';
        h += '<div class="host"><button class="btn ghost" data-a="spring">⏭ Spring over</button><button class="btn" data-a="naeste">Næste spiller →</button></div>';
      } else {
        h += '<div class="tur">' + (S.type === 'taboo' ? '🗣️ ' : '🎭 ') + esc(fk.navn || '') + (S.type === 'taboo' ? ' forklarer – gæt højt!' : ' viser – gæt højt!') + '</div>';
        h += '<div class="qq" style="opacity:.7">Ordet er hemmeligt for dig 🤫</div>';
        h += '<p class="hint" style="text-align:center">Gættet ' + (S.gaettet || 0) + ' i denne runde</p>';
        if (vært) h += hostKnapper(v, [['naeste', 'Næste spiller →']]);
      }
    }

    else if (S.type === 'deep') {
      h += '<div class="qq" style="margin-top:30px">' + esc(S.q) + '</div><p class="hint" style="text-align:center">Snak om det – der er ingen rigtige svar.</p>';
      h += vært ? hostKnapper(v, [['naeste', 'Næste kort →', 'big green']]) : ventVært;
    }

    h += stilling(v) + '</div>';
    d.innerHTML = h;
    bindFælles(d, v);
    d.querySelectorAll('[data-svar]').forEach(b => { b.onclick = () => kald({ h: 'svar', v: +b.dataset.svar }); });
    d.querySelectorAll('[data-stem]').forEach(b => { b.onclick = () => kald({ h: 'svar', v: b.dataset.stem }); });
    d.querySelectorAll('[data-b]').forEach(b => { b.onclick = () => { b.disabled = true; kald({ h: 'bogstav', c: b.dataset.b }); }; });
    d.querySelectorAll('[data-gaet]').forEach(b => { b.onclick = () => kald({ h: 'gaettet', hvem: b.dataset.gaet }); });
    if (S.rest != null) {
      ur = setInterval(() => {
        const t = document.getElementById('mp-tid'); if (!t) return;
        const r = Math.max(0, Math.ceil((slutTid - Date.now()) / 1000));
        t.textContent = r > 0 ? r : '⏰ Tiden er gået';
      }, 500);
    }
  }
  function galge(f, død) {
    const g = (n, s) => (f >= n ? s : '');
    return '<svg viewBox="0 0 200 200" style="width:min(170px,46vw);display:block;margin:4px auto">'
      + '<g stroke="#c9c3e6" stroke-width="6" stroke-linecap="round" fill="none"><line x1="16" y1="190" x2="132" y2="190"/><line x1="54" y1="190" x2="54" y2="14"/><line x1="54" y1="14" x2="140" y2="14"/><line x1="140" y1="14" x2="140" y2="34"/></g>'
      + '<g stroke="' + (død ? '#e63946' : '#ffd166') + '" stroke-width="6" stroke-linecap="round" fill="none">'
      + g(1, '<circle cx="140" cy="50" r="16"/>') + g(2, '<line x1="140" y1="66" x2="140" y2="116"/>') + g(3, '<line x1="140" y1="80" x2="118" y2="104"/>')
      + g(4, '<line x1="140" y1="80" x2="162" y2="104"/>') + g(5, '<line x1="140" y1="116" x2="122" y2="150"/>') + g(6, '<line x1="140" y1="116" x2="158" y2="150"/>')
      + '</g></svg>';
  }

  /* ---------------- startvalg + indgange på forsiden ---------------- */
  function visValg() {
    if (document.getElementById('mpvalg') || åben) return;
    const d = document.createElement('div'); d.id = 'mpvalg';
    d.innerHTML = '<div class="mbox"><h2 style="margin-top:0">🃏 Hvordan vil I spille?</h2>'
      + '<button class="btn big green" id="mpv-tlf">📱 Hver på sin telefon</button>'
      + '<p class="hint">Alle spiller med fra deres egen telefon – quiz, Hangman, afstemninger og mere.</p>'
      + '<button class="btn big" id="mpv-en">📺 Sammen på én skærm</button>'
      + '<p class="hint">Én telefon eller tablet, som I sender rundt. Alle 100+ spil.</p></div>';
    document.body.appendChild(d);
    d.querySelector('#mpv-tlf').onclick = () => { lsSet('hs_mp_valgt', true); d.remove(); åbn(); };
    d.querySelector('#mpv-en').onclick = () => { lsSet('hs_mp_valgt', true); d.remove(); try { window.render && window.render(); } catch (e) {} };
  }

  const render0 = window.render;
  window.render = function () {
    const r = render0.apply(this, arguments);
    try {
      const h = document.querySelector('header');
      if (h && !document.getElementById('rumbtn')) {
        const b = document.createElement('button');
        b.id = 'rumbtn'; b.className = 'btn ghost'; b.textContent = '📱 Spil sammen';
        b.onclick = åbn; h.appendChild(b);
      }
      const v = window.hsSpil && window.hsSpil.view;
      const main = document.getElementById('main');
      if (main && v === 'home' && !document.getElementById('mpbanner')) {
        const b = document.createElement('button');
        b.id = 'mpbanner'; b.className = 'mpbanner';
        b.innerHTML = '<span class="e">📱</span><span><b>Spil sammen fra hver sin telefon</b><small>Opret et rum eller deltag med en kode</small></span>';
        b.onclick = åbn; main.insertBefore(b, main.firstChild);
      }
    } catch (e) {}
    return r;
  };

  /* første gang: spørg hvordan I vil spille. Ellers: kom tilbage i rummet efter genindlæsning. */
  setTimeout(() => {
    const kode = lsGet('hs_mp_rum', null), mig = lsGet('hs_mp_mig', null);
    if (kode && mig && mig.navn) { deltagRum(kode, mig).catch(() => { lsSet('hs_mp_rum', null); }); return; }
    if (!lsGet('hs_mp_valgt', false)) visValg();
  }, 500);

  window.hsMP = { åbn, luk, get visning() { return visning; } };
})();
