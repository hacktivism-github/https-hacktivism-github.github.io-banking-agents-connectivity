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

**1.** Aponte o seu navegador para [Coverage viewer](https://hacktivism-github.github.io/https-hacktivism-github.github.io-banking-agents-connectivity/coverage_viewer.html)

**2.** Ligue/desligue Unitel/Africell e ajuste a opacidade dos tiles.

**3.** Carregue o CSV dos Agentes.

**Campos mínimos:**
   * latitude, longitude, nome
     (auto-deteta variantes: lat, lon/lng, name/displayName, etc.)

**4.** (Opcional) Carregue o GeoJSON de Energia para ativar a classificação por zonas.

**5.** Clique sobre Classificar Zona (A-D) → depois Exportar CSV ou Exportar GeoJSON.

## Dados de entrada
### 1) CSV (locais)

**Campos mínimos**

   * __latitude, longitude, nome__

**Campos opcionais** (se os tiver)

coverage_best → um de: NONE, 2G, 3G, 4G, 5G

unitel_best, africell_best → se coverage_best vier vazio, é derivado escolhendo o melhor entre unitel_best e africell_best (5G > 4G > 3G > 2G > NONE)

**Nota:** como os tiles nPerf são apenas visuais (o viewer não “lê píxeis”), para maior rigor defina coverage_best no CSV.

**Exemplo mínimo**
```
nome,latitude,longitude,coverage_best
Local A,-8.839,13.234,5G
Local B,-12.305,19.110,4G
Local C,-16.730,13.480,3G
```

### 2) GeoJSON (Energia)

Usa grid_status nas properties: stable, unstable, offgrid.
Coordenadas em [lon, lat].

```
{
  "type": "FeatureCollection",
  "features": [
    {
      "type":"Feature",
      "properties": { "grid_status":"stable", "name":"Noroeste", "updated_at":"2025-09-17" },
      "geometry": { "type":"Polygon", "coordinates":[ [[12.0,-7.0],[15.5,-7.0],[15.5,-14.0],[12.0,-14.0],[12.0,-7.0]] ] }
    },
    {
      "type":"Feature",
      "properties": { "grid_status":"offgrid", "name":"Leste/Sudeste" },
      "geometry": { "type":"Polygon", "coordinates":[ [[19.5,-8.0],[24.0,-8.0],[24.0,-18.0],[19.5,-18.0],[19.5,-8.0]] ] }
    }
  ]
}
```

## Como funciona a classificação (A–D)

**1. Energia:** teste ponto-no-polígono no GeoJSON de Energia → stable / unstable / offgrid / unknown.

**2. Cobertura:** normaliza coverage_best (ou deriva de unitel_best/africell_best).

**3. Regras:**
* offgrid → C
* stable + (4G ou 5G) → A
* (stable|unstable|unknown) + (2G|3G|4G) → B
* Sem cobertura definida → B*
  
**4. Clusters** herdam a cor da zona predominante dos markers internos.

**Legenda (círculos sobre os pins)**
🔴 __C__ | 🟡 __B__/__B*__ | 🟢 __A__ | 🔵 __D__


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
 
## Limitações

* __Tiles nPerf__ são apenas para visualização; não fazer scraping nem redistribuir dados. Respeitar os termos do nPerf.

* O viewer **não lê píxeis** dos tiles; para rigor por local, usar coverage_best no CSV (ou APIs/relatórios dos operadores).

* Polígonos de energia são **aproximações** salvo se alimentados com dados de rede (subestações, feeders, etc.).

Para problemas de geocodificação no CSV, verificar separador decimal (. vs ,) e nomes de colunas.

## Créditos & licenças

* __Leaflet, Leaflet.markercluster, PapaParse__
* __OpenStreetMap__ (basemap) — manter a atribuição “[© OpenStreetMap contributors](https://www.openstreetmap.org/copyright/en)”
* __nPerf__ (tiles de cobertura) — uso visual apenas; sujeito a termos do nPerf.
* __Código-fonte:__ MIT - ver [LICENSE]([https://leafletjs.com/](https://github.com/hacktivism-github/https-hacktivism-github.github.io-banking-agents-connectivity/blob/main/LICENSE).

