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
  * __B / B*__ — energia **stable/unstable/unknown** + cobertura **2G/3G/4G** (__B*__ quando a cobertura está por confirmar/omissa)
  * **C** — offgrid (requer VSAT/LEO + solar)
  * **D** — comunitária/mesh (acesso partilhado / energia híbrida)
* **Exporta resultados para CSV** (limpo, cabeçalhos mínimos) ou **GeoJSON** para relatórios e follow-up.

## Arranque rápido

1. Apontes o seu navegador para [Coverage viewer](https://hacktivism-github.github.io/https-hacktivism-github.github.io-banking-agents-connectivity/coverage_viewer.html)

2. Liga/desliga Unitel / Africell e ajusta a opacidade dos tiles.

3. Carrega o CSV dos Agentes. Campos mínimos:

   * latitude, longitude, nome
     (auto-deteta variantes: lat, lon/lng, name/displayName, etc.)

4. (Opcional) Carrega o GeoJSON de Energia para ativar a classificação por zonas.

5. Clica Classificar → depois Exportar CSV ou Exportar GeoJSON.

## Interface

* **Painel superior direito**
* Mapa de Cobertura: 3G | 4G | 5G
   * Toggle **Unitel / Africell** (tiles nPerf)
   * __Opacidade__ da cobertura

* __Energia (GeoJSON)__
   * __Carregar GeoJSON, Limpar, Opacidade__

* __.CSV de agentes__
   * __Carregar CSV__ (ou drag-and-drop no mapa)
   * __Limpar pontos__
     
* __Classificar zonas__ (A–D)
   * __Mostrar/ocultar__ círculos de zona

* __Exportar CSV / GeoJSON__

* __Barra nPerf (canto inferior direito)__
   * “Last update — Unitel: …, Africell: …” + legendas 2G/3G/4G/5G

* __Legenda__ (canto inferior esquerdo)
   * Swatches de cor para camadas Unitel/Africell
