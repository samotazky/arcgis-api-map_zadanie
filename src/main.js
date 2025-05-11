import "./style.css";
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import Graphic from "@arcgis/core/Graphic";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import WMSLayer from "@arcgis/core/layers/WMSLayer.js";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer.js";
import LayerList from "@arcgis/core/widgets/LayerList.js";
import Point from "@arcgis/core/geometry/Point";
import Sketch from "@arcgis/core/widgets/Sketch";
import * as containsOperator from "@arcgis/core/geometry/operators/containsOperator.js";
import * as projection from "@arcgis/core/geometry/projection";

import "@arcgis/map-components/components/arcgis-scale-bar"
import "@arcgis/map-components/components/arcgis-legend";

/**WMS Layers */
const WMSGeologicalWells = new WMSLayer({
  url: "https://ags.geology.sk/arcgis/services/WebServices/VRTY/MapServer/WMSServer",
  visible: false,
  title: "Geologické vrty",
  copyright: "Register priestorových informácií: Štátny geologický ústav Dionýza Štúra Bratislava"
})

const WMSSurfaceWaterBodies = new WMSLayer({
  url: "https://geoserver.vuvh.sk/arcgis/services/INSPIRE/PD_WFDLakes/MapServer/WMSServer",
  visible: false,
  title: "Vodné plochy",
  copyright: "Register priestorových informácií: INSPIRE"
})

/**GeoJSON Layer */
const geoJsonLayer = new GeoJSONLayer({
  url: "/data/slovakia.geojson",
  copyright: "autor: github/drakh/slovakia-gps-data",
  visible: false,
  title: "GeoJSON: Slovenské Okresy",
  popupTemplate: {
    title: `Okres {NM3}`,
    content: "Vrstva GeoJSON"
  }
});

/**Poly layers */
const drawLayer = new GraphicsLayer({
  title: "Polygónová vrstva"
});
const resultLayer = new GraphicsLayer({
  title: "Vybrané body z WFS vrstvy environmentalna záťať"
});

/**BaseMap */
const map = new Map({
  basemap: "osm",
  layers: [geoJsonLayer, WMSSurfaceWaterBodies, WMSGeologicalWells, drawLayer, resultLayer,]
});
const view = new MapView({
  container: "viewDiv", // reference the div id
  map: map,
  zoom: 15,
  center: [19.145509841668428, 48.73548767519987],
});

/**ScaleBar */
const scaleBar = document.createElement("arcgis-scale-bar");

scaleBar.setAttribute("unit", "metric");
scaleBar.id = "scaleBar"

viewDiv.appendChild(scaleBar);

view.when(() => {
  scaleBar.view = view;
});

/**Legend */
const legend = document.createElement("arcgis-legend")
legend.id = "legend"

viewDiv.appendChild(legend)
legend.view = view;

view.when(() => {
  legend.view = view;
});

/**Polygon */
const createPoly = document.getElementById("create-poly")
const removePoly = document.getElementById("remove-poly")

const sketch = new Sketch({
  view: view,
  layer: drawLayer,
  creationMode: "single",
});

let allWFSPoints = []

const loadAllWFSPoints = () => {
  const wfsUrl = "https://arc.sazp.sk/arcgis/services/env_zataze/environmentalna_zataz/MapServer/WFSServer?" +
    "service=WFS&version=1.1.0&request=GetFeature&typename=env_zataze_environmentalna_zataz:EZ_ALL&" +
    "srsname=EPSG:4326";

  fetch(wfsUrl)
    .then(resp => resp.text())
    .then(xmlText => {
      const xmlDocs = new DOMParser().parseFromString(xmlText, "text/xml")
      allWFSPoints = xmlDocs.getElementsByTagName("gml:featureMember")
    });
}

const filterWFSPoints = async () => {
  await projection.load();

  const polygons = drawLayer.graphics
    .filter(graphic => graphic.geometry.type === "polygon")
    .map(graphic => graphic.geometry);

  const filteredPoints = [];

  for (let i = 0; i < allWFSPoints.length; i++) {
    const member = allWFSPoints[i];
    const gmlPos = member.getElementsByTagName("gml:pos")[0].textContent;
    const coords = gmlPos.split(" ");
    const lon = parseFloat(coords[1]); // longitude (X)
    const lat = parseFloat(coords[0]); // latitude (Y)

    const point = new Point({
      latitude: lat,
      longitude: lon,
      spatialReference: { wkid: 4326 }
    });

    const projectedPoint = projection.project(point, view.spatialReference);

    const inside = polygons.some(polygon => containsOperator.execute(polygon, projectedPoint));

    if (inside) {
      filteredPoints.push(projectedPoint);

      const name = member.getElementsByTagName("env_zataze_environmentalna_zataz:NAZOV")[0]?.textContent || "Neznámy názov";
      const priority = member.getElementsByTagName("env_zataze_environmentalna_zataz:PRIORITA")[0]?.textContent || "Neznámy typ"
      const urbClass = member.getElementsByTagName("env_zataze_environmentalna_zataz:URBANNAKLASIFIKACIA")[0]?.textContent || "Neznáma klasifikácia"

      const WFSPointSymbol = {
        type: "simple-marker",
        color: "red",
        size: "12px",
        outline: {
          color: "black",
          width: 1
        }
      };
      filteredPoints.forEach(pt => {
        const graphic = new Graphic({
          geometry: pt,
          symbol: WFSPointSymbol,
          popupTemplate: {
            title: name,
            content: `<strong>Priorita:</strong> ${priority} <br>
                      <strong>Urbánna klasifikácia:</strong> ${urbClass}`
          }
        });
        resultLayer.add(graphic);
      });
    }
  }
};

createPoly.addEventListener("click", () => {
  sketch.create("polygon")
  sketch.on("create", (e) => {
    if (e.state !== "complete") return;
    filterWFSPoints()
  });
})

removePoly.addEventListener("click", () => {
  drawLayer.removeAll();
  resultLayer.removeAll();
});
loadAllWFSPoints()

/**OverviewMap */
const overviewMap = new Map({
  basemap: "topo-vector"
});

const overviewView = new MapView({
  container: "overviewDiv",
  map: overviewMap,
  constraints: {
    rotationEnabled: false,
    snapToZoom: false
  },
  ui: {
    components: []
  }
});

view.watch("extent", (newExtent) => {
  overviewView.extent = newExtent;
});

/**snpPoint */
const snpPointLayer = new GraphicsLayer({
  title: "Námestie SNP, Banská Bystrica"
});
map.add(snpPointLayer);

const snpPoint = {
  type: "point",
  longitude: 19.145509841668428,
  latitude: 48.73548767519987
};

const markerSymbol = {
  type: "simple-marker",
  color: "red",
  size: "12px",
  outline: {
    color: [255, 255, 255],
    width: 1
  }
};

const pointGraphic = new Graphic({
  geometry: snpPoint,
  symbol: markerSymbol,
  attributes: {
    Name: "Námestie SNP, Banská Bystrica"
  },
  popupTemplate: {
    title: "{Name}",
    content: "Bod: {Name}"
  }
});

snpPointLayer.add(pointGraphic);

/**LayerList */
const layerList = new LayerList({
  view: view
});

view.ui.add(layerList, {
  position: "top-right"
});


/**Popup WMS*/
view.on("click", (e) => {
  const screenPoint = view.toScreen(e.mapPoint);

  if (WMSGeologicalWells.visible) {
    const { xmin, ymin, xmax, ymax, spatialReference: { latestWkid, wkid } } = view.extent;
    const bbox = `${xmin},${ymin},${xmax},${ymax}`;
    const crs = `EPSG:${latestWkid ?? wkid}`;
    const width = view.width;
    const height = view.height;

    const url = new URL(WMSGeologicalWells.featureInfoUrl);
    url.searchParams.set("SERVICE", "WMS");
    url.searchParams.set("VERSION", "1.3.0");
    url.searchParams.set("REQUEST", "GetFeatureInfo");
    url.searchParams.set("QUERY_LAYERS", "0,1");
    url.searchParams.set("INFO_FORMAT", "text/xml");
    url.searchParams.set("CRS", crs);
    url.searchParams.set("BBOX", bbox);
    url.searchParams.set("WIDTH", width);
    url.searchParams.set("HEIGHT", height);
    url.searchParams.set("I", Math.round(screenPoint.x));
    url.searchParams.set("J", Math.round(screenPoint.y));

    fetch(url)
      .then(resp => resp.text())
      .then(xmlText => {
        const xmlDocs = new DOMParser().parseFromString(xmlText, "text/xml")
        const fieldsElement = xmlDocs.getElementsByTagName("FIELDS")

        if (fieldsElement.length > 0) {
          const infoObject = {}

          for (let i = 0; i < fieldsElement[0].attributes.length; i++) {
            const attr = fieldsElement[0].attributes[i]
            infoObject[attr.name] = attr.value === "Null" ? null : attr.value
          }

          view.popup.open({
            title: "Informácie o vrte",
            location: e.mapPoint,
            content: infoObject["Účelvrtu-skupina"] !== undefined ?
              `<strong>Účel vrtu:</strong> ${infoObject["Účelvrtu-skupina"]}<br>
              <strong>Archivačné číslo správy:</strong> ${infoObject["Archívnečíslosprávy"]}<br>
            ` : infoObject["Typvrtu-popis"] !== undefined ?
                `<strong>Lokalita:</strong> ${infoObject["Lokalita"]}<br>
              <strong>Typ vrtu:</strong> ${infoObject["Typvrtu-popis"]}<br>
              <strong>Hĺbka vrtu:</strong> ${infoObject["Hĺbkavrtu"]} m<br>`
                : `<em>Údaje nie sú dostupné</em>`
          });
        }
      })
  }

  if (WMSSurfaceWaterBodies.visible) {
    const { xmin, ymin, xmax, ymax, spatialReference: { latestWkid, wkid } } = view.extent;
    const bbox = `${xmin},${ymin},${xmax},${ymax}`;
    const crs = `EPSG:${latestWkid ?? wkid}`;
    const width = view.width;
    const height = view.height;

    const url = new URL(WMSSurfaceWaterBodies.featureInfoUrl);
    url.searchParams.set("SERVICE", "WMS");
    url.searchParams.set("VERSION", "1.3.0");
    url.searchParams.set("REQUEST", "GetFeatureInfo");
    url.searchParams.set("QUERY_LAYERS", "LAKES");
    url.searchParams.set("INFO_FORMAT", "text/xml");
    url.searchParams.set("CRS", crs);
    url.searchParams.set("BBOX", bbox);
    url.searchParams.set("WIDTH", width);
    url.searchParams.set("HEIGHT", height);
    url.searchParams.set("I", Math.round(screenPoint.x));
    url.searchParams.set("J", Math.round(screenPoint.y));

    fetch(url)
      .then(resp => resp.text())
      .then(xmlText => {
        const xmlDocs = new DOMParser().parseFromString(xmlText, "text/xml")
        const fieldsElement = xmlDocs.getElementsByTagName("FIELDS")

        if (fieldsElement.length > 0) {
          const infoObject = {}

          for (let i = 0; i < fieldsElement[0].attributes.length; i++) {
            const attr = fieldsElement[0].attributes[i]
            infoObject[attr.name] = attr.value === "Null" ? null : attr.value
          }

          view.popup.open({
            title: "Informácie o vodnom diele",
            location: e.mapPoint,
            content: `<strong>Názov:</strong> ${infoObject.nameText}`
          });
        }
      })
  }
});
