(function () {
  "use strict";
  var B = null, me = null, $ = function (id) { return document.getElementById(id); };
  var GLYPH = { Mercury: "☿", Venus: "♀", Mars: "♂", Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆" };
  var state, today, busy = false, ctrl = null;
  var history = [], plist = [], ppl = { people: [], alerts: [], errors: [] };

  function api(path, method, body) {
    return fetch(path, { method: method || "GET", credentials: "same-origin", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (r.status === 401 && me) { me = null; showAuth("login", "Your session ended. Sign in again."); }
          if (!r.ok) throw new Error(d.error || "Something went wrong. Try again.");
          return d;
        });
      }, function () { throw new Error("Can't reach the server. Check your connection."); });
  }
  function save() {}
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function cardHtml(card) {
    return '<span class="' + (card.red ? "red" : "") + '">' + esc(card.rank) + '</span><span class="gem' + (card.red ? "" : " blk") + '">' + card.suit + "</span>";
  }

  // --- minimal markdown ------------------------------------------------------
  function inline(s) {
    return esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  }
  function md(text) {
    var out = [], list = null, para = [];
    function flushP() { if (para.length) { out.push("<p>" + para.join("<br>") + "</p>"); para = []; } }
    function flushL() { if (list) { out.push("<" + list.tag + ">" + list.items.join("") + "</" + list.tag + ">"); list = null; } }
    String(text).split("\n").forEach(function (raw) {
      var l = raw.trim(), m;
      if (!l) { flushP(); flushL(); return; }
      if ((m = l.match(/^#{1,6}\s+(.*)$/))) { flushP(); flushL(); out.push("<h4>" + inline(m[1]) + "</h4>"); return; }
      if ((m = l.match(/^[-*•]\s+(.*)$/))) { flushP(); if (!list || list.tag !== "ul") { flushL(); list = { tag: "ul", items: [] }; } list.items.push("<li>" + inline(m[1]) + "</li>"); return; }
      if ((m = l.match(/^\d+[.)]\s+(.*)$/))) { flushP(); if (!list || list.tag !== "ol") { flushL(); list = { tag: "ol", items: [] }; } list.items.push("<li>" + inline(m[1]) + "</li>"); return; }
      flushL(); para.push(inline(l));
    });
    flushP(); flushL();
    return out.join("");
  }

  // --- cards -----------------------------------------------------------------
  function seats() {
    var a = state.app, y = a.year, cur = y.current, wk = a.week.current;
    return [
      { ask: "card for today", seat: "Today", when: a.day.today.weekday + " " + a.day.today.label, n: a.day.today.birth, also: a.day.today.ruling, about: a.copy.daily, now: true },
      { ask: "card for this week", seat: "This week", when: wk.startLabel + " – " + wk.endLabel, n: wk.birth, also: wk.ruling, about: a.copy.weekly + " " + GLYPH[wk.planet] + " " + wk.planet + " week: " + wk.domain + "." },
      { ask: cur.planet + " period card", seat: GLYPH[cur.planet] + " " + cur.planet, when: cur.startLabel + " – " + cur.endLabel, n: cur.birth, also: cur.ruling, about: cur.frame + " Your 52-day period card.", lib: state.lib.periods[cur.index] },
      { ask: "Long Range card, the theme of my year", seat: "Year theme", when: "to " + y.endLabel.split(",")[0], n: y.birth.longRange, about: a.copy.longRange },
      { ask: "Pluto card for this year", seat: "Pluto", when: "this year", n: y.birth.pluto, about: a.copy.pluto },
      { ask: "Result card for this year", seat: "Result", when: "this year", n: y.birth.result, about: a.copy.result },
      { ask: "birth card", seat: "Birth card", when: "lifelong", n: a.identity.birth, about: a.copy.birth },
      { ask: "planetary ruling card", seat: "Ruling card", when: "lifelong", n: a.identity.ruling[0], about: a.copy.ruling },
    ].filter(function (s) { return s.n; });
  }

  function renderStrip() {
    var el = $("strip"); el.innerHTML = "";
    seats().forEach(function (s) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "tile" + (s.now ? " now" : "");
      b.setAttribute("aria-label", s.seat + ": " + s.n.card.name);
      b.innerHTML = '<div class="seat">' + esc(s.seat) + '</div><div class="code">' + cardHtml(s.n.card) + '</div><div class="when">' + esc(s.when) + "</div>";
      b.addEventListener("click", function () { openSheet(s); });
      el.appendChild(b);
    });
  }

  function openSheet(s) {
    var c = s.n.card, h = [];
    h.push('<div class="seat">' + esc(s.seat) + " · " + esc(s.when) + "</div>");
    h.push("<h2>" + cardHtml(c) + " " + esc(c.name) + "</h2>");
    h.push('<p class="sub">' + esc(c.title) + ". " + esc(s.about) + "</p><dl>");
    if (s.lib) h.push("<dt>This period</dt><dd>" + esc(s.lib.omenLine) + "</dd>");
    h.push("<dt>Light</dt><dd>" + esc(s.n.note.light) + "</dd>");
    h.push("<dt>Shadow</dt><dd>" + esc(s.n.note.shadow) + "</dd>");
    h.push("<dt>Dare</dt><dd>" + esc(s.n.note.dare) + "</dd>");
    if (s.lib) h.push("<dt>Practice</dt><dd>" + esc(s.lib.practice) + "</dd>");
    h.push("</dl>");
    if (s.also) h.push('<p class="also">Ruling-card stream: ' + cardHtml(s.also.card) + " " + esc(s.also.card.name) + ". " + esc(s.also.note.light) + "</p>");
    h.push('<div class="row"><button type="button" id="sheetClose">Close</button><button type="button" class="go" id="sheetAsk">Ask about this</button></div>');
    $("sheet").dataset.kind = "card";
    $("sheet").innerHTML = h.join("");
    $("scrim").hidden = false;
    $("sheetClose").onclick = closeSheet;
    $("sheetAsk").onclick = function () {
      closeSheet();
      ask("Tell me about my " + s.ask + " (" + c.name + "). What does it mean for me right now, and what should I do with it today?");
    };
    $("sheet").scrollTop = 0;
  }
  function closeSheet() { $("scrim").hidden = true; }
  $("scrim").addEventListener("click", function (e) { if (e.target === $("scrim")) closeSheet(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });

  // --- chat log --------------------------------------------------------------
  function todays() { return history.filter(function (m) { return m.day === today; }); }

  function renderLog() {
    var log = $("log"); log.innerHTML = "";
    var a = state.app, t = a.day.today.birth.card, p = a.year.current;
    if (!todays().length) {
      var hello = document.createElement("div"); hello.className = "hello";
      hello.innerHTML = "<h1>Today is a " + cardHtml(t) + " " + esc(t.name) + " day.</h1><p>You're in your " + GLYPH[p.planet] + " " + esc(p.planet) + " period (" + cardHtml(p.birth.card) + ") until " + esc(p.endLabel) + ". Ask me anything and I'll answer from the cards you're holding right now.</p>";
      var ideas = document.createElement("div"); ideas.className = "ideas";
      ["What should I focus on today?", "What should I watch out for this week?", "Is this a good time to push on money and work?", "How should I handle a hard conversation today?", "What are my best days coming up?"].forEach(function (q) {
        var b = document.createElement("button"); b.type = "button"; b.className = "idea"; b.textContent = q;
        b.addEventListener("click", function () { ask(q); });
        ideas.appendChild(b);
      });
      if (!me.subscribed) {
        var pw = document.createElement("button"); pw.type = "button"; pw.className = "unlock";
        pw.innerHTML = "<b>Ask your cards anything</b><span>" + esc(me.billing.price) + " \u00b7 up to " + me.billing.dailyLimit + " questions a day \u00b7 cancel anytime</span>";
        pw.addEventListener("click", openPaywall);
        hello.insertBefore(pw, hello.children[2] || null);
      }
      hello.appendChild(ideas); log.appendChild(hello);
    }
    var last = null;
    history.forEach(function (m) {
      if (m.day !== last) {
        var d = document.createElement("div"); d.className = "day";
        d.textContent = m.day === today ? "Today" : m.day; log.appendChild(d); last = m.day;
      }
      addBubble(m.role, m.content);
    });
    log.scrollTop = log.scrollHeight;
  }

  function addBubble(role, content) {
    var row = document.createElement("div"); row.className = "msg " + (role === "user" ? "user" : "bot");
    var b = document.createElement("div"); b.className = "bubble";
    if (role === "user") b.textContent = content; else b.innerHTML = md(content);
    row.appendChild(b); $("log").appendChild(row);
    return b;
  }

  function setBusy(v) {
    busy = v;
    var s = $("send");
    s.innerHTML = v ? "&#9632;" : "&#8593;";
    s.setAttribute("aria-label", v ? "Stop" : "Send");
    s.disabled = false;
  }

  function notice(text) { var n = $("notice"); n.textContent = text || ""; n.hidden = !text; }

  // --- asking Claude (through our API) ---------------------------------------
  function ask(text) {
    text = String(text || "").trim();
    if (!text || busy || !me) return;
    if (!me.subscribed) { openPaywall(); return; }
    refreshDay();
    var hello = document.querySelector(".hello"); if (hello) hello.remove();
    if (!todays().length) { var d = document.createElement("div"); d.className = "day"; d.textContent = "Today"; $("log").appendChild(d); }
    history.push({ role: "user", content: text, day: today });
    addBubble("user", text);
    $("input").value = ""; grow();
    run(text);
  }

  function run(text) {
    var bubble = addBubble("assistant", "");
    bubble.innerHTML = '<span class="thinking">Reading your cards\u2026</span>';
    var log = $("log"); log.scrollTop = log.scrollHeight;
    setBusy(true); notice("");
    ctrl = new AbortController();
    var got = "", failed = null;

    function paint() {
      var stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
      if (got) bubble.innerHTML = md(got);
      if (stick) log.scrollTop = log.scrollHeight;
    }
    function onEvent(name, data) {
      if (name === "text") { got += data.delta || ""; paint(); }
      else if (name === "error") failed = data.message || "Something went wrong.";
    }

    fetch("/api/chat", { method: "POST", credentials: "same-origin", signal: ctrl.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text, today: today }) })
      .then(function (res) {
        if (!res.ok || !res.body) {
          return res.json().catch(function () { return {}; }).then(function (d) {
            if (res.status === 401) { me = null; showAuth("login", "Your session ended. Sign in again."); }
            if (res.status === 402) { me.subscribed = false; openPaywall(); }
            throw new Error(d.error || "That didn't go through.");
          });
        }
        var reader = res.body.getReader(), dec = new TextDecoder(), buf = "";
        function pump() {
          return reader.read().then(function (r) {
            if (r.done) return;
            buf += dec.decode(r.value, { stream: true });
            var cut;
            while ((cut = buf.indexOf("\n\n")) >= 0) {
              var chunk = buf.slice(0, cut), name = "message", data = ""; buf = buf.slice(cut + 2);
              chunk.split("\n").forEach(function (l) { if (l.indexOf("event:") === 0) name = l.slice(6).trim(); else if (l.indexOf("data:") === 0) data += l.slice(5).trim(); });
              try { onEvent(name, JSON.parse(data)); } catch (e) {}
            }
            return pump();
          });
        }
        return pump();
      })
      .then(function () { if (failed) throw new Error(failed); if (!got.trim()) throw new Error("No answer came back."); })
      .then(function () {
        bubble.innerHTML = md(got);
        history.push({ role: "assistant", content: got.trim(), day: today });
      })
      .catch(function (e) {
        if (ctrl.signal.aborted) {
          if (got.trim()) { bubble.innerHTML = md(got); history.push({ role: "assistant", content: got.trim(), day: today }); }
          else bubble.parentNode.remove();
          return;
        }
        if (got.trim()) history.push({ role: "assistant", content: got.trim(), day: today });
        bubble.innerHTML = (got ? md(got) : "") + '<div class="err">' + esc((e && e.message) || "That didn't go through.") + "</div>";
        var r = document.createElement("button"); r.type = "button"; r.className = "retry"; r.textContent = "Try again";
        r.addEventListener("click", function () { if (busy) return; bubble.parentNode.remove(); run(text); });
        bubble.appendChild(r);
      })
      .then(function () { setBusy(false); log.scrollTop = log.scrollHeight; });
  }

  // --- important people ------------------------------------------------------
  function loadPeople() { return api("/api/people").then(function (d) { plist = d.people || []; return recompute(); }).catch(function () {}); }
  function recompute() {
    var forDay = today;
    return B.people(state.app, plist, forDay).then(function (r) {
      if (forDay !== today) return;
      ppl = r; renderAlerts();
      if (!$("scrim").hidden && $("sheet").dataset.kind === "people") openPeople();
    });
  }
  function todaysAlerts() { return ppl.alerts.filter(function (e) { return e.date <= today && (e.end || e.date) >= today; }); }
  function renderAlerts() {
    var t = todaysAlerts(), bar = $("alertbar"), badge = $("badge");
    badge.hidden = !t.length; badge.textContent = t.length;
    if (!t.length) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML = "<b>Today:</b> " + esc(t[0].title) + (t.length > 1 ? ' <span class="more">+' + (t.length - 1) + " more</span>" : "");
  }
  function alertRow(e) {
    var b = document.createElement("button"); b.type = "button";
    var isToday = e.date <= today && (e.end || e.date) >= today;
    b.className = "arow " + e.kind + (isToday ? " today" : "");
    b.innerHTML = '<span class="w">' + esc(isToday && !e.end ? "Today" : e.when) + "</span>" + esc(e.title);
    b.addEventListener("click", function () {
      closeSheet();
      ask((isToday ? "Today" : "On " + e.when) + ": " + e.title + ". What does that mean for me and " + e.person + ", and how should I use it?");
    });
    return b;
  }
  function openPeople() {
    var sh = $("sheet"); sh.dataset.kind = "people"; sh.innerHTML = "";
    var top = document.createElement("div");
    top.innerHTML = '<div class="seat">Important people</div><h2>Your people</h2><p class="sub">Add someone\u2019s birthday and I\u2019ll flag the days your cards collide or land in each other\u2019s spreads. You can also ask me about them.</p>';
    sh.appendChild(top);

    if (ppl.alerts.length) {
      var h = document.createElement("h3"); h.textContent = "Coming up \u00b7 next " + B.HORIZON + " days"; sh.appendChild(h);
      ppl.alerts.slice(0, 14).forEach(function (e) { sh.appendChild(alertRow(e)); });
      if (ppl.alerts.length > 14) { var m = document.createElement("p"); m.className = "small"; m.textContent = "+" + (ppl.alerts.length - 14) + " more further out. Ask me \u201cwhat are my shared days with \u2026\u201d for the full list."; sh.appendChild(m); }
    } else if (ppl.people.length) {
      var n0 = document.createElement("p"); n0.className = "small"; n0.textContent = "No shared card days in the next " + B.HORIZON + " days."; sh.appendChild(n0);
    }

    if (ppl.people.length || ppl.errors.length) { var h2 = document.createElement("h3"); h2.textContent = "People"; sh.appendChild(h2); }
    ppl.people.forEach(function (x) {
      var a = x.app, d = document.createElement("div"); d.className = "person";
      var nmEl = document.createElement("div"); nmEl.className = "nm"; nmEl.textContent = x.p.name + (x.p.relation ? " \u00b7 " + x.p.relation : ""); d.appendChild(nmEl);
      var cards = document.createElement("div"); cards.className = "cards";
      cards.innerHTML = cardHtml(a.identity.birth.card) + (a.identity.ruling[0] && a.identity.ruling[0].card.code !== a.identity.birth.card.code ? ' <span style="color:var(--soft);font-size:13px;font-family:inherit">ruling</span> ' + cardHtml(a.identity.ruling[0].card) : "");
      d.appendChild(cards);
      var meta = document.createElement("div"); meta.className = "meta";
      meta.textContent = a.birthdateDisplay + " \u00b7 " + a.identity.birth.card.name + ", " + a.identity.birth.card.title + " \u00b7 today " + a.day.today.birth.card.code + " \u00b7 " + a.year.current.planet + " period " + a.year.current.birth.card.code;
      d.appendChild(meta);
      if (x.permanent.length) {
        var ul = document.createElement("ul"); ul.className = "links";
        x.permanent.forEach(function (t) { var li = document.createElement("li"); li.textContent = t; ul.appendChild(li); });
        d.appendChild(ul);
      }
      d.appendChild(personActions(x.p, true));
      sh.appendChild(d);
    });
    ppl.errors.forEach(function (x) {
      var d = document.createElement("div"); d.className = "person";
      var nmEl = document.createElement("div"); nmEl.className = "nm"; nmEl.textContent = x.p.name; d.appendChild(nmEl);
      var meta = document.createElement("div"); meta.className = "meta";
      meta.textContent = /Joker/.test(x.message) ? "Born December 31, the Joker. The engine has no cards for that birthday." : "The engine couldn\u2019t read this birthday: " + x.message;
      d.appendChild(meta); d.appendChild(personActions(x.p, false)); sh.appendChild(d);
    });

    var h3 = document.createElement("h3"); h3.textContent = "Add someone"; sh.appendChild(h3);
    var f = document.createElement("form"); f.className = "addform";
    f.innerHTML = '<label>Name<input id="pName" maxlength="40" autocomplete="off" required></label><label>Birthday<input id="pDate" type="date" min="1900-01-01" max="' + today + '" required></label><label class="full">Who they are to you (optional)<input id="pRel" maxlength="40" placeholder="partner, mom, business partner\u2026" autocomplete="off"></label><button type="submit">Add person</button>';
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var name = $("pName").value.trim(), date = $("pDate").value, rel = $("pRel").value.trim();
      if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return;
      var btn = f.querySelector("button"); btn.disabled = true;
      api("/api/people", "POST", { name: name, birthdate: date, relation: rel })
        .then(function (d) { plist = d.people; return recompute(); })
        .catch(function (e) { btn.disabled = false; $("pMsg").textContent = e.message; $("pMsg").className = "small err"; });
    });
    sh.appendChild(f);
    var msg = document.createElement("p"); msg.className = "small"; msg.id = "pMsg";
    msg.textContent = "Your list is saved to your account and follows you across devices.";
    sh.appendChild(msg);
    var row = document.createElement("div"); row.className = "row"; row.style.marginTop = "14px";
    var c = document.createElement("button"); c.type = "button"; c.textContent = "Close"; c.addEventListener("click", closeSheet); row.appendChild(c);
    sh.appendChild(row);
    $("scrim").hidden = false;
  }
  function personActions(p, canAsk) {
    var act = document.createElement("div"); act.className = "act";
    if (canAsk) {
      var askB = document.createElement("button"); askB.type = "button"; askB.className = "go"; askB.textContent = "Ask about " + p.name;
      askB.addEventListener("click", function () { closeSheet(); ask("Tell me about " + p.name + " and me. How do our cards connect, what is each of us carrying right now, and what should I keep in mind with them today?"); });
      act.appendChild(askB);
    }
    var rm = document.createElement("button"); rm.type = "button"; rm.textContent = "Remove";
    rm.addEventListener("click", function () {
      if (rm.dataset.sure) { rm.disabled = true; api("/api/people/" + p.id, "DELETE").then(function (d) { plist = d.people; return recompute(); }).catch(function () { rm.disabled = false; }); }
      else { rm.dataset.sure = "1"; rm.textContent = "Tap again to remove"; }
    });
    act.appendChild(rm);
    return act;
  }
  $("peopleBtn").addEventListener("click", openPeople);
  $("alertbar").addEventListener("click", openPeople);

  // --- wiring ----------------------------------------------------------------
  // Keep the latest message in view when the on-screen keyboard opens or closes.
  if (window.visualViewport) window.visualViewport.addEventListener("resize", function () { var l = $("log"); if (l) l.scrollTop = l.scrollHeight; });
  function grow() { var t = $("input"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight + 2, 132) + "px"; }
  $("input").addEventListener("input", grow);
  $("input").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && window.matchMedia("(pointer: fine)").matches) { e.preventDefault(); ask($("input").value); }
  });
  $("form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) { if (ctrl) ctrl.abort(); return; }
    ask($("input").value);
  });
  $("accountBtn").addEventListener("click", openAccount);

  function refreshDay() {
    var d = B.isoLocal();
    if (d === today && state) return false;
    today = d; state = B.build(today); renderStrip();
    recompute();
    return true;
  }
  document.addEventListener("visibilitychange", function () {
    if (me && !document.hidden && !busy && refreshDay()) renderLog();
  });

  // --- subscription ----------------------------------------------------------
  function openPaywall() {
    var sh = $("sheet"); sh.dataset.kind = "paywall";
    sh.innerHTML = '<div class="seat">Subscription</div><h2>Ask your cards anything</h2>' +
      '<p class="sub">Your daily assistant reads every question through the cards you\u2019re holding that day.</p>' +
      '<div class="price"><b></b><span></span></div>' +
      '<ul class="perks"><li>Answers from today\u2019s card, your week, your 52-day period and your year</li><li>Questions about the people on your list and how your cards meet theirs</li><li>Any date, any year of your life, any card</li><li>Cancel anytime</li></ul>' +
      '<p class="small err" id="pwMsg"></p><div class="row"><button type="button" id="pwClose">Not now</button><a class="btnlink go" id="pwGo" rel="noopener">Subscribe</a></div>' +
      '<p class="small">Payment is handled by Stripe. Your cards, alerts and people list stay free.</p>';
    sh.querySelector(".price b").textContent = me.billing.price;
    sh.querySelector(".price span").textContent = "Up to " + me.billing.dailyLimit + " questions a day";
    $("pwClose").onclick = closeSheet;
    if (me.billing.payUrl) $("pwGo").href = me.billing.payUrl;
    else { $("pwGo").removeAttribute("href"); $("pwGo").style.opacity = ".5"; $("pwMsg").textContent = "Subscriptions aren\u2019t open yet. Check back soon."; }
    $("scrim").hidden = false; sh.scrollTop = 0;
  }
  /** After Stripe sends them back (?paid=1), wait for the webhook to mark the account active. */
  function confirmPayment() {
    var tries = 0;
    notice("Confirming your payment\u2026");
    (function poll() {
      api("/api/me").then(function (d) {
        if (d.user && d.user.subscribed) { me = d.user; notice(""); closeSheet(); renderLog(); return; }
        if (++tries < 10) setTimeout(poll, 2000);
        else notice("Your payment is still processing. Reload in a minute; if it doesn\u2019t unlock, reply to your Stripe receipt.");
      }).catch(function () { notice(""); });
    })();
  }

  // --- account ---------------------------------------------------------------
  function openAccount() {
    var sh = $("sheet"); sh.dataset.kind = "account";
    sh.innerHTML = '<div class="seat">Account</div><h2></h2><p class="sub"></p>' +
      '<h3>Subscription</h3><p class="small" id="acSub" style="margin:0 0 8px"></p><div class="stack" id="acBill"></div><h3>Chat</h3>' +
      '<div class="stack"><button type="button" id="acClear">Clear chat history</button><button type="button" id="acOut">Sign out</button></div>' +
      '<h3>Delete account</h3><p class="small" style="margin:0 0 8px">Removes your account, people list and chat history for good.</p>' +
      '<form class="addform" id="acDel"><label class="full">Your password<input id="acPw" type="password" autocomplete="current-password" required></label><button type="submit" style="background:var(--ink)">Delete my account</button></form>' +
      '<p class="small err" id="acMsg"></p><div class="row" style="margin-top:14px"><button type="button" id="acClose">Close</button></div>';
    sh.querySelector("h2").textContent = me.name;
    sh.querySelector(".sub").textContent = me.email + " \u00b7 born " + state.app.birthdateDisplay;
    var renew = me.renews ? new Date(me.renews * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
    $("acSub").textContent = !me.billing.required ? "No subscription needed right now." : me.subscribed ? "Active: " + me.billing.price + ", up to " + me.billing.dailyLimit + " questions a day." + (renew ? " Current period ends " + renew + "." : "") : me.status === "past_due" ? "Your last payment didn\u2019t go through. Update your card to keep asking questions." : "Not subscribed. Your cards and people list are free; asking questions is " + me.billing.price + ".";
    if (me.billing.required && !me.subscribed) { var sb = document.createElement("button"); sb.type = "button"; sb.textContent = "Subscribe"; sb.style.cssText = "background:var(--red);color:#fff;border-color:var(--red)"; sb.onclick = openPaywall; $("acBill").appendChild(sb); }
    if (me.billing.portalUrl && me.status !== "none") { var pl = document.createElement("a"); pl.className = "btnlink"; pl.href = me.billing.portalUrl; pl.rel = "noopener"; pl.textContent = "Manage or cancel subscription"; $("acBill").appendChild(pl); }
    $("acClose").onclick = closeSheet;
    $("acClear").onclick = function () {
      var b = $("acClear");
      if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Tap again to clear everything"; return; }
      if (busy && ctrl) ctrl.abort();
      api("/api/messages", "DELETE").then(function () { history = []; renderLog(); closeSheet(); }).catch(function (e) { $("acMsg").textContent = e.message; });
    };
    $("acOut").onclick = function () { api("/api/logout", "POST").catch(function () {}).then(function () { me = null; closeSheet(); showAuth("login"); }); };
    $("acDel").addEventListener("submit", function (ev) {
      ev.preventDefault();
      api("/api/account", "DELETE", { password: $("acPw").value }).then(function () { me = null; closeSheet(); showAuth("signup", "Your account and data were deleted."); }).catch(function (e) { $("acMsg").textContent = e.message; });
    });
    $("scrim").hidden = false;
  }

  // --- sign in / sign up --------------------------------------------------------
  var authMode = "signup";
  function showAuth(mode, note) {
    authMode = mode || authMode;
    var up = authMode === "signup";
    $("boot").hidden = true; $("app").hidden = true; $("auth").hidden = false;
    $("authTitle").textContent = up ? "Create your account" : "Welcome back";
    $("authSub").textContent = up ? "Your birthday sets your cards. Ask anything, every day." : "Sign in to see today\u2019s cards.";
    $("fName").hidden = $("fBirth").hidden = !up;
    $("aName").required = $("aBirth").required = up;
    $("aPass").autocomplete = up ? "new-password" : "current-password";
    $("authGo").textContent = up ? "Create account" : "Sign in";
    $("authSwap").textContent = up ? "I already have an account" : "Create a new account";
    $("authMsg").textContent = note || ""; $("authMsg").className = "small" + (note && /ended|match|already|needs|18|Joker/.test(note) ? " err" : "");
    $("aBirth").max = new Date().toISOString().slice(0, 10);
  }
  $("authSwap").addEventListener("click", function () { showAuth(authMode === "signup" ? "login" : "signup"); });
  $("authForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var up = authMode === "signup", btn = $("authGo");
    var body = { email: $("aEmail").value.trim(), password: $("aPass").value };
    if (up) { body.name = $("aName").value.trim(); body.birthdate = $("aBirth").value; }
    btn.disabled = true; $("authMsg").textContent = "";
    api(up ? "/api/signup" : "/api/login", "POST", body)
      .then(function (d) { $("aPass").value = ""; start(d.user); })
      .catch(function (e) { $("authMsg").textContent = e.message; $("authMsg").className = "small err"; })
      .then(function () { btn.disabled = false; });
  });

  function start(user) {
    me = user; history = []; plist = []; ppl = { people: [], alerts: [], errors: [] }; state = null; today = null;
    B = window.makeBrain(window.CardBlueprints, me.birthdate, me.name);
    $("boot").hidden = true; $("auth").hidden = true; $("app").hidden = false;
    try { refreshDay(); renderLog(); renderAlerts(); }
    catch (e) { $("log").innerHTML = '<p class="err">The card engine failed to load: ' + esc((e && e.message) || e) + "</p>"; return; }
    setBusy(false);
    api("/api/messages").then(function (d) { history = d.messages || []; renderLog(); }).catch(function () {});
    loadPeople();
    if (/[?&]paid=1/.test(location.search)) {
      try { window.history.replaceState(null, "", location.pathname); } catch (e) {}
      if (!me.subscribed) confirmPayment();
    }
  }

  api("/api/me").then(function (d) { if (d.user) start(d.user); else showAuth("signup"); }, function (e) { showAuth("login", e.message); });
})();
