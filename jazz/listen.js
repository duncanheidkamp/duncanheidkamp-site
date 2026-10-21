/* ============================================================
   Ears Wide Open — listening page
   Builds the scroll from /jazz/tracks.json (the "database"):
   lesson → its recordings → next lesson …
   One YouTube player is shared by the whole page.
   ============================================================ */
(function () {
  'use strict';

  var DATA_URL = '/jazz/tracks.json';
  var STORE_KEY = 'ewo:last';
  var FOCUS_DELAY = 4000;

  var course = document.getElementById('course');
  var playerEl = document.querySelector('.player');
  var pTitle = playerEl.querySelector('.player-title');
  var pArtist = playerEl.querySelector('.player-artist');
  var pToggle = playerEl.querySelector('.pc-toggle');
  var progressFill = document.querySelector('.progress-fill');

  var tracksById = {};
  var rooms = {};          // id -> section element
  var yt = null;           // YT.Player
  var ytReady = false;
  var pendingId = null;    // play requested before API ready
  var currentId = null;
  var isPlaying = false;
  var focusTimer = null;
  var visibleId = null;    // room most in view

  // ── storage (best effort) ──────────────────────────────────
  function save(id) { try { localStorage.setItem(STORE_KEY, id); } catch (e) {} }
  function load() { try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; } }

  // ── build ──────────────────────────────────────────────────
  fetch(DATA_URL)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(build)
    .catch(function () {
      course.innerHTML = '<div class="col noscript"><p>The music didn’t load. Try refreshing, or read <a href="/jazz/ears-wide-open.pdf">the field guide as a PDF</a>.</p></div>';
    });

  function build(data) {
    var tplLesson = document.getElementById('tpl-lesson');
    var tplTrack = document.getElementById('tpl-track');
    var total = data.tracks.length;
    var n = 0;
    var frag = document.createDocumentFragment();

    data.lessons.forEach(function (lesson) {
      var l = tplLesson.content.firstElementChild.cloneNode(true);
      l.id = 'lesson-' + lesson.id;
      l.querySelector('.num').textContent = String(lesson.id).padStart(2, '0');
      l.querySelector('.kicker').textContent = lesson.kicker;
      l.querySelector('h2').textContent = lesson.title;
      l.querySelector('.dek').textContent = lesson.dek;
      var body = l.querySelector('.body');
      lesson.body.forEach(function (p) {
        var el = document.createElement('p');
        el.textContent = p;
        body.appendChild(el);
      });
      frag.appendChild(l);

      data.tracks.filter(function (t) { return t.lesson === lesson.id; }).forEach(function (t) {
        n += 1;
        tracksById[t.id] = t;
        var s = tplTrack.content.firstElementChild.cloneNode(true);
        s.id = 'track-' + t.id;
        s.dataset.id = t.id;
        s.dataset.index = n;
        s.querySelector('.room-count').textContent = 'Lesson ' + lesson.id + ' · ' + n + ' of ' + total;
        s.querySelector('.card-artist').textContent = t.artist + ' · ' + t.year;
        s.querySelector('.card-title').textContent = t.title;
        s.querySelector('.card-listen').textContent = t.listen_for;

        var yl = s.querySelector('.yt-link');
        if (t.youtube_id) {
          yl.href = 'https://www.youtube.com/watch?v=' + t.youtube_id;
        } else {
          yl.remove();
          s.querySelector('.play').disabled = true;
          s.querySelector('.play-text').textContent = 'Link coming';
        }

        var a = t.art || {};
        var img = s.querySelector('img');
        img.alt = (a.title || '') + (a.artist ? ', ' + a.artist : '');
        img.addEventListener('load', function () { img.classList.add('loaded'); });
        img.addEventListener('error', function onErr() {
          img.removeEventListener('error', onErr);
          if (a.image_original && img.src !== a.image_original) img.src = a.image_original;
        });
        img.src = a.image_url || '';

        var artLink = s.querySelector('.card-art a');
        artLink.href = a.page_url || '#';
        artLink.textContent = (a.artist ? a.artist + ', ' : '') + (a.title || '') + (a.date ? ' (' + a.date + ')' : '') + (a.museum ? ' — ' + a.museum : '');
        s.querySelector('.pairing').textContent = a.pairing || '';

        s.querySelector('.play').addEventListener('click', function () { onPlayClick(t.id); });
        rooms[t.id] = s;
        frag.appendChild(s);
      });
    });

    course.appendChild(frag);
    observe();
    showResume();
    loadYouTubeAPI();
  }

  // ── resume ─────────────────────────────────────────────────
  function showResume() {
    var last = load();
    var t = last && tracksById[last];
    var btn = document.querySelector('.resume');
    if (!t || !rooms[last] || rooms[last].dataset.index === '1') return;
    btn.textContent = 'Pick up where you left off: ' + t.title;
    btn.href = '#track-' + last;
    btn.hidden = false;
  }

  // ── which room is in view / progress ───────────────────────
  function observe() {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && e.intersectionRatio >= 0.55) {
          visibleId = e.target.dataset.id;
          save(visibleId);
          scheduleFocus();
        } else if (e.target.dataset.id === visibleId && e.intersectionRatio < 0.55) {
          visibleId = null;
          clearFocus();
        }
      });
    }, { threshold: [0, 0.55, 1] });
    Object.keys(rooms).forEach(function (id) { io.observe(rooms[id]); });

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        progressFill.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + '%';
        ticking = false;
      });
    }, { passive: true });
  }

  // ── focus mode: fade the words while the music plays ───────
  function clearFocus() {
    clearTimeout(focusTimer);
    Object.keys(rooms).forEach(function (id) { rooms[id].classList.remove('is-focus'); });
  }
  function scheduleFocus() {
    clearFocus();
    if (!isPlaying || !currentId || visibleId !== currentId) return;
    focusTimer = setTimeout(function () {
      if (isPlaying && visibleId === currentId) rooms[currentId].classList.add('is-focus');
    }, FOCUS_DELAY);
  }
  ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, function () {
      if (currentId && rooms[currentId] && rooms[currentId].classList.contains('is-focus')) scheduleFocus();
    }, { passive: true });
  });

  // ── YouTube ────────────────────────────────────────────────
  function loadYouTubeAPI() {
    window.onYouTubeIframeAPIReady = function () {
      yt = new YT.Player('yt', {
        width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: function () {
            ytReady = true;
            if (pendingId) { var id = pendingId; pendingId = null; start(id); }
          },
          onStateChange: onState,
          onError: function () {
            if (currentId) {
              var b = rooms[currentId].querySelector('.play-text');
              b.textContent = 'Won’t play here';
            }
          }
        }
      });
    };
    var s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    document.head.appendChild(s);
  }

  function onPlayClick(id) {
    if (id === currentId && yt && ytReady) {
      var st = yt.getPlayerState();
      if (st === YT.PlayerState.PLAYING || st === YT.PlayerState.BUFFERING) yt.pauseVideo();
      else yt.playVideo();
      return;
    }
    if (!ytReady) { pendingId = id; showPlayer(id); return; }
    start(id);
  }

  function start(id) {
    var t = tracksById[id];
    if (!t || !t.youtube_id) return;
    if (currentId && rooms[currentId]) setRoomState(currentId, false);
    currentId = id;
    showPlayer(id);
    yt.loadVideoById(t.youtube_id);
  }

  function showPlayer(id) {
    var t = tracksById[id];
    pTitle.textContent = t.title;
    pArtist.textContent = t.artist;
    playerEl.classList.remove('is-off');
    document.body.classList.add('has-player');
  }

  function setRoomState(id, playing, ended) {
    var r = rooms[id];
    if (!r) return;
    r.classList.toggle('is-playing', !!playing);
    var label = r.querySelector('.play-text');
    label.textContent = playing ? 'Pause' : (ended ? 'Play again' : (id === currentId ? 'Resume' : 'Play'));
    if (!playing) r.classList.remove('is-focus');
  }

  function onState(e) {
    var S = YT.PlayerState;
    if (!currentId) return;
    if (e.data === S.PLAYING) {
      isPlaying = true;
      pToggle.textContent = 'Pause';
      pToggle.setAttribute('aria-label', 'Pause');
      setRoomState(currentId, true);
      scheduleFocus();
    } else if (e.data === S.PAUSED || e.data === S.ENDED) {
      isPlaying = false;
      pToggle.textContent = 'Play';
      pToggle.setAttribute('aria-label', 'Play');
      setRoomState(currentId, false, e.data === S.ENDED);
      clearFocus();
    }
  }

  // ── mini player controls ───────────────────────────────────
  pToggle.addEventListener('click', function () {
    if (!yt || !ytReady) return;
    if (isPlaying) yt.pauseVideo(); else yt.playVideo();
  });
  playerEl.querySelector('.pc-find').addEventListener('click', function () {
    if (currentId && rooms[currentId]) rooms[currentId].scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  playerEl.querySelector('.pc-close').addEventListener('click', function () {
    if (yt && ytReady) yt.stopVideo();
    if (currentId) setRoomState(currentId, false);
    isPlaying = false;
    currentId = null;
    pendingId = null;
    clearFocus();
    playerEl.classList.add('is-off');
    document.body.classList.remove('has-player');
  });
  document.querySelectorAll('.to-top').forEach(function (a) {
    a.addEventListener('click', function (ev) { ev.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  });
})();
