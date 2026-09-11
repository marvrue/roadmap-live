/*
 * Live part of the page: fetches /data, listens on /events (Server-Sent
 * Events) and pushes every snapshot into RoadmapPage.
 */
(function () {
  'use strict';
  var connected = false;
  var t = window.RoadmapPage.t;
  var base = window.RoadmapPage.base;

  function showConnection() {
    var c = document.getElementById('conn');
    if (!c) return;
    c.className = 'conn ' + (connected ? 'on' : 'off');
    c.textContent = connected ? t('page.live') : t('page.disconnected');
  }

  function setConnected(on) {
    connected = on;
    showConnection();
  }

  window.RoadmapLive = { afterRender: showConnection };

  fetch(base + 'data').then(function (r) { return r.json(); }).then(function (snap) {
    window.RoadmapPage.setState(snap);
  }).catch(function () {});

  var es = new EventSource(base + 'events');
  es.onopen = function () { setConnected(true); };
  es.onerror = function () { setConnected(false); };
  es.addEventListener('update', function (e) {
    setConnected(true);
    window.RoadmapPage.setState(JSON.parse(e.data));
  });
})();
