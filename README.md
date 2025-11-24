# Visualizador de Cobertura Móvel e Energia

Mapa interativo para avaliar a conectividade dos Agentes Bancários (AB) em Angola, combinando cobertura móvel (Unitel & Africell, via tiles nPerf) com condição de energia (stable / unstable / offgrid). Construído em Leaflet, corre 100% no browser (client-side).

**Demo:** [Coverage viewer](https://hacktivism-github.github.io/https-hacktivism-github.github.io-banking-agents-connectivity/coverage_viewer.html)

Criada com [Leaflet.js](https://leafletjs.com/), a ferramenta permite alternar entre camadas de cobertura do operador (3G, 4G [LTE] e 5G) e sobrepor ficheiros CSV com coordenadas de agentes.

## O que faz:

* **Sobrepõe cobertura de operadores** (Unitel & Africell) através de tiles **nPerf** (3G/4G/5G), com aspeto consistente com o nPerf.
* **Carrega CSV** de Agentes (drag-and-drop ou input) e coloca markers no mapa.
* **Carrega um GeoJSON de Energia** (polígonos) para representar a condição da rede elétrica: stable, unstable, offgrid.
* **Classifica cada agente (A–D)** cruzando coverage e grid status:
  * **A** — energia **stable** + cobertura **4G/5G**
  * **B / B* ** — energia **stable/unstable/unknown** + cobertura **2G/3G/4G** (**B* ** quando a cobertura está por confirmar/omissa)
  * **C** — offgrid (requer VSAT/LEO + solar)
   * **D** — comunitária/mesh (acesso partilhado / energia híbrida)
* **Exporta resultados para CSV** (limpo, cabeçalhos mínimos) ou **GeoJSON** para relatórios e follow-up.

## Features

- Toggle Unitel and Africell 3G, 4G(LTE) and 5G coverage layers (nPerf).

- Adjustable coverage opacity for easier visualization.

- Load CSV of Banking Agents (columns: latitude, longitude, nome).

- Works entirely client-side — no server dependency, just open in browser.

- Deployable via GitHub Pages for demos & reports.
