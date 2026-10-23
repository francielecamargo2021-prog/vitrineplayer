// Landing: sem rolagem lateral, sem texto cortado, âncoras abaixo do menu fixo, vídeo do topo
// presente e menu do celular — em 320, 375, 768, 1024 e 1440 px. Não usa banco.
//   APP_URL=http://localhost:3000 node db/tests/testar-landing.mjs <pasta-das-capturas> [pt|es]
import { chromium } from "playwright-core";
const [out, lang = "pt"] = process.argv.slice(2);
const URL = `${process.env.APP_URL ?? "http://localhost:3000"}/${lang}`;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
let ok = 0, bad = 0;
const check = (c, d) => { console.log(`${c ? "✓" : "✗"} ${d}`); c ? ok++ : bad++; };
for (const w of [320, 375, 768, 1024, 1440]) {
  const ctx = await b.newContext({ viewport: { width: w, height: w < 768 ? 720 : 900 }, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(URL, { waitUntil: "networkidle" });
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = [], cut = [];
    for (const el of document.querySelectorAll("main h1, main h2, main h3, main p, main a, main li, main dd, footer p, footer a, header a")) {
      const rc = el.getBoundingClientRect();
      if (!rc.width || el.closest("[aria-hidden=true],[hidden]")) continue;
      if (rc.right > vw + 1 || rc.left < -1) out.push(`${el.tagName} "${el.textContent.trim().slice(0, 30)}"`);
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 2 && cs.overflow !== "visible" && !el.classList.contains("truncate") && !el.closest(".truncate")) cut.push(`${el.tagName} "${el.textContent.trim().slice(0, 30)}"`);
    }
    const v = document.querySelector("main section video");
    return { scroll: document.documentElement.scrollWidth, vw, out: [...new Set(out)].slice(0, 8), cut: [...new Set(cut)].slice(0, 8),
      video: v ? { src: v.getAttribute("src"), muted: v.muted, loop: v.loop, inline: v.playsInline } : null };
  });
  check(r.scroll <= r.vw, `${w}px: sem rolagem lateral (${r.scroll}/${r.vw})`);
  check(r.out.length === 0, `${w}px: nada passa da tela ${r.out.join(" | ")}`);
  check(r.cut.length === 0, `${w}px: nenhum texto cortado ${r.cut.join(" | ")}`);
  check(r.video && /\/media\/hero\/hero(-m)?\.mp4$/.test(r.video.src) && r.video.muted && r.video.inline, `${w}px: vídeo original do topo presente (${r.video?.src})`);
  // âncoras: o título da seção fica abaixo do menu fixo
  for (const id of ["como-funciona", "perfil", "profissionais", "cadastro"]) {
    await p.evaluate((x) => document.getElementById(x).scrollIntoView(), id);
    await p.waitForTimeout(150);
    const pos = await p.evaluate((x) => {
      const head = document.querySelector("header.site-header").getBoundingClientRect().bottom;
      const t = document.querySelector(`#${x} h2, #${x} .t-kicker`).getBoundingClientRect().top;
      return { head, t };
    }, id);
    check(pos.t >= pos.head, `${w}px: #${id} não fica sob o menu (título ${Math.round(pos.t)} ≥ menu ${Math.round(pos.head)})`);
  }
  if (w < 1024) {
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.click('button[aria-controls="menu-movel"]');
    const vis = await p.isVisible("#menu-movel");
    check(vis, `${w}px: menu do celular abre`);
    await p.screenshot({ path: `${out}/${w}-menu.png` });
    await p.click('#menu-movel a[href="#perfil"]');
    await p.waitForTimeout(300);
    check(!(await p.isVisible("#menu-movel")), `${w}px: menu fecha ao escolher um link`);
  }
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: `${out}/${w}-topo.png` });
  await p.screenshot({ path: `${out}/${w}.png`, fullPage: true });
  check(errors.length === 0, `${w}px: sem erros no navegador ${errors[0] ?? ""}`);
  await ctx.close();
}
await b.close();
console.log(`\nResultado: ${ok} ok, ${bad} falha(s)`);
process.exit(bad ? 1 : 0);
