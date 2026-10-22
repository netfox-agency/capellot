/* ============================================================
   Landings Ent. CAPELLOT (couvreur, Mouchès, Gers)
   - capture gclid / utm_* pour rattacher chaque lead à sa campagne
   - envoi Web3Forms (FormData obligatoire : le JSON déclenche un
     preflight CORS que Web3Forms refuse)
   - événements dataLayer : generate_lead, phone_call, form_start
   - la page s'identifie via <body data-lp="..."> (service + zone)
   ============================================================ */
(function () {
  'use strict';

  var dl = (window.dataLayer = window.dataLayer || []);
  var STORE = 'lp_capellot_src';
  var LP = document.body.getAttribute('data-lp') || 'landing_capellot';

  /* ---------- 1. Traçabilité Google Ads ---------- */
  var params = new URLSearchParams(window.location.search);
  var src = {
    gclid: params.get('gclid') || params.get('wbraid') || params.get('gbraid') || '',
    source: params.get('utm_source') || '',
    campagne: params.get('utm_campaign') || '',
    mot_cle: params.get('utm_term') || params.get('keyword') || ''
  };
  /* On garde la source d'origine même si le visiteur revient plus tard sans paramètres. */
  try {
    if (src.gclid || src.source || src.campagne) {
      sessionStorage.setItem(STORE, JSON.stringify(src));
    } else {
      var saved = sessionStorage.getItem(STORE);
      if (saved) src = JSON.parse(saved);
    }
  } catch (e) { /* navigation privée : on continue sans mémoriser */ }

  /* Origine lisible pour l'e-mail : l'artisan doit comprendre d'où vient le
     contact sans rien connaître à Google Ads. */
  function origine() {
    if (src.gclid) return 'Annonce Google';
    if (src.source) return src.source + (src.campagne ? ' · ' + src.campagne : '');
    return document.referrer ? 'Lien depuis un autre site' : 'Visite directe';
  }
  var PAGE = document.body.getAttribute('data-page') || '';

  /* ---------- 2. Conversion Google Ads ---------- */
  /* Deux actions distinctes : ADS_CONVERSION (devis) et ADS_CONVERSION_APPEL. */
  function sendTo(id) {
    if (typeof window.gtag === 'function' && id && id.indexOf('XXXX') === -1) {
      window.gtag('event', 'conversion', { send_to: id });
    }
  }
  function reportConversion(type) {
    sendTo(window.ADS_CONVERSION || '');
    dl.push({ event: type, form_location: LP });
  }

  /* ---------- 3. Clic téléphone ---------- */
  document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
    a.addEventListener('click', function () {
      dl.push({ event: 'phone_call', link_url: a.getAttribute('href'), form_location: LP });
      sendTo(window.ADS_CONVERSION_APPEL || window.ADS_CONVERSION || '');
    });
  });

  /* 0612345678, +33 6… → « 06 12 34 56 78 », lisible et cliquable dans l'e-mail. */
  function telLisible(t) {
    var d = t.replace(/\D/g, '');
    if (d.indexOf('33') === 0 && d.length === 11) d = '0' + d.slice(2);
    return d.length === 10 ? d.replace(/(\d{2})(?=\d)/g, '$1 ') : t;
  }

  /* ---------- 4. Formulaires (haut de page et bas de page) ---------- */
  var started = false;
  document.querySelectorAll('form.js-devis').forEach(function (form) {
    form.addEventListener('input', function (ev) {
      if (ev.target.name === 'tel') ev.target.setCustomValidity('');
      if (started) return;
      started = true;
      dl.push({ event: 'form_start', form_location: LP });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var success = form.querySelector('.form-success');
      var error = form.querySelector('.form-error');
      var btn = form.querySelector('button[type="submit"]');
      success.style.display = 'none';
      error.style.display = 'none';

      var telEl = form.querySelector('[name="tel"]');
      var chiffres = telEl.value.replace(/\D/g, '');
      telEl.setCustomValidity(chiffres.length >= 10 ? '' :
        'Indiquez un numéro complet (10 chiffres) pour être rappelé.');
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var key = form.querySelector('[name="access_key"]').value;
      if (!key || key.indexOf('REMPLACER') !== -1) {
        error.style.display = 'block';
        return;
      }

      /* L'e-mail reçu par l'artisan : un objet qui dit tout, puis les champs
         en français, dans l'ordre où on les lit. Rien de technique. */
      function val(n) {
        var el = form.querySelector('[name="' + n + '"]');
        return el ? el.value.trim() : '';
      }
      var commune = val('ville');
      var besoin = val('besoin');
      var data = new FormData();
      data.append('access_key', key);
      data.append('botcheck', form.querySelector('[name="botcheck"]').checked ? '1' : '');
      data.append('subject', 'Demande de devis · ' + (besoin || 'Toiture') + ' · ' + commune);
      data.append('from_name', 'Site Ent. CAPELLOT');
      data.append('Nom', val('nom'));
      data.append('Téléphone', telLisible(val('tel')));
      data.append('Commune', commune);
      data.append('Besoin', besoin);
      if (val('message')) data.append('Précisions', val('message'));
      data.append('Page', PAGE);
      data.append('Origine', origine());
      if (src.gclid) data.append('Référence Google Ads', src.gclid);

      btn.disabled = true;
      var label = btn.textContent;
      btn.textContent = 'Envoi en cours…';

      fetch('https://api.web3forms.com/submit', {
        method: 'POST', body: data, headers: { Accept: 'application/json' }
      })
        .then(function (r) { return r.json(); })
        .then(function (json) {
          if (json.success) {
            form.reset();
            form.classList.add('is-sent');
            success.style.display = 'block';
            reportConversion('generate_lead');
            success.scrollIntoView({ block: 'center', behavior: 'smooth' });
          } else {
            error.style.display = 'block';
          }
        })
        .catch(function () { error.style.display = 'block'; })
        .finally(function () { btn.disabled = false; btn.textContent = label; });
    });
  });

  /* ---------- 5. Année ---------- */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
