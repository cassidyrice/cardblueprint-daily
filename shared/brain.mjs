/* Card Blueprints daily assistant: context builder and engine tools.
 * Shared by the Worker (builds the Claude prompt, runs tools) and the browser
 * (card strip, people alerts). Everything is computed from the vendored
 * cardblueprints.com engine bundle passed in as CB. */
export function makeBrain(CB, BIRTHDATE, ownerName) {
  "use strict";
  function isoLocal(d) {
    d = d || new Date();
    var p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function nm(n) { return n ? n.card.code + " " + n.card.name + " (" + n.card.title + ")" : "none"; }
  function line(n) {
    if (!n) return "none";
    return nm(n) + " | light: " + n.note.light + " | shadow: " + n.note.shadow + " | dare: " + n.note.dare;
  }
  function notes(code) {
    var c = CB.toYearCard(code);
    var x = CB.NOTES[c.slug];
    return x ? x : null;
  }

  function identityBlock(label, id) {
    var out = [];
    out.push("### " + label + ": " + nm(id));
    out.push("Core: " + id.coreIdentity);
    out.push("Sweet spot: " + id.sweetSpot);
    out.push("Shadow: " + id.shadow);
    out.push("Cost: " + id.cost);
    out.push("Watch for: " + id.watchFor);
    out.push("Gifts: " + id.gifts.join("; "));
    if (id.lens) out.push("Under: " + id.lens.under + " | Over: " + id.lens.over);
    out.push("Life direction: " + id.lifeDirection);
    out.push("Note - light: " + id.note.light + " | shadow: " + id.note.shadow + " | dare: " + id.note.dare);
    var b = CB.cardBible(id.card.code);
    if (b) {
      out.push("Shadow archetype: " + b.archetype + " - " + b.coreShadow);
      out.push("In the light: " + b.lightName + " - " + b.inTheLight);
      out.push("Worldview under pressure: " + b.worldview);
    }
    var n = notes(id.card.code);
    if (n) out.push("Love: " + n.love + "\nWork: " + n.work);
    return out.join("\n");
  }

  function build(todayIso) {
    var app = CB.buildCardApp(BIRTHDATE, todayIso);
    var lib = CB.appReadingLibrary(app);
    return { app: app, lib: lib };
  }

  /** The full dossier the assistant answers from. */
  function dossier(state) {
    var a = state.app, lib = state.lib, y = a.year, o = [];
    var cur = y.current, wk = a.week.current, td = a.day.today;
    var dayIn = Math.round((Date.parse(a.today) - Date.parse(cur.start)) / 86400000) + 1;

    o.push("# CARD BLUEPRINT for birthdate " + a.birthdateDisplay + " (age " + a.age + ")");
    o.push("Today is " + a.todayLabel + ". All timing below was computed by the Card Blueprints engine for this date.");

    o.push("\n## RIGHT NOW (use these first)");
    o.push("TODAY'S CARD (" + td.label + "): birth-card stream " + line(td.birth) + "\n  ruling-card stream " + line(td.ruling));
    o.push("THIS WEEK'S CARD (" + wk.startLabel + " to " + wk.endLabel + ", " + wk.planet + " week: " + wk.domain + "): " + line(wk.birth) + "\n  ruling stream " + line(wk.ruling));
    o.push("CURRENT 52-DAY PERIOD: " + cur.planet + " (" + cur.startLabel + " to " + cur.endLabel + ", day " + dayIn + " of " + cur.lengthDays + "). Domain: " + cur.domain + ". " + cur.frame + " " + cur.pressure);
    o.push("  Period card (birth stream): " + line(cur.birth));
    o.push("  Period card (ruling stream): " + line(cur.ruling));
    var pl = lib.periods[cur.index];
    if (pl) {
      o.push("  Period reading - " + pl.title + ": " + pl.omenLine);
      o.push("  " + pl.longReading.join(" "));
      o.push("  Shadow watch: " + pl.shadowWatch);
      o.push("  Practice: " + pl.practice);
      o.push("  Reflection: " + pl.reflection);
      if (pl.personOrPosture) o.push("  Person or posture: " + pl.personOrPosture);
    }
    var pn = notes(cur.birth.card.code);
    if (pn) o.push("  Period card in love: " + pn.love + "\n  Period card at work: " + pn.work);
    var dn = notes(td.birth.card.code);
    if (dn) o.push("  Today's card in love: " + dn.love + "\n  Today's card at work: " + dn.work);

    o.push("\n## NEXT 6 DAYS (daily cards, birth stream / ruling stream)");
    a.day.next.forEach(function (d) {
      o.push(d.weekday + " " + d.label + ": " + nm(d.birth) + " / " + nm(d.ruling));
    });

    o.push("\n## WHO THEY ARE");
    o.push(identityBlock("BIRTH CARD", a.identity.birth));
    a.identity.ruling.forEach(function (r) { o.push(identityBlock("PLANETARY RULING CARD", r)); });
    o.push("Position meanings: " + a.copy.birth + " " + a.copy.ruling);
    o.push("### Lifetime karma\nKarma gift: " + line(a.karma.gift) + " - " + a.copy.karmaGift);
    o.push("Karma challenge: " + line(a.karma.challenge) + " - " + a.copy.karmaChallenge);
    o.push("### Life Spread (lifetime cards by planet)");
    a.lifeSpread.periods.forEach(function (p) { o.push(p.planet + ": " + line(p)); });
    o.push("Life Pluto: " + line(a.lifeSpread.pluto));
    o.push("Life Result: " + line(a.lifeSpread.result));

    o.push("\n## THIS BIRTHDAY YEAR (" + y.startLabel + " to " + y.endLabel + ")");
    var lr = y.birth.longRange;
    o.push("Long Range (theme of the year): " + line(lr) + " - year " + lr.yearInCycle + " of the 7-year cycle for ages " + lr.cycleStartAge + "-" + lr.cycleEndAge + " (cycle: " + lr.cycle.map(function (c) { return c.code; }).join(", ") + ")");
    o.push("Pluto (what the year asks them to change): " + line(y.birth.pluto));
    o.push("Result (what the year pays for that work): " + line(y.birth.result));
    o.push("Year Environment (support): " + line(y.environment));
    o.push("Year Displacement (where they sit this year): " + line(y.displacement));
    if (y.ruling) o.push("Ruling-card stream: Long Range " + nm(y.ruling.longRange) + "; Pluto " + nm(y.ruling.pluto) + "; Result " + nm(y.ruling.result));
    ["Long Range", "Pluto", "Result", "Environment", "Displacement"].forEach(function (role) {
      var e = lib.year[role];
      if (e) o.push("[" + role + " reading] " + e.title + ": " + e.reading + " Reflection: " + e.reflection);
    });
    y.signals.forEach(function (s) { o.push("Signal: " + s.title + ". " + s.detail); });

    o.push("\n### The seven 52-day periods of this year");
    y.periods.forEach(function (p, i) {
      var e = lib.periods[i];
      o.push(p.planet + " (" + p.startLabel + " to " + p.endLabel + ", " + p.state + "): birth stream " + nm(p.birth) + ", ruling stream " + nm(p.ruling) + (e ? ". " + e.title + ": " + e.omenLine + " Practice: " + e.practice : ""));
    });

    o.push("\n## UPCOMING MARKED DAYS (good = lean in, watch = go slow, turn = chapter change)");
    a.events.filter(function (e) { return e.date >= a.today; }).slice(0, 14).forEach(function (e) {
      o.push(e.date + (e.end ? " to " + e.end : "") + " [" + e.kind + "] " + e.title + (e.card ? " (" + e.card.code + ")" : "") + ": " + e.detail);
    });
    return o.join("\n");
  }

  var METHOD = CB.GUIDE.split("## Reader voice")[0].trim();

  function systemText(state, ppl) {
    return [
      "You are the personal Card Blueprints daily assistant for one person" + (ownerName ? ", " + ownerName : "") + ", born " + state.app.birthdateDisplay + ". They open you each day and ask anything: work, money, relationships, decisions, timing, mood, what to focus on.",
      "",
      "How to answer:",
      "- Answer the actual question first, in plain practical language, then show which of their cards the answer comes from.",
      "- Always read the question through the cards active RIGHT NOW (today's card, this week's card, the current 52-day period, the year cards), layered on the birth card and planetary ruling card. Name the card code and its seat, e.g. \"your period card, J♣ in Uranus\".",
      "- Use only the card data in the blueprint below or returned by your tools. Never invent a card, date, or meaning. If they ask about another date, another year of life, or a card not in the blueprint, call a tool.",
      "- Cards describe patterns and timing, not fate. No predictions, no guarantees. For decisions, lay out what the cards favor and caution, and leave the choice with them. For health, legal or financial questions, give the card pattern only and say it is not professional advice.",
      "- Keep replies short for a phone: usually 80 to 180 words, short paragraphs, **bold** card codes. End with one concrete thing to do today when it fits. Longer only when asked.",
      "- When they ask about someone on their IMPORTANT PEOPLE list, read that person's cards against theirs: the lifetime seats each holds in the other's spread, what each is carrying right now, and any upcoming shared days. Describe the dynamic and what to try; never tell them what the other person thinks or will do, and never pass a verdict on the person or the relationship. If they name someone not on the list, ask for the birthday or suggest adding them under People.",
      "- Speak to them as \"you\". No horoscope cliches, no \"the universe\", no \"energy\" or \"manifest\".",
      "",
      METHOD,
      "",
      dossier(state),
      peopleBlock(ppl),
    ].join("\n");
  }

  // --- tools the assistant can call ------------------------------------------

  function normCard(input) {
    var s = String(input || "").trim();
    var suits = { hearts: "♥", heart: "♥", h: "♥", clubs: "♣", club: "♣", c: "♣", diamonds: "♦", diamond: "♦", d: "♦", spades: "♠", spade: "♠", s: "♠" };
    var ranks = { ace: "A", one: "A", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", jack: "J", queen: "Q", king: "K" };
    var m = s.match(/^(10|[2-9AJQKajqk])\s*([♥♣♦♠])$/);
    if (m) return m[1].toUpperCase() + m[2];
    m = s.toLowerCase().match(/^(\w+)\s*(?:of\s+)?(\w+)$/);
    if (m) {
      var r = ranks[m[1]] || (/^(10|[2-9]|[ajqk])$/.test(m[1]) ? m[1].toUpperCase() : null);
      var su = suits[m[2]];
      if (r && su) return r + su;
    }
    return null;
  }

  function tools(ppl) {
    var extra = ppl && ppl.people.length ? [{
      name: "person_cards",
      description: "Full card details for someone on the Important People list: who they are (birth and ruling card write-ups), their year cards, current period, week and daily card, plus every link between their cards and this person's. Optional date (YYYY-MM-DD) for their timing on another day.",
      inputSchema: { type: "object", properties: { name: { type: "string" }, date: { type: "string" } }, required: ["name"] },
      execute: function (input) {
        var q = String(input.name || "").toLowerCase().trim();
        var hit = ppl.people.filter(function (x) { return x.p.name.toLowerCase() === q; })[0] || ppl.people.filter(function (x) { return x.p.name.toLowerCase().indexOf(q) >= 0; })[0];
        if (!hit) throw new Error("no one named " + input.name + " on the list. Names: " + ppl.people.map(function (x) { return x.p.name; }).join(", "));
        var a = input.date ? CB.buildCardApp(hit.p.birthdate, String(input.date)) : hit.app, y = a.year, id = a.identity.birth, r = a.identity.ruling[0];
        return {
          name: hit.p.name, relationship: hit.p.relation || null, birthdate: a.birthdateDisplay, age: a.age, asOf: a.todayLabel,
          birthCard: { card: nm(id), core: id.coreIdentity, sweetSpot: id.sweetSpot, shadow: id.shadow, cost: id.cost, watchFor: id.watchFor, gifts: id.gifts },
          rulingCard: r ? { card: nm(r), core: r.coreIdentity, sweetSpot: r.sweetSpot, shadow: r.shadow } : null,
          today: line(a.day.today.birth), week: nm(a.week.current.birth) + " (" + a.week.current.startLabel + " to " + a.week.current.endLabel + ")",
          period: y.current.planet + " " + y.current.startLabel + " to " + y.current.endLabel + ": " + line(y.current.birth),
          year: { range: y.startLabel + " to " + y.endLabel, longRange: nm(y.birth.longRange), pluto: nm(y.birth.pluto), result: nm(y.birth.result), environment: nm(y.environment), displacement: nm(y.displacement), periods: y.periods.map(function (p) { return p.planet + " " + p.startLabel + "-" + p.endLabel + " " + p.birth.card.code; }) },
          lifetimeLinks: hit.permanent, thisYearLinks: hit.yearLinks, upcomingSharedDays: hit.alerts.slice(0, 12).map(function (e) { return e.when + ": " + e.title; }),
        };
      },
    }] : [];
    return extra.concat([
      {
        name: "cards_on_date",
        description: "Run the Card Blueprints engine for this person on any date (past or future, on or after their birthdate). Returns that day's daily card, week card, 52-day period card and year cards.",
        inputSchema: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD" } }, required: ["date"] },
        execute: function (input) {
          var a = CB.buildCardApp(BIRTHDATE, String(input.date));
          var y = a.year;
          return {
            date: a.todayLabel, age: a.age,
            daily: { birth: line(a.day.today.birth), ruling: line(a.day.today.ruling) },
            week: { range: a.week.current.startLabel + " to " + a.week.current.endLabel, planet: a.week.current.planet, birth: line(a.week.current.birth), ruling: nm(a.week.current.ruling) },
            period: { planet: y.current.planet, range: y.current.startLabel + " to " + y.current.endLabel, domain: y.current.domain, birth: line(y.current.birth), ruling: nm(y.current.ruling) },
            year: { range: y.startLabel + " to " + y.endLabel, longRange: nm(y.birth.longRange), pluto: nm(y.birth.pluto), result: nm(y.birth.result), environment: nm(y.environment), displacement: nm(y.displacement) },
          };
        },
      },
      {
        name: "year_of_life",
        description: "Card codes for a whole birthday year at a given age (0-89): the seven period cards, Pluto, Result, Long Range, Environment and Displacement for both the birth-card and ruling-card streams.",
        inputSchema: { type: "object", properties: { age: { type: "integer" } }, required: ["age"] },
        execute: function (input) {
          var a = CB.buildCardApp(BIRTHDATE, isoLocal());
          var row = a.life[Number(input.age)];
          if (!row) throw new Error("age must be 0-89");
          return { age: row.age, birthdayYearStarts: a.birthdateDisplay.replace(/, \d{4}$/, "") + ", " + row.calendarYear, periodOrder: "Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune", birth: row.birth, ruling: row.ruling, environment: row.environment, displacement: row.displacement };
        },
      },
      {
        name: "card_meaning",
        description: "Full Card Blueprints meaning for any single card: core identity, sweet spot, shadow, cost, gifts, plus how it shows up in love, work and timing. Input like 'K♦' or 'king of diamonds'.",
        inputSchema: { type: "object", properties: { card: { type: "string" } }, required: ["card"] },
        execute: function (input) {
          var code = normCard(input.card);
          var b = code && CB.cardBible(code);
          if (!b) throw new Error("unknown card: " + input.card);
          var c = CB.cardCopy(code), n = notes(code) || {};
          return { code: code, name: b.name, title: b.title, core: b.coreIdentity, sweetSpot: b.sweetSpot, shadow: b.shadow, cost: b.cost, watchFor: b.watchFor, gifts: b.gifts, under: b.lens && b.lens.under, over: b.lens && b.lens.over, lifeDirection: b.lifeDirection, light: c.light, shadowNote: c.shadow, dare: c.dare, love: n.love, work: n.work, timing: n.timing };
        },
      },
    ]);
  }

  // --- important people -------------------------------------------------------

  var DAY = 86400000, MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function isoAdd(iso, n) { return new Date(Date.parse(iso + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10); }
  function lbl(iso) { var d = new Date(iso + "T00:00:00Z"); return WD[d.getUTCDay()] + " " + MON[d.getUTCMonth()] + " " + d.getUTCDate(); }
  function daily(card, bdIso, iso) {
    var b = bdIso.split("-").map(Number), t = iso.split("-").map(Number);
    var w = CB.cardology.getWeekly(card, b[0], b[1], b[2], new Date(t[0], t[1] - 1, t[2], 12, 0, 0, 0));
    return w ? w.current_card : null;
  }
  function cname(code) { return code + " " + CB.toYearCard(code).name; }

  var HORIZON = 45;

  /** Everything the app knows about one person relative to the owner, for one day. */
  function personContext(me, p, todayIso) {
    var app = CB.buildCardApp(p.birthdate, todayIso);
    var mine = [{ c: me.identity.birth.card.code, k: "birth" }], theirs = [{ c: app.identity.birth.card.code, k: "birth" }];
    var myR = (me.year.ruling && me.identity.ruling.filter(function (r) { return r.card.code !== mine[0].c; })[0]) || null;
    var thR = (app.year.ruling && app.identity.ruling.filter(function (r) { return r.card.code !== theirs[0].c; })[0]) || null;
    if (myR) mine.push({ c: myR.card.code, k: "ruling" });
    if (thR) theirs.push({ c: thR.card.code, k: "ruling" });
    function kindOf(list, code) { var h = list.filter(function (x) { return x.c === code; })[0]; return h ? h.k : null; }
    var N = p.name, alerts = [], end = isoAdd(todayIso, HORIZON);
    function push(e) { e.person = N; e.pid = p.id; e.when = e.end && e.end !== e.date ? lbl(e.date) + " to " + lbl(e.end) : lbl(e.date); alerts.push(e); }

    for (var i = 0; i <= HORIZON; i++) {
      var d = isoAdd(todayIso, i);
      var mB = daily(mine[0].c, BIRTHDATE, d), mR = myR ? daily(myR.card.code, BIRTHDATE, d) : null;
      var tB = daily(theirs[0].c, p.birthdate, d), tR = thR ? daily(thR.card.code, p.birthdate, d) : null;
      var k;
      if (mB && mB === tB) push({ date: d, kind: "collide", card: mB, title: "You and " + N + " have the same card of the day: " + cname(mB), detail: "Your daily cards collide. You are both working the same pattern that day, so you will either sync up or mirror each other." });
      if ((k = kindOf(theirs, mB))) push({ date: d, kind: "theirs", card: mB, title: N + "'s " + k + " card (" + mB + ") is your card of the day", detail: N + " or what " + N + " stands for is likely to be on your mind. A good day to reach out or to notice how you react to them." });
      if (mR && (k = kindOf(theirs, mR))) push({ date: d, kind: "theirs", card: mR, title: N + "'s " + k + " card (" + mR + ") is your ruling-stream card of the day", detail: N + "'s pattern shows up in how you carry yourself that day." });
      if ((k = kindOf(mine, tB))) push({ date: d, kind: "yours", card: tB, title: "Your " + k + " card (" + tB + ") is " + N + "'s card of the day", detail: "You are in " + N + "'s cards that day. They may be more tuned to you than usual." });
      if (tR && (k = kindOf(mine, tR))) push({ date: d, kind: "yours", card: tR, title: "Your " + k + " card (" + tR + ") is " + N + "'s ruling-stream card of the day", detail: "Your pattern shows up in how " + N + " carries themself that day." });
    }
    // week cards (about 7.4 days) and 52-day period cards
    function windows(rows, list, mk) {
      rows.forEach(function (w) {
        if (w.end < todayIso || w.start > end) return;
        var k2 = kindOf(list, w.birth.card.code);
        if (k2) push(mk(w, k2));
      });
    }
    windows(me.week.all, theirs, function (w, k2) { return { date: w.start, end: w.end, kind: "theirs", card: w.birth.card.code, title: N + "'s " + k2 + " card (" + w.birth.card.code + ") is your card for the week", detail: "For about a week, " + N + "'s pattern is the one you are working with." }; });
    windows(app.week.all, mine, function (w, k2) { return { date: w.start, end: w.end, kind: "yours", card: w.birth.card.code, title: "Your " + k2 + " card (" + w.birth.card.code + ") is " + N + "'s card for the week", detail: "For about a week, your pattern is the one " + N + " is working with." }; });
    windows(me.year.periods, theirs, function (w, k2) { return { date: w.start, end: w.end, kind: "theirs", card: w.birth.card.code, title: N + "'s " + k2 + " card (" + w.birth.card.code + ") is your " + w.planet + " period card", detail: "For this 52-day period, " + N + "'s card sits in your " + w.planet + " seat: " + w.domain + "." }; });
    windows(app.year.periods, mine, function (w, k2) { return { date: w.start, end: w.end, kind: "yours", card: w.birth.card.code, title: "Your " + k2 + " card (" + w.birth.card.code + ") is " + N + "'s " + w.planet + " period card", detail: "For this 52-day period, your card sits in " + N + "'s " + w.planet + " seat: " + w.domain + "." }; });
    // same 52-day card at the same time
    me.year.periods.forEach(function (a1) {
      app.year.periods.forEach(function (a2) {
        if (a1.birth.card.code !== a2.birth.card.code) return;
        var s0 = a1.start > a2.start ? a1.start : a2.start, e0 = a1.end < a2.end ? a1.end : a2.end;
        if (s0 <= e0 && e0 >= todayIso && s0 <= end) push({ date: s0, end: e0, kind: "collide", card: a1.birth.card.code, title: "You and " + N + " hold the same period card: " + cname(a1.birth.card.code), detail: "You in " + a1.planet + ", " + N + " in " + a2.planet + ". Same card, two different seats, at the same time." });
      });
    });
    // birthday
    var b = p.birthdate.split("-").map(Number);
    [0, 1].forEach(function (off) {
      var y0 = Number(todayIso.slice(0, 4)) + off, bd = new Date(Date.UTC(y0, b[1] - 1, b[2]));
      if (bd.getUTCMonth() !== b[1] - 1) bd = new Date(Date.UTC(y0, b[1] - 1, b[2] - 1));
      var iso = bd.toISOString().slice(0, 10);
      if (iso >= todayIso && iso <= end) push({ date: iso, kind: "birthday", card: theirs[0].c, title: N + "'s birthday: a new year of cards starts for them", detail: N + " turns " + (y0 - b[0]) + "." });
    });
    var same = alerts.filter(function (e) { return e.kind === "collide" && !e.end; });
    if (same.length > 10) {
      alerts = alerts.filter(function (e) { return same.indexOf(e) < 0; });
      push({ date: todayIso, end: end, kind: "collide", card: same[0].card, title: "You and " + N + " share the same card of the day on " + same.length + " of the next " + HORIZON + " days", detail: "Your daily cards run together almost every day. Expect to be working the same patterns at the same time." });
    }
    alerts.sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; });
    return { p: p, app: app, alerts: alerts, permanent: [], yearLinks: [], summary: "" };
  }

  /** Build context for the whole list. Resolves { people, alerts, errors }. */
  function people(me, list, todayIso) {
    var out = { people: [], alerts: [], errors: [] };
    return list.reduce(function (chain, p) {
      return chain.then(function () {
        var ctx;
        try { ctx = personContext(me, p, todayIso); } catch (e) { out.errors.push({ p: p, message: (e && e.message) || String(e) }); return; }
        return CB.buildQuestionReadingFacts({ track: "chemistry-check", birth1: BIRTHDATE, name1: "You", birth2: p.birthdate, name2: p.name, question: "", targetDate: todayIso }).then(function (f) {
          var c = f.compatibility;
          ctx.permanent = c.person2InPerson1.map(function (h) { return p.name + "'s " + h.subjectCardKind + " card " + h.subjectCard + " sits in the " + h.seatTitle + " seat of your " + h.ownerSpreadKind + "-card life spread. " + h.relationshipMeaning; })
            .concat(c.person1InPerson2.map(function (h) { return "Your " + h.subjectCardKind + " card " + h.subjectCard + " sits in the " + h.seatTitle + " seat of " + p.name + "'s " + h.ownerSpreadKind + "-card life spread. To them: " + h.relationshipMeaning; }));
          ctx.direction = c.directionality;
          ctx.yearLinks = c.crossYearAppearances.map(function (x) { return (x.whoAppears === "person2_in_person1" ? p.name + "'s " + x.cardKind + " card " + x.card + " is in your " : "Your " + x.cardKind + " card " + x.card + " is in " + p.name + "'s ") + x.where + " (" + x.whenLabel + ")"; });
          ctx.shared = c.sharedWindowCards.map(function (x) { return x.card; });
        }).catch(function () {}).then(function () { out.people.push(ctx); });
      });
    }, Promise.resolve()).then(function () {
      out.people.forEach(function (x) { out.alerts = out.alerts.concat(x.alerts); });
      out.alerts.sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; });
      return out;
    });
  }

  function peopleBlock(ppl) {
    if (!ppl || !ppl.people.length) return "\n## IMPORTANT PEOPLE\nNone added yet. They can add people (name and birthday) with the People button.";
    var o = ["\n## IMPORTANT PEOPLE (their list; cards computed by the same engine)"];
    ppl.people.forEach(function (x) {
      var a = x.app, id = a.identity.birth, r = a.identity.ruling[0], y = a.year;
      o.push("### " + x.p.name + (x.p.relation ? " (" + x.p.relation + ")" : "") + ", born " + a.birthdateDisplay + ", age " + a.age);
      o.push("Birth card " + nm(id) + ". Core: " + id.coreIdentity + " Shadow: " + id.shadow);
      if (r) o.push("Ruling card " + nm(r) + ". Sweet spot: " + r.sweetSpot + " Shadow: " + r.shadow);
      o.push("Right now: today's card " + nm(a.day.today.birth) + "; week card " + nm(a.week.current.birth) + "; " + y.current.planet + " period (" + y.current.startLabel + " to " + y.current.endLabel + ") " + line(y.current.birth));
      o.push("Their year (" + y.startLabel + " to " + y.endLabel + "): Long Range " + nm(y.birth.longRange) + ", Pluto " + nm(y.birth.pluto) + ", Result " + nm(y.birth.result));
      o.push("Lifetime links with you: " + (x.permanent.length ? x.permanent.join(" | ") : "no direct life-spread seat in either direction; the connection runs through shared yearly cards and timing."));
      if (x.yearLinks.length) o.push("This-year links: " + x.yearLinks.join("; "));
      if (x.shared && x.shared.length) o.push("Cards you both hold somewhere this year: " + x.shared.join(", "));
      o.push("Upcoming shared days: " + (x.alerts.length ? x.alerts.slice(0, 8).map(function (e) { return e.when + " - " + e.title; }).join("; ") : "none in the next " + HORIZON + " days"));
    });
    return o.join("\n");
  }

  return { people: people, lbl: lbl, HORIZON: HORIZON, BIRTHDATE: BIRTHDATE, isoLocal: isoLocal, build: build, dossier: dossier, systemText: systemText, tools: tools, normCard: normCard };
}
