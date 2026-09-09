/* Crumb — demo logic. No backend, no framework, no build step.
 *
 * The real app this is modelled on keeps an append-only ledger in a database and
 * the balance is sum(amount). Here the same ledger lives in localStorage so the
 * page can be opened from anywhere, including a file:// double-click. */

(function () {
  'use strict';

  var STORE_KEY = 'crumb_demo_v1';
  var PER_PASTRY_CENTS = 5000;   /* $50 received = one pastry */
  var SLOTS_PER_ROW = 6;
  var NAME_MS = 1700;
  var TOAST_MS = 2600;

  /* ---------------------------------------------------------------- seed data
   * Invented people, invented history. Cents throughout so the arithmetic is
   * exact; dollars only ever appear at the edges, on the way to the screen. */

  var PEOPLE = [
    {
      id: '204', name: 'Robin', tenure: 'New this month',
      seed: [],
    },
    {
      id: '118', name: 'Sam', tenure: 'Six months in',
      seed: [
        ['initial', 5000, 40], ['gift', 10000, 32], ['purchase', -1275, 30],
        ['purchase', -850, 26], ['gift', 5000, 24], ['purchase', -4500, 20],
        ['gift', 6250, 16], ['purchase', -2200, 14], ['purchase', -6000, 10],
        ['gift', 5000, 7], ['purchase', -3500, 4], ['purchase', -4500, 1],
      ],
    },
    {
      id: '377', name: 'Alex', tenure: 'Two years in',
      seed: [
        ['initial', 8000, 96], ['gift', 10000, 88], ['purchase', -8500, 84],
        ['gift', 10000, 76], ['purchase', -4250, 71], ['gift', 15000, 64],
        ['purchase', -12000, 60], ['purchase', -6600, 53], ['gift', 10000, 47],
        ['purchase', -9500, 41], ['gift', 10000, 35], ['purchase', -3800, 30],
        ['gift', 10000, 24], ['purchase', -11000, 19], ['gift', 15000, 14],
        ['purchase', -7400, 11], ['purchase', -8800, 6], ['gift', 10000, 3],
        ['purchase', -4500, 1],
      ],
    },
  ];

  var KIND_LABEL = {
    initial: 'Opening balance',
    gift: 'Gift card',
    purchase: 'Purchase',
  };

  var DAILY = [
    '✨ Have a nice shift!',
    '🥐 Eat well today.',
    '🍞 Fully fuelled — thanks for today.',
    '🥖 Long shift. Remember to refuel.',
    '🍰 Take a break, have something sweet.',
  ];

  /* Balance zero can't say "fully fuelled". This set doesn't nag and doesn't
   * make the empty state feel like a failure. */
  var DAILY_ZERO = [
    '🥯 A gift card turns into credit here.',
    '🍞 Empty for now — go get them.',
    '✨ The next card you get shows up here.',
    '🥐 No credit yet. Today still goes fine.',
    '🧈 Empty is fine too. Thanks for today.',
  ];

  /* ---------------------------------------------------------------- helpers */

  var $ = function (id) { return document.getElementById(id); };
  var money = function (cents) { return (cents / 100).toFixed(2); };
  var reduced = function () {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  function daysAgoIso(days) {
    return new Date(Date.now() - days * 86400000).toISOString();
  }

  function makeEntries(seed) {
    var id = 0;
    return seed.map(function (row) {
      id += 1;
      return { id: id, kind: row[0], cents: row[1], at: daysAgoIso(row[2]) };
    });
  }

  /* Balance is the sum of the ledger; lifetime counts only what came in.
   * Two different questions, deliberately answered from the same rows. */
  function balanceOf(person) {
    return person.entries.reduce(function (sum, e) { return sum + e.cents; }, 0);
  }
  function lifetimeOf(person) {
    return person.entries.reduce(function (sum, e) {
      return e.cents > 0 ? sum + e.cents : sum;
    }, 0);
  }
  function collectedCount(person) {
    return Math.floor(lifetimeOf(person) / PER_PASTRY_CENTS);
  }

  /* ---------------------------------------------------------------- state */

  function freshState() {
    var people = {};
    PEOPLE.forEach(function (p) {
      people[p.id] = { id: p.id, name: p.name, tenure: p.tenure, entries: makeEntries(p.seed) };
    });
    return { active: '118', people: people, steps: {}, nextId: 1000 };
  }

  var state;
  try {
    var saved = window.localStorage.getItem(STORE_KEY);
    state = saved ? JSON.parse(saved) : freshState();
    /* A stored shape from an older build would render as a broken page; start over. */
    if (!state || !state.people || !state.people[state.active]) state = freshState();
  } catch (err) {
    state = freshState();
  }

  function save() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (err) { /* private mode */ }
  }

  var current = function () { return state.people[state.active]; };

  /* ---------------------------------------------------------------- particles
   * Pixel squares, straight onto the body, outside any framework's idea of state. */

  /* Live particles with a wall-clock deadline each.
   *
   * Neither of the obvious cleanups is trustworthy on its own: a hidden tab
   * freezes the animation timeline, so `onfinish` never arrives, and it also
   * throttles timers. So the deadline is the authority, and we sweep whenever
   * we are about to add more or the page becomes visible again — the two moments
   * that decide whether anyone can actually see a stuck crumb. */
  var living = [];

  function sweepParticles(force) {
    var now = Date.now();
    living = living.filter(function (p) {
      if (!force && now < p.dieAt) return true;
      p.el.remove();
      return false;
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) sweepParticles(false);
  });

  function spawn(x, y, count, color, size, opts) {
    if (reduced()) return;
    sweepParticles(false);
    for (var i = 0; i < count; i += 1) {
      var el = document.createElement('div');
      el.className = 'particle';
      el.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + size + 'px;height:' + size + 'px;background:' + color;
      document.body.appendChild(el);

      var angle = opts.from + Math.random() * opts.arc;
      var dist = opts.distance * (0.5 + Math.random() * 0.8);
      var life = opts.duration + Math.random() * 250;
      var anim = el.animate([
        { transform: 'translate(0,0)', opacity: 1 },
        {
          transform: 'translate(' + Math.cos(angle) * dist + 'px,' +
            (Math.sin(angle) * dist + opts.gravity) + 'px) rotate(' + (Math.random() * 180 - 90) + 'deg)',
          opacity: 0,
        },
      ], { duration: life, easing: 'cubic-bezier(.2,.6,.4,1)' });

      living.push({ el: el, dieAt: Date.now() + life + 200 });
      anim.onfinish = anim.oncancel = (function (node) {
        return function () {
          node.remove();
          living = living.filter(function (p) { return p.el !== node; });
        };
      })(el);
    }
  }

  function crumbs(x, y, n) {
    spawn(x, y, n || 9, '#5C3A1D', 5, { from: Math.PI * 0.15, arc: Math.PI * 0.7, distance: 46, gravity: 70, duration: 650 });
  }
  function confetti(x, y) {
    var colors = ['#EFB63C', '#FFD97A', '#D97B34'];
    for (var i = 0; i < 3; i += 1) {
      spawn(x, y, 4, colors[i], 7, { from: -Math.PI * 0.9, arc: Math.PI * 0.8, distance: 64, gravity: -14, duration: 780 });
    }
  }
  function centreOf(el) {
    var b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }

  /* ---------------------------------------------------------------- pastry names */

  var nameTimer = null;

  function showName(slot, key) {
    hideName();
    var tip = document.createElement('span');
    tip.className = 'pastry-name';
    tip.innerHTML = Pixel.NAMES[key].zh + '<span class="en">' + Pixel.NAMES[key].en + '</span>';
    slot.appendChild(tip);
    nameTimer = window.setTimeout(hideName, NAME_MS);
  }
  function hideName() {
    if (nameTimer) { window.clearTimeout(nameTimer); nameTimer = null; }
    var open = document.querySelector('.pastry-name');
    if (open) open.remove();
  }

  function attachName(slot, key) {
    slot.addEventListener('click', function () { showName(slot, key); });
    slot.addEventListener('mouseenter', function () { showName(slot, key); });
    slot.addEventListener('mouseleave', hideName);
  }

  function pastryCanvas(key, size) {
    var c = document.createElement('canvas');
    Pixel.drawSprite(c, Pixel.SPRITES[key], size, 0);
    return c;
  }

  /* ---------------------------------------------------------------- toast */

  var toastTimer = null;
  function toast(text, isError) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    if (toastTimer) window.clearTimeout(toastTimer);
    var el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = text;
    $('phone').appendChild(el);
    toastTimer = window.setTimeout(function () { el.remove(); }, TOAST_MS);
  }

  /* ---------------------------------------------------------------- rendering */

  var lastBalance = null;   /* animation start for the rolling number */
  var rollFrame = null;     /* in-flight roll, so a new render can cancel it */

  /* Always cancel the previous roll first. Frames queued by requestAnimationFrame
   * survive whatever else happens — grant a card then immediately switch person,
   * or leave the tab and come back, and a late frame would otherwise repaint the
   * old balance over the new one. */
  function renderBalance(animate) {
    var person = current();
    var cents = balanceOf(person);
    var canvas = $('balance');
    var from = animate && lastBalance !== null ? lastBalance : cents;
    $('balance-text').textContent = '$' + money(cents);

    if (rollFrame !== null) { cancelAnimationFrame(rollFrame); rollFrame = null; }

    if (reduced() || from === cents) {
      Pixel.drawNumber(canvas, money(cents), 9, '#4a2f1b');
    } else {
      var startedAt = null;
      var step = function (ts) {
        if (startedAt === null) startedAt = ts;
        var p = Math.min((ts - startedAt) / 600, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        Pixel.drawNumber(canvas, ((from + (cents - from) * eased) / 100).toFixed(2), 9, '#4a2f1b');
        rollFrame = p < 1 ? requestAnimationFrame(step) : null;
      };
      rollFrame = requestAnimationFrame(step);
    }
    lastBalance = cents;
  }

  /* Deliberately only whole pastries and empty slots — never a half-drawn one in
   * progress. The tray shows what you have; the caption handles what's next. */
  function renderSlots(dropFrom) {
    var person = current();
    var filled = collectedCount(person);
    var total = Math.max(Math.ceil((filled + 1) / SLOTS_PER_ROW), 1) * SLOTS_PER_ROW;
    var box = $('slots');
    box.textContent = '';

    for (var i = 0; i < total; i += 1) {
      var slot = document.createElement('div');
      slot.className = 'slot';
      if (i < filled) {
        var key = Pixel.forSlot(person.id, i);
        slot.className = 'slot filled';
        slot.appendChild(pastryCanvas(key, 3));
        if (i >= dropFrom) {
          slot.classList.add('pop');
          slot.style.animationDelay = ((i - dropFrom) * 70) + 'ms';
        }
        attachName(slot, key);
      }
      box.appendChild(slot);
    }

    var next = Pixel.forSlot(person.id, filled);
    $('oven-caption').innerHTML = '';
    $('oven-caption').appendChild(pastryCanvas(next, 2));
    var label = document.createElement('span');
    label.innerHTML = '<b>' + Pixel.NAMES[next].en + '</b> is in the oven';
    $('oven-caption').appendChild(label);
  }

  function monthLabel(iso) {
    return new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'long' });
  }
  function whenLabel(iso) {
    var d = new Date(iso);
    var today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  }

  var logOpen = false;

  function renderLog() {
    var person = current();
    var rows = person.entries.slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    var shown = logOpen ? rows : rows.slice(0, 4);
    var list = $('quest-list');
    list.textContent = '';

    $('quest-title').textContent = 'Quest log · ' + (logOpen ? 'Everything' : 'Recent');
    $('quest-toggle').disabled = rows.length === 0;
    $('quest-toggle-label').innerHTML = (logOpen ? 'Collapse' : 'See all') + '<span class="chev">⌄</span>';
    $('quest').classList.toggle('open', logOpen);

    if (!rows.length) {
      var empty = document.createElement('p');
      empty.className = 'quest-empty';
      empty.textContent = 'Nothing yet — tap the button when you take something 🍞';
      list.appendChild(empty);
      return;
    }

    var lastMonth = null;
    shown.forEach(function (e) {
      if (logOpen) {
        var m = monthLabel(e.at);
        if (m !== lastMonth) {
          var h = document.createElement('p');
          h.className = 'quest-month';
          h.textContent = m;
          list.appendChild(h);
          lastMonth = m;
        }
      }
      var plus = e.cents > 0;
      var row = document.createElement('div');
      row.className = 'rec';
      row.innerHTML =
        '<span class="rec-diamond ' + (plus ? 'plus' : 'minus') + '"></span>' +
        '<span class="rec-amt num ' + (plus ? 'plus' : 'minus') + '">' +
        (plus ? '+' : '−') + '$' + money(Math.abs(e.cents)) + '</span>' +
        '<span class="rec-label">' + KIND_LABEL[e.kind] + '</span>' +
        '<span class="rec-time">' + whenLabel(e.at) + '</span>';
      list.appendChild(row);
    });
  }

  function renderDaily() {
    var zero = balanceOf(current()) <= 0;
    var pool = zero ? DAILY_ZERO : DAILY;
    $('daily').textContent = pool[new Date().getDate() % pool.length];
  }

  function renderHolder() {
    var person = current();
    $('holder-name').textContent = '👤 ' + person.name;
    $('holder-id').textContent = '#' + person.id;
  }

  function renderPeople() {
    var box = $('people');
    box.textContent = '';
    PEOPLE.forEach(function (p) {
      var stored = state.people[p.id];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'person';
      btn.setAttribute('aria-pressed', String(p.id === state.active));
      btn.appendChild(pastryCanvas(Pixel.forSlot(p.id, 0), 2));
      var who = document.createElement('span');
      who.className = 'who';
      who.innerHTML = '<span class="nm">' + p.name + ' &middot; #' + p.id + '</span>' +
        '<span class="meta">' + p.tenure + ' · ' + collectedCount(stored) + ' collected</span>';
      btn.appendChild(who);
      /* Purely visual — aria-pressed already tells assistive tech which is selected,
       * and without this every option would be read out with a tick. */
      var tick = document.createElement('span');
      tick.className = 'tick';
      tick.textContent = '✓';
      tick.setAttribute('aria-hidden', 'true');
      btn.appendChild(tick);
      btn.addEventListener('click', function () { switchTo(p.id); });
      box.appendChild(btn);
    });
  }

  function renderSteps() {
    Array.prototype.forEach.call($('steps').children, function (li) {
      li.classList.toggle('done', Boolean(state.steps[li.dataset.step]));
    });
  }

  function markStep(name) {
    if (state.steps[name]) return;
    state.steps[name] = true;
    renderSteps();
    save();
  }

  function renderAll(opts) {
    var o = opts || {};
    renderHolder();
    renderBalance(Boolean(o.animateNumber));
    renderSlots(o.dropFrom === undefined ? collectedCount(current()) : o.dropFrom);
    renderLog();
    renderDaily();
    renderPeople();
  }

  /* ---------------------------------------------------------------- oven intro */

  function ovenIntro() {
    var existing = $('phone').querySelector('.oven');
    if (existing) existing.remove();
    if (reduced()) return;

    var el = document.createElement('div');
    el.className = 'oven';
    el.appendChild(pastryCanvas('laopo', 8));
    var t = document.createElement('p');
    t.className = 'oven-text';
    t.textContent = 'Today’s perks are out of the oven!';
    var s = document.createElement('p');
    s.className = 'oven-sub';
    s.textContent = 'tap to skip';
    el.appendChild(t);
    el.appendChild(s);
    $('phone').appendChild(el);

    var done = false;
    var dismiss = function () {
      if (done) return;
      done = true;
      el.classList.add('leaving');
      window.setTimeout(function () { el.remove(); }, 420);
    };
    el.addEventListener('click', dismiss);
    window.setTimeout(dismiss, 900);
  }

  /* ---------------------------------------------------------------- mascot bite */

  function biteMascot() {
    var canvas = $('mascot-canvas');
    var sprite = Pixel.SPRITES.laopo;
    var DEPTH = 0.55;

    var restore = function () {
      window.setTimeout(function () {
        Pixel.drawSprite(canvas, sprite, 3, 0);
        canvas.classList.remove('regrow');
        void canvas.offsetWidth;
        canvas.classList.add('regrow');
      }, 900);
    };

    if (reduced()) {
      Pixel.drawSprite(canvas, sprite, 3, DEPTH);
      restore();
      return;
    }

    var started = null;
    var step = function (ts) {
      if (started === null) started = ts;
      var p = Math.min((ts - started) / 240, 1);
      Pixel.drawSprite(canvas, sprite, 3, p * DEPTH);
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        var b = canvas.getBoundingClientRect();
        crumbs(b.left + b.width * 0.78, b.top + b.height * 0.3, 6);
        restore();
      }
    };
    requestAnimationFrame(step);
  }

  /* ---------------------------------------------------------------- actions */

  function addEntry(kind, cents) {
    state.nextId += 1;
    current().entries.push({ id: state.nextId, kind: kind, cents: cents, at: new Date().toISOString() });
    save();
  }

  function switchTo(id) {
    if (id === state.active) return;
    state.active = id;
    logOpen = false;
    lastBalance = null;
    save();
    renderAll({ dropFrom: 0 });
    ovenIntro();
    markStep('switch');
  }

  function grant(dollars) {
    var before = collectedCount(current());
    addEntry('gift', dollars * 100);
    var after = collectedCount(current());

    renderAll({ animateNumber: true, dropFrom: before });
    $('big-number').classList.remove('jump');
    void $('big-number').offsetWidth;
    $('big-number').classList.add('jump');

    if (after > before) {
      var slot = $('slots').children[after - 1];
      if (slot) {
        var c = centreOf(slot);
        window.setTimeout(function () { confetti(c.x, c.y); }, 220);
      }
      var key = Pixel.forSlot(current().id, after - 1);
      toast('$' + dollars + '.00 added — ' + Pixel.NAMES[key].en + ' came out of the oven!');
    } else {
      toast('$' + dollars + '.00 added to ' + current().name + '’s credit');
    }
    markStep('grant');
  }

  function spend(cents) {
    var before = balanceOf(current());
    if (cents > before) {
      return 'Only $' + money(before) + ' left';
    }
    var pastriesBefore = collectedCount(current());
    addEntry('purchase', -cents);

    renderAll({ animateNumber: true, dropFrom: pastriesBefore });
    $('big-number').classList.remove('dip');
    void $('big-number').offsetWidth;
    $('big-number').classList.add('dip');

    biteMascot();
    toast('$' + money(cents) + ' taken off — the shelf keeps every pastry 🍞');
    markStep('spend');
    return null;
  }

  /* ---------------------------------------------------------------- amount sheet */

  function openSheet() {
    var typed = '';
    var scrim = document.createElement('div');
    scrim.className = 'sheet-scrim';
    scrim.innerHTML =
      '<div class="sheet" role="dialog" aria-label="Enter the amount">' +
      '<h3>What did you take?</h3>' +
      '<p class="avail">The cashier prices it. Available: $' + money(balanceOf(current())) + '</p>' +
      '<p class="amount" id="amt"><span class="cur">$</span><span id="amt-val">0.00</span></p>' +
      '<div class="keys" id="keys"></div>' +
      '<p class="sheet-err" id="sheet-err"></p>' +
      '<div class="sheet-actions">' +
      '<button type="button" class="btn-cancel" id="sheet-cancel">Cancel</button>' +
      '<button type="button" class="btn-confirm" id="sheet-ok" disabled>Confirm</button>' +
      '</div></div>';
    $('phone').appendChild(scrim);

    var valueCents = function () { return typed === '' ? 0 : parseInt(typed, 10); };

    var paint = function () {
      $('amt-val').textContent = money(valueCents());
      var over = valueCents() > balanceOf(current());
      $('amt').classList.toggle('over', over);
      $('sheet-ok').disabled = valueCents() <= 0 || over;
      $('sheet-err').textContent = over ? 'That’s more than the balance' : '';
    };

    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];
    keys.forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'key';
      b.textContent = k;
      b.addEventListener('click', function () {
        if (k === 'C') typed = '';
        else if (k === '⌫') typed = typed.slice(0, -1);
        else if (typed.length < 5) typed = (typed + k).replace(/^0+/, '');
        paint();
      });
      $('keys').appendChild(b);
    });

    var close = function () { scrim.remove(); };
    scrim.addEventListener('click', function (e) { if (e.target === scrim) close(); });
    $('sheet-cancel').addEventListener('click', close);
    $('sheet-ok').addEventListener('click', function () {
      var err = spend(valueCents());
      if (err) { $('sheet-err').textContent = err; return; }
      close();
    });
    paint();
  }

  /* ---------------------------------------------------------------- page chrome */

  function renderWordmark() {
    var c = $('wordmark');
    Pixel.drawText(c, 'CRUMB', 11, '#4a2f1b');
  }

  function renderCardIcons() {
    var sets = {
      'icons-keep': ['laopo', 'tart', 'bolo'],
      'icons-hide': ['charsiu'],
      'icons-vary': ['mochi', 'walnut', 'mango', 'taro'],
    };
    Object.keys(sets).forEach(function (id) {
      var box = $(id);
      sets[id].forEach(function (key) { box.appendChild(pastryCanvas(key, 3)); });
    });
  }

  function renderCabinet() {
    var box = $('cabinet');
    var limited = {};
    Pixel.LIMITED.forEach(function (k) { limited[k] = true; });
    Pixel.CYCLE.concat(Pixel.LIMITED).forEach(function (key) {
      var slot = document.createElement('div');
      slot.className = 'slot filled' + (limited[key] ? ' limited' : '');
      slot.appendChild(pastryCanvas(key, 3));
      attachName(slot, key);
      box.appendChild(slot);
    });
  }

  /* ---------------------------------------------------------------- wiring */

  renderWordmark();
  renderCardIcons();
  renderCabinet();
  Pixel.drawSprite($('mascot-canvas'), Pixel.SPRITES.laopo, 3, 0);

  renderAll({ dropFrom: 0 });
  renderSteps();
  ovenIntro();

  Array.prototype.forEach.call(document.querySelectorAll('[data-grant]'), function (btn) {
    btn.addEventListener('click', function () { grant(parseInt(btn.dataset.grant, 10)); });
  });

  $('spend').addEventListener('click', function () {
    if (balanceOf(current()) <= 0) {
      toast('No credit to spend yet — grant a card first', true);
      return;
    }
    openSheet();
  });

  $('quest-toggle').addEventListener('click', function () {
    logOpen = !logOpen;
    renderLog();
  });

  $('mascot').addEventListener('click', function (e) {
    var el = e.currentTarget;
    el.classList.remove('crack');
    void el.offsetWidth;
    el.classList.add('crack');
    var c = centreOf(el);
    crumbs(c.x, c.y);
  });

  $('reset').addEventListener('click', function () {
    state = freshState();
    logOpen = false;
    lastBalance = null;
    save();
    renderAll({ dropFrom: 0 });
    renderSteps();
    ovenIntro();
    toast('Demo reset');
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var scrim = document.querySelector('.sheet-scrim');
      if (scrim) scrim.remove();
      hideName();
    }
  });
})();
