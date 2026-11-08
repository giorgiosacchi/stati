# Terra 3D — Atlante fisico + CIA World Factbook

**Versione 3.1** — Globo terrestre interattivo, fisico e satellitare, con zoom avanzato, confini nazionali, selezione degli Stati e schede informative del CIA World Factbook (archivio storico).

## Pubblicazione GitHub Pages (operazione iniziale)

Il progetto è già caricato nel ramo `main` e comprende un workflow GitHub Actions per la pubblicazione automatica. Poiché questo repository è nuovo, il proprietario deve **attivare una volta GitHub Pages**:

1. Aprire **[Settings → Pages](https://github.com/giorgiosacchi/stati/settings/pages)**.
2. Alla voce **Build and deployment → Source** scegliere **GitHub Actions**.
3. Aprire **Actions → Pubblica Terra 3D su GitHub Pages**, selezionare **Run workflow**, ramo **main**.
4. Dopo che il workflow ha esito positivo, aprire **https://giorgiosacchi.github.io/stati/** con Chrome su Android.
5. Nel menu di Chrome (⋮) scegliere **Installa app** oppure usare il comando **Installa** nell'atlante.

Se l'opzione GitHub Actions non è disponibile, scegliere **Deploy from a branch → main → /(root) → Save**; in questo caso il sito viene servito direttamente dal ramo `main` e non serve eseguire il workflow.

## Contenuto

- Cartografia fisica e satellitare offline (texture WebP 4096×2048, distribuite in piccoli blocchi statici).
- Possibilità di attivare la cartografia NASA HD online.
- Rotazione, zoom, ricerca degli Stati, confini politici, selezione sul globo.
- Riquadro **Posizione selezionata** cliccabile per aprire la scheda del Paese.
- Schede CIA Factbook con **una sola bandiera**, indicatori sintetici e sezioni approfondite, richiudibili per tornare al globo.
- Manifest PWA, icone PNG, service worker e cache offline.

**Nota sulle fonti:** il CIA World Factbook è stato chiuso nel febbraio 2026; i dati provengono da un archivio della sua ultima edizione, non da un servizio aggiornato in tempo reale. Le schede richiedono connettività al primo caricamento.

**Nota tecnica:** le texture cartografiche sono distribuite in 31 file di testo Base64, ricomposti automaticamente dal browser. Per questo è necessario aprire il progetto tramite un server HTTP(S), come GitHub Pages, anziché il file `index.html` isolato.
